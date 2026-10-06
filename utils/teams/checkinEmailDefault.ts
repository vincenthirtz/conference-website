// utils/teams/checkinEmailDefault.ts
//
// L'e-mail « check-in ouvert » est le SEUL e-mail en opt-OUT pour qui peut
// pointer.
//
// POURQUOI. Le canal e-mail est opt-in (absent = rien) : c'est juste pour un
// récap d'actualité, pas pour l'événement qui mène au FORFAIT. Sans check-in
// au coup d'envoi, l'équipe perd par forfait automatique — et la personne
// qui doit pointer (capitaine, coach, manager : utils/teams/canCheckIn.ts)
// n'en était prévenue par e-mail que si elle avait pensé à cocher une case.
// Une capitaine sans push (iOS sans PWA, notifications refusées) n'avait donc
// aucun canal.
//
// RÈGLE. Pour `checkin.opened` sur le canal e-mail :
//   - personne autorisée à pointer → absent = OUI (opt-out) ;
//   - toute autre → absent = NON (opt-in, inchangé) ;
//   - une ligne explicite (true ou false) l'emporte toujours, dans les deux
//     cas. Le PUT des préférences écrit donc toujours une ligne explicite pour
//     ce couple (cf. features/player/notifications/service/prefs.ts) : un
//     « non » reste un non même si la personne devient capitaine ensuite.
//
// Qui peut pointer : LA règle de canCheckIn.ts (capitaine, ou rôle d'équipe
// coach/manager, casse ignorée) — jamais recopiée ici, seulement appliquée à
// des listes.

import { logger } from '@/utils/logger';
import { supabaseAdmin } from '@/utils/supabase';
import { isCheckinTeamRole } from './canCheckIn';

export const CHECKIN_EMAIL_EVENT = 'checkin.opened' as const;

/** `true` si le couple (canal, event) suit le défaut « qui peut pointer ». */
export function isCheckinEmailPref(channel: string, eventType: string) {
  return channel === 'email' && eventType === CHECKIN_EMAIL_EVENT;
}

/**
 * Comptes autorisés à pointer pour au moins une des équipes. Ne lève jamais ;
 * une lecture en échec est journalisée et ignorée.
 */
export async function loadCheckinCapableUserIdsForTeams(
  teamIds: string[],
  tenantId: string
): Promise<string[]> {
  const ids = teamIds.filter((v) => typeof v === 'string' && v.length > 0);
  if (ids.length === 0 || !supabaseAdmin) return [];
  const out = new Set<string>();
  try {
    const [teamsRes, membersRes] = await Promise.all([
      supabaseAdmin
        .from('teams')
        .select('captain_id')
        .in('id', ids)
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('team_members')
        .select('user_id, role')
        .in('team_id', ids)
        .eq('tenant_id', tenantId),
    ]);
    if (teamsRes.error) {
      logger.error('[checkinEmailDefault] teams error', teamsRes.error);
    }
    for (const r of (teamsRes.data ?? []) as Array<{
      captain_id: string | null;
    }>) {
      if (r.captain_id) out.add(r.captain_id);
    }
    if (membersRes.error) {
      logger.error('[checkinEmailDefault] members error', membersRes.error);
    }
    for (const r of (membersRes.data ?? []) as Array<{
      user_id: string | null;
      role: string | null;
    }>) {
      if (r.user_id && isCheckinTeamRole(r.role)) out.add(r.user_id);
    }
  } catch (err) {
    logger.error('[checkinEmailDefault] lookup exception', err);
  }
  return Array.from(out);
}

/** Comptes autorisés à pointer pour l'une des deux équipes d'un match. */
export async function loadCheckinCapableUserIdsForMatch(
  matchId: string,
  tenantId: string
): Promise<string[]> {
  if (!matchId || !supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('team1_id, team2_id')
    .eq('id', matchId)
    .maybeSingle();
  if (error || !data) {
    if (error) logger.error('[checkinEmailDefault] match error', error);
    return [];
  }
  const m = data as { team1_id: string | null; team2_id: string | null };
  return loadCheckinCapableUserIdsForTeams(
    [m.team1_id, m.team2_id].filter((v): v is string => Boolean(v)),
    tenantId
  );
}

/**
 * EMAIL : sous-ensemble ayant EXPLICITEMENT refusé (`enabled = false`) cet
 * event. Erreur → ensemble vide… ce qui, pour un défaut opt-out, enverrait à
 * quelqu'un qui a refusé : on renvoie donc `null` et l'appelant retombe sur
 * l'opt-in strict.
 */
export async function loadEmailOptedOutUserIds(
  userIds: string[],
  eventType: string
): Promise<Set<string> | null> {
  if (userIds.length === 0) return new Set();
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('user_id')
    .in('user_id', userIds)
    .eq('event_type', eventType)
    .eq('channel', 'email')
    .eq('enabled', false);
  if (error) {
    logger.error('[checkinEmailDefault] email opt-out load error', error);
    return null;
  }
  return new Set(
    ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
  );
}
