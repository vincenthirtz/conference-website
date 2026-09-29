// features/player/dashboard/repository.ts — lectures propres au tableau de
// bord joueuse, toujours scopées au tenant. Requêtes reprises À L'IDENTIQUE
// de la route historique (mêmes colonnes, mêmes filtres, mêmes plafonds).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import { DEMANDES_HISTORY_LIMIT } from './schemas';

/** Client non typé : sélections avec jointures PostgREST, comme l'historique. */
const loose = (db: AdminDb) => db as unknown as SupabaseClient;

/**
 * Colonnes réellement lues par l'écran (TeamCard : demande en cours ;
 * DemandesHistory : historique) — jamais `select('*')`.
 */
const DEMANDE_COLUMNS =
  'id, type, status, created_at, updated_at, processed_at, comment, staff_note, payload, team_id';

export async function listOwnDemandes(
  db: AdminDb,
  userId: string,
  tenantId: string,
  type: 'captain_request' | 'join'
) {
  const sel =
    type === 'join'
      ? `${DEMANDE_COLUMNS}, team:teams!team_id(id, name, short_name, logo_url)`
      : DEMANDE_COLUMNS;
  const { data, error } = await loose(db)
    .from('demandes')
    .select(sel)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(DEMANDES_HISTORY_LIMIT);
  return { rows: (data ?? []) as unknown as Record<string, unknown>[], error };
}

/** `captain_message` REÇUS (team_id = mon équipe) encore `pending`. */
export async function countUnreadTeamMessages(
  db: AdminDb,
  teamId: string,
  tenantId: string
) {
  const { count, error } = await loose(db)
    .from('demandes')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'captain_message')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('status', 'pending');
  return { count: count ?? 0, error };
}

/** Invitations d'équipe reçues qui attendent une réponse. */
export async function countPendingInvitations(
  db: AdminDb,
  userId: string,
  tenantId: string
) {
  const { count, error } = await loose(db)
    .from('demandes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('type', 'invite')
    .eq('status', 'pending');
  return { count: count ?? 0, error };
}

/** Le prochain match encore jouable (à partir de H-1), le plus proche. */
export async function readNextTeamMatch(
  db: AdminDb,
  teamId: string,
  tenantId: string,
  cutoffISO: string
) {
  const { data, error } = await loose(db)
    .from('matches')
    .select(
      `
        id, status, scheduled_at, match_format, round_name, stream_url,
        team1_id, team2_id,
        team1_checkin_token, team2_checkin_token,
        team1_checked_in_at, team2_checked_in_at,
        team1:team1_id(id, name),
        team2:team2_id(id, name),
        tournament:tournament_id(id, name, slug, min_players)
        `
    )
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'ongoing'])
    .gte('scheduled_at', cutoffISO)
    .order('scheduled_at', { ascending: true })
    .limit(1);
  return {
    match: (data?.[0] as Record<string, unknown> | undefined) ?? null,
    error,
  };
}
