// features/admin/matches/repository/mvp.ts — MVP importé d'un match
// (`match_mvp_polls`) et candidates. `tenantId` OBLIGATOIRE partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { MVP_POLL_ROW_COLUMNS } from '../schemas';

export async function getMatchForMvp(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('matches')
    .select('id, status, team1_id, team2_id, tournament_id')
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function getMvpPoll(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('match_mvp_polls')
    .select(MVP_POLL_ROW_COLUMNS)
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function getMvpPollId(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('match_mvp_polls')
    .select('id')
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function listMvpCandidateMembers(
  db: AdminDb,
  tenantId: string,
  teamIds: string[]
) {
  const { data } = await db
    .from('team_members')
    .select(
      `
        id, team_id, battle_tag, is_substitute,
        team:team_id(id, name)
        `
    )
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds);
  return data ?? [];
}

export async function getTeamMember(
  db: AdminDb,
  tenantId: string,
  memberId: string
) {
  const { data } = await db
    .from('team_members')
    .select('id, team_id, battle_tag')
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

type PollWinner = TablesUpdate<'match_mvp_polls'>;

export async function updateMvpPollById(
  db: AdminDb,
  tenantId: string,
  pollId: string,
  patch: PollWinner
) {
  const { data, error } = await db
    .from('match_mvp_polls')
    .update(patch)
    .eq('id', pollId)
    .eq('tenant_id', tenantId)
    .select(MVP_POLL_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function insertMvpPoll(
  db: AdminDb,
  row: PollWinner & { tenant_id: string; match_id: string }
) {
  const { data, error } = await db
    .from('match_mvp_polls')
    .insert(row)
    .select(MVP_POLL_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function updateMvpPollByMatch(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  patch: PollWinner
) {
  const { data, error } = await db
    .from('match_mvp_polls')
    .update(patch)
    .eq('match_id', matchId)
    .eq('tenant_id', tenantId)
    .select(MVP_POLL_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}
