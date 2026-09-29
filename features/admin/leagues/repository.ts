// features/admin/leagues/repository.ts — accès base des ligues, scopé par
// tenant (paramètre OBLIGATOIRE de chaque fonction).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { LEAGUE_COLUMNS, LEAGUE_TOURNAMENT_COLUMNS } from './schemas';

type LeagueInsert = Database['public']['Tables']['leagues']['Insert'];
type LeagueUpdate = Database['public']['Tables']['leagues']['Update'];

export async function listLeagues(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('leagues')
    .select(LEAGUE_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

export async function findLeague(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('leagues')
    .select(LEAGUE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function leagueExists(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('leagues')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return { exists: !!data, error };
}

/** Une ligue du tenant porte-t-elle déjà ce slug (hors `exceptId`) ? */
export async function slugTaken(
  db: AdminDb,
  tenantId: string,
  slug: string,
  exceptId?: string
) {
  let query = db
    .from('leagues')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug);
  if (exceptId) query = query.neq('id', exceptId);
  const { data } = await query.maybeSingle();
  return !!data;
}

export async function insertLeague(db: AdminDb, payload: LeagueInsert) {
  const { data, error } = await db
    .from('leagues')
    .insert(payload)
    .select(LEAGUE_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function updateLeague(
  db: AdminDb,
  tenantId: string,
  id: string,
  payload: LeagueUpdate
) {
  const { data, error } = await db
    .from('leagues')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(LEAGUE_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteLeague(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('leagues')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

/* ---- Classement ---- */

export async function listStandings(
  db: AdminDb,
  tenantId: string,
  leagueId: string
) {
  const { data, error } = await db
    .from('league_standings')
    .select(
      'team_id, points, tournaments_counted, scrims_counted, best_rank, rank'
    )
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId);
  return { rows: data ?? [], error };
}

export async function listTeamsByIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data } = await db
    .from('teams')
    .select('id, name, slug, logo_url')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return data ?? [];
}

export async function listTournamentLinks(
  db: AdminDb,
  tenantId: string,
  leagueId: string
) {
  const { data } = await db
    .from('league_tournaments')
    .select('tournament_id, weight')
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId);
  return data ?? [];
}

export async function listTournamentsByIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data } = await db
    .from('tournaments')
    .select('id, name, slug')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return data ?? [];
}

/* ---- Tournois rattachés ---- */

export async function tournamentExists(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return !!data;
}

export async function upsertTournamentLink(
  db: AdminDb,
  tenantId: string,
  link: { leagueId: string; tournamentId: string; weight: number }
) {
  const { data, error } = await db
    .from('league_tournaments')
    .upsert(
      {
        league_id: link.leagueId,
        tournament_id: link.tournamentId,
        tenant_id: tenantId,
        weight: link.weight,
      },
      { onConflict: 'league_id,tournament_id' }
    )
    .select(LEAGUE_TOURNAMENT_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteTournamentLink(
  db: AdminDb,
  tenantId: string,
  leagueId: string,
  tournamentId: string
) {
  const { error } = await db
    .from('league_tournaments')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId)
    .eq('tournament_id', tournamentId);
  return { error };
}
