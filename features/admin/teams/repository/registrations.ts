// features/admin/teams/repository/registrations.ts — inscriptions d'une
// équipe aux tournois : `tournament_teams` (inscription CANONIQUE) et
// `stage_teams` (seeding dans les phases). Les deux s'écrivent ensemble.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { STAGE_TEAM_ROW_COLUMNS } from '../schemas';

export async function listPublishedTournaments(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tournaments')
    .select(
      'id, name, slug, game, status, start_date, end_date, max_teams, min_players'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('start_date', { ascending: false });
  return { rows: data ?? [], error };
}

export async function listTeamStageRegistrations(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select(
      `
        stage_id,
        team_id,
        tournament_stages!inner(
          id,
          tournament_id,
          name,
          stage_type,
          tournaments!inner(
            id,
            name,
            slug,
            game,
            status,
            start_date,
            end_date
          )
        )
      `
    )
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return { rows: data ?? [], error };
}

export async function getTournamentForRegistration(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('tournaments')
    .select('id, name, status, max_teams, min_players')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .single();
  return { row: data, error };
}

export async function getTournamentName(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .single();
  return { row: data, error };
}

export async function listTournamentStageTeams(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select('team_id, tournament_stages!inner(tournament_id)')
    .eq('tenant_id', tenantId)
    .eq('tournament_stages.tournament_id', tournamentId);
  return { rows: data ?? [], error };
}

export async function getTournamentStage(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .single();
  return { row: data, error };
}

export async function listTournamentStageIds(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('tournament_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  return { rows: data, error };
}

export async function listTeamStageRows(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  stageIds: string[]
) {
  const { data, error } = await db
    .from('stage_teams')
    .select('stage_id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .in('stage_id', stageIds);
  return { rows: data, error };
}

export async function insertStageTeams(
  db: AdminDb,
  rows: Array<{ tenant_id: string; stage_id: string; team_id: string }>
) {
  const { data, error } = await db
    .from('stage_teams')
    .insert(rows)
    .select(STAGE_TEAM_ROW_COLUMNS);
  return { rows: data, error };
}

export async function upsertTournamentTeam(
  db: AdminDb,
  row: {
    tenant_id: string;
    tournament_id: string;
    team_id: string;
    status: string;
  }
) {
  const { error } = await db
    .from('tournament_teams')
    .upsert(row, { onConflict: 'tournament_id,team_id' });
  return { error };
}

export async function deleteTeamStageRows(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  stageIds: string[]
) {
  const { error, count } = await db
    .from('stage_teams')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .in('stage_id', stageIds);
  return { error, count };
}

export async function deleteTournamentTeam(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  tournamentId: string
) {
  const { error } = await db
    .from('tournament_teams')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('tournament_id', tournamentId);
  return { error };
}
