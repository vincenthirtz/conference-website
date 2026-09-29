// features/admin/matches/repository/matches.ts — accès base de la fiche d'un
// match côté staff (lecture, méta, annulation / suppression, litige).
// `tenantId` est un paramètre OBLIGATOIRE des fonctions scopées ; les
// exceptions (litige) sont nommées `…Unscoped` et commentées.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import {
  MATCH_DETAIL_COLUMNS,
  MATCH_DETAIL_WITH_GAMES_COLUMNS,
  MATCH_ROW_COLUMNS,
} from '../schemas';

/* ---- Fiche ---- */

export async function getMatchDetail(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  includeGames: boolean
) {
  // Scope tenant : le client service bypasse la RLS — un staff du tenant A ne
  // doit pas lire un match du tenant B.
  const { data, error } = await db
    .from('matches')
    .select(
      includeGames ? MATCH_DETAIL_WITH_GAMES_COLUMNS : MATCH_DETAIL_COLUMNS
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getMatchRow(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await db
    .from('matches')
    .select(MATCH_ROW_COLUMNS)
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getMatchUpdatedAt(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('matches')
    .select('updated_at')
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function getMatchTournamentAndStatus(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('matches')
    .select('tournament_id, status')
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/**
 * Statut d'un tournoi par son id. Pas de filtre tenant : l'id vient d'un match
 * déjà lu dans le tenant du staff (comportement d'origine).
 */
export async function getTournamentStatus(db: AdminDb, tournamentId: string) {
  const { data } = await db
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle();
  return data;
}

/** Bornes du tournoi (avertissement de planification). Même remarque. */
export async function getTournamentDates(db: AdminDb, tournamentId: string) {
  const { data } = await db
    .from('tournaments')
    .select('start_date, end_date')
    .eq('id', tournamentId)
    .maybeSingle();
  return data;
}

/** L'entité référencée existe-t-elle dans le tenant ? */
export async function refExistsInTenant(
  db: AdminDb,
  tenantId: string,
  table: 'tournaments' | 'teams',
  id: string
) {
  const { data } = await db
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return !!data;
}

export async function updateMatchRow(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  const { data, error } = await db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .select(MATCH_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

/** Match + équipes + tournoi pour la notification Discord « match lancé ». */
export async function getMatchForStartingNotice(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      round_name,
      match_format,
      lobby_code,
      stream_url,
      scheduled_at,
      team1:team1_id(id, name, logo_url, discord_role_id),
      team2:team2_id(id, name, logo_url, discord_role_id),
      tournament:tournament_id(id, name)
      `
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/* ---- Annulation / suppression ---- */

export async function hardDeleteMatch(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { error } = await db
    .from('matches')
    .delete()
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function cancelMatch(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { error } = await db
    .from('matches')
    .update({
      status: 'cancelled',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
    })
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ---- Litige ----
 *
 * ⚠️ DÉFAUT PRÉEXISTANT, CONSERVÉ À LA MIGRATION (signalé, non corrigé) : la
 * route d'origine lit ET écrit le match par son seul id, sans filtre tenant —
 * un staff `arbitrate_matches` d'un espace peut ouvrir / résoudre / annuler
 * le litige d'un match d'un autre espace s'il en connaît l'id.
 */

export async function getMatchForDisputeUnscoped(
  db: AdminDb,
  matchId: string,
  columns:
    | 'id, tournament_id, status, dispute_reason, dispute_opened_at'
    | 'id, tournament_id, status, team1_id, team2_id, team1_score, team2_score'
    | 'id, tournament_id, status, dispute_reason'
) {
  const { data, error } = await db
    .from('matches')
    .select(columns)
    .eq('id', matchId)
    .maybeSingle();
  return {
    row: data as {
      id: string;
      tournament_id: string | null;
      status: string;
      dispute_reason?: string | null;
    } | null,
    error,
  };
}

export async function updateMatchUnscoped(
  db: AdminDb,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  const { error } = await db.from('matches').update(patch).eq('id', matchId);
  return { error };
}

export async function updateMatchReturningUnscoped(
  db: AdminDb,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  const { data, error } = await db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .select(MATCH_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}
