// utils/notificationAudience.ts
//
// Helpers d'audience PARTAGÉS entre les dispatchers de notification (Web Push
// et Email). Tous lisent `bot_event_outbox` comme source de vérité unique et
// résolvent QUI doit recevoir un event donné :
//   - staff du tenant (+ pole admins cross-tenant)
//   - joueuses des 2 équipes d'un match
//   - casters assignés à un match
//
// Et le filtrage des préférences, channel-aware :
//   - PUSH = opt-OUT : absent = enabled. On ne SKIP que sur un opt-out explicite
//     (row notification_prefs channel='push' enabled=false).
//   - EMAIL = opt-IN : on n'envoie QUE si une row notification_prefs
//     channel='email' enabled=true existe explicitement.
//
// Extrait de pages/api/cron/web-push-dispatch.ts pour réutilisation par le
// dispatcher email — le comportement PUSH reste strictement identique.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export type OutboxRow = {
  id: number;
  event_id: string;
  event_name: string;
  tenant_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Charge les events outbox candidats à un dispatch, filtrés par event_name
 * (∈ `eventNames`) et par fenêtre temporelle glissante (`windowHours`).
 * Partagé Web Push / Email — chaque dispatcher passe sa propre liste blanche.
 */
export async function loadCandidateEvents(
  eventNames: readonly string[],
  windowHours: number,
  batchLimit: number,
  logPrefix = '[notificationAudience]'
): Promise<OutboxRow[]> {
  const cutoffIso = new Date(
    Date.now() - windowHours * 3_600_000
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('id, event_id, event_name, tenant_id, payload, created_at')
    .in('event_name', eventNames as readonly string[] as string[])
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(batchLimit);
  if (error) {
    logger.error(`${logPrefix} load candidates error`, error);
    return [];
  }
  return (data ?? []) as OutboxRow[];
}

/**
 * Pour un tenant donné, retourne la liste des auth_user_id staff candidats :
 *   - rows tenant_staff(tenant_id) → staff_id → staff.auth_user_id
 *   - rows staff(is_pole_admin=true) (cross-tenant)
 * Combinés et dédupliqués. Filtre soft-delete (is_active=false / deleted_at).
 */
export async function loadStaffUserIdsForTenant(
  tenantId: string
): Promise<string[]> {
  const userIds = new Set<string>();

  // 1. Staff scopés au tenant via tenant_staff.
  const { data: tsRows, error: tsErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id')
    .eq('tenant_id', tenantId);
  if (tsErr) {
    logger.error('[notificationAudience] tenant_staff load error', tsErr);
  }
  const staffIds = ((tsRows ?? []) as Array<{ staff_id: string }>).map(
    (r) => r.staff_id
  );

  // 2. Cross-tenant pole admins.
  const { data: poleRows, error: poleErr } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('is_pole_admin', true);
  if (poleErr) {
    logger.error('[notificationAudience] pole admins load error', poleErr);
  }
  for (const r of (poleRows ?? []) as Array<{ id: string }>) {
    if (!staffIds.includes(r.id)) staffIds.push(r.id);
  }

  if (staffIds.length === 0) return [];

  // 3. Resolve auth_user_id via la table staff (un seul query batché).
  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('id, auth_user_id, is_active, deleted_at')
    .in('id', staffIds);
  if (staffErr) {
    logger.error('[notificationAudience] staff resolve error', staffErr);
    return [];
  }
  for (const r of (staffRows ?? []) as Array<{
    id: string;
    auth_user_id: string | null;
    is_active?: boolean | null;
    deleted_at?: string | null;
  }>) {
    // Soft-delete filtering : un staff inactif/deleted ne reçoit plus de
    // notifications (cohérent avec utils/staff.ts:getStaffByUserId).
    if (r.is_active === false || r.deleted_at) continue;
    if (r.auth_user_id) userIds.add(r.auth_user_id);
  }
  return Array.from(userIds);
}

/**
 * Renvoie les auth user ids des joueuses des DEUX équipes d'un match.
 * Utilisé pour le fanout player des events match-related en plus du staff.
 *
 * Retourne un array vide si le match n'existe pas ou n'a pas d'équipes
 * (cas bye, match pas encore seedé, etc.) — bénin, pas d'audience player.
 */
export async function loadPlayerUserIdsForMatch(
  matchId: string
): Promise<string[]> {
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select('team1_id, team2_id')
    .eq('id', matchId)
    .maybeSingle();
  if (matchErr || !match) {
    if (matchErr) {
      logger.error(
        '[notificationAudience] loadPlayerUserIdsForMatch match err',
        matchErr
      );
    }
    return [];
  }
  const teamIds = [match.team1_id, match.team2_id].filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  );
  if (teamIds.length === 0) return [];

  const { data: members, error: memErr } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .in('team_id', teamIds);
  if (memErr) {
    logger.error(
      '[notificationAudience] loadPlayerUserIdsForMatch members err',
      memErr
    );
    return [];
  }
  const userIds = new Set<string>();
  for (const r of (members ?? []) as Array<{ user_id: string | null }>) {
    if (r.user_id) userIds.add(r.user_id);
  }
  return Array.from(userIds);
}

/**
 * Renvoie les auth_user_id des casters assignés à un match (cast_assignments
 * → cast_members actifs). Audience réduite pour les transitions de segment
 * match→live.
 */
export async function loadCasterUserIdsForMatch(
  matchId: string
): Promise<string[]> {
  const { data: assignments, error: assignErr } = await supabaseAdmin
    .from('cast_assignments')
    .select('cast_member_id')
    .eq('match_id', matchId);
  if (assignErr) {
    logger.error('[notificationAudience] cast_assignments load error', assignErr);
    return [];
  }
  const memberIds = ((assignments ?? []) as Array<{ cast_member_id: string }>)
    .map((r) => r.cast_member_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (memberIds.length === 0) return [];

  const { data: members, error: memErr } = await supabaseAdmin
    .from('cast_members')
    .select('id, auth_user_id, is_active')
    .in('id', memberIds);
  if (memErr) {
    logger.error('[notificationAudience] cast_members load error', memErr);
    return [];
  }

  const userIds = new Set<string>();
  for (const r of (members ?? []) as Array<{
    id: string;
    auth_user_id: string | null;
    is_active?: boolean | null;
  }>) {
    if (r.is_active === false) continue;
    if (r.auth_user_id) userIds.add(r.auth_user_id);
  }
  return Array.from(userIds);
}

/* ===========================================================================
 * Préférences notification — channel-aware
 * ===========================================================================*/

/**
 * PUSH (opt-OUT) : pour une liste de user_ids et un event_type, retourne le
 * sous-ensemble qui a OPT-OUT explicite (row notification_prefs channel='push'
 * enabled=false). Absent = enabled → reçoit. Comportement strictement
 * identique au dispatcher Web Push d'origine (filtre `channel='push'` ajouté
 * pour la migration multi-canal : la PK est désormais (user,event,channel)).
 */
export async function loadOptedOutUserIds(
  userIds: string[],
  eventType: string
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('user_id, enabled')
    .in('user_id', userIds)
    .eq('event_type', eventType)
    .eq('channel', 'push')
    .eq('enabled', false);
  if (error) {
    logger.error('[notificationAudience] push prefs load error', error);
    return new Set();
  }
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string }>) {
    out.add(r.user_id);
  }
  return out;
}

/**
 * EMAIL (opt-IN) : pour une liste de user_ids et un event_type, retourne le
 * sous-ensemble qui a OPT-IN explicite — une row notification_prefs
 * channel='email' enabled=true DOIT exister. Absent = pas d'email (l'inverse
 * du modèle push). Renvoie un Set des user_ids autorisés à recevoir l'email.
 */
export async function loadEmailOptedInUserIds(
  userIds: string[],
  eventType: string
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('user_id, enabled')
    .in('user_id', userIds)
    .eq('event_type', eventType)
    .eq('channel', 'email')
    .eq('enabled', true);
  if (error) {
    logger.error('[notificationAudience] email prefs load error', error);
    return new Set();
  }
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string }>) {
    out.add(r.user_id);
  }
  return out;
}
