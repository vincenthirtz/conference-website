// features/admin/tournaments/repository/quickBracket.ts — écritures du
// « quick bracket » (tournoi + équipes shell + phase + seeds), et leur
// nettoyage en cas d'échec. Toutes scopées par tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert } from '@/types/database.generated';

export async function tournamentSlugTaken(
  db: AdminDb,
  tenantId: string,
  slug: string
): Promise<boolean> {
  const { data } = await db
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle();
  return Boolean(data);
}

export async function insertTournament(
  db: AdminDb,
  row: TablesInsert<'tournaments'>
) {
  const { data, error } = await db
    .from('tournaments')
    .insert(row)
    .select('id, slug')
    .maybeSingle();
  return { row: data, error };
}

export async function insertShellTeam(db: AdminDb, row: TablesInsert<'teams'>) {
  const { data, error } = await db
    .from('teams')
    .insert(row)
    .select('id')
    .maybeSingle();
  return { row: data, error };
}

export async function insertTournamentTeams(
  db: AdminDb,
  rows: TablesInsert<'tournament_teams'>[]
) {
  const { error } = await db.from('tournament_teams').insert(rows);
  return { error };
}

export async function insertStage(
  db: AdminDb,
  row: TablesInsert<'tournament_stages'>
) {
  const { data, error } = await db
    .from('tournament_stages')
    .insert(row)
    .select('id')
    .maybeSingle();
  return { row: data, error };
}

export async function insertStageTeams(
  db: AdminDb,
  rows: TablesInsert<'stage_teams'>[]
) {
  const { error } = await db.from('stage_teams').insert(rows);
  return { error };
}

/** Nettoyage best-effort d'un quick bracket inachevé (lève si une requête lève). */
export async function deleteQuickBracket(
  db: AdminDb,
  tenantId: string,
  ids: {
    tournamentId: string | null;
    stageId: string | null;
    teamIds: string[];
  }
) {
  if (ids.stageId) {
    await db
      .from('matches')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('stage_id', ids.stageId);
    await db
      .from('stage_teams')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('stage_id', ids.stageId);
    await db
      .from('tournament_stages')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', ids.stageId);
  }
  if (ids.tournamentId) {
    await db
      .from('tournament_teams')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('tournament_id', ids.tournamentId);
    await db
      .from('tournaments')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', ids.tournamentId);
  }
  if (ids.teamIds.length > 0) {
    await db
      .from('teams')
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', ids.teamIds);
  }
}
