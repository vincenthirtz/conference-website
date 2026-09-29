// features/player/notifications/repository.ts — accès base des notifications
// de la joueuse (lot P15). Colonnes explicites ; la base est REÇUE ; toute
// lecture de compteur est scopée au tenant du SUJET.
//
// `notification_prefs` est keyée (user_id, event_type, channel) ; une ligne
// n'existe que pour un état NON-DÉFAUT (opt-out push, opt-in e-mail,
// désinscription broadcast). `push_subscriptions` : une ligne par endpoint.

import type { AdminDb } from '@/utils/admin/serviceContext';

/* ------------------------------------------------------------------ *
 * Compteurs
 * ------------------------------------------------------------------ */

/** Types des demandes en attente adressées à l'équipe (messages, candidatures). */
export async function listPendingInboxTypes(
  db: AdminDb,
  teamId: string,
  tenantId: string
): Promise<Array<{ type?: string }>> {
  const { data } = await db
    .from('demandes')
    .select('type')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .in('type', ['captain_message', 'join'])
    .eq('status', 'pending');
  return (data ?? []) as Array<{ type?: string }>;
}

export type NextMatchCheckinRow = {
  id: string;
  scheduled_at: string | null;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_checked_in_at: string | null;
  team2_checked_in_at: string | null;
};

/** Prochain match (en attente / en cours) de l'équipe depuis `sinceISO`. */
export async function readNextMatchForCheckin(
  db: AdminDb,
  teamId: string,
  tenantId: string,
  sinceISO: string
): Promise<NextMatchCheckinRow | null> {
  const { data } = await db
    .from('matches')
    .select(
      `id, scheduled_at, status, team1_id, team2_id,
         team1_checked_in_at, team2_checked_in_at`
    )
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'ongoing'])
    .gte('scheduled_at', sinceISO)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as NextMatchCheckinRow | null) ?? null;
}

/**
 * Grilles de planning ouvertes du tenant — restreintes à celles de l'équipe
 * gérée quand `teamId` est fourni (non-staff).
 */
export async function listOpenPlanningIds(
  db: AdminDb,
  tenantId: string,
  teamId: string | null
): Promise<string[]> {
  let query = db
    .from('scrim_plannings')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .is('deleted_at', null);
  if (teamId) {
    query = query.or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`);
  }
  const { data } = await query;
  return ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
}

/** Grilles où la joueuse a déjà peint au moins un créneau. */
export async function listPaintedPlanningIds(
  db: AdminDb,
  userId: string,
  planningIds: string[]
): Promise<Set<string>> {
  const { data } = await db
    .from('scrim_planning_availabilities')
    .select('planning_id, slots')
    .eq('user_id', userId)
    .in('planning_id', planningIds);
  return new Set(
    ((data ?? []) as Array<{ planning_id: string; slots: unknown }>)
      .filter((r) => Array.isArray(r.slots) && r.slots.length > 0)
      .map((r) => r.planning_id)
  );
}

/* ------------------------------------------------------------------ *
 * Préférences
 * ------------------------------------------------------------------ */

export type PrefRow = { event_type: string; channel: string; enabled: boolean };

export async function listPrefRows(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('notification_prefs')
    .select('event_type, channel, enabled')
    .eq('user_id', userId);
  return { rows: (data ?? []) as PrefRow[], error };
}

export async function deletePrefRow(
  db: AdminDb,
  k: { userId: string; eventType: string; channel: string }
) {
  const { error } = await db
    .from('notification_prefs')
    .delete()
    .eq('user_id', k.userId)
    .eq('event_type', k.eventType)
    .eq('channel', k.channel);
  return { error };
}

export async function insertPrefRow(
  db: AdminDb,
  k: { userId: string; eventType: string; channel: string; enabled: boolean }
) {
  const { error } = await db.from('notification_prefs').insert({
    user_id: k.userId,
    event_type: k.eventType,
    channel: k.channel,
    enabled: k.enabled,
    updated_at: new Date().toISOString(),
  });
  return { error };
}

/* ------------------------------------------------------------------ *
 * Abonnements Web Push
 * ------------------------------------------------------------------ */

/** Supprime l'abonnement de CET appareil, jamais celui d'une autre. */
export async function deleteOwnSubscription(
  db: AdminDb,
  userId: string,
  endpoint: string
) {
  const { data, error } = await db
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .select('id');
  return { deleted: (data ?? []).length, error };
}
