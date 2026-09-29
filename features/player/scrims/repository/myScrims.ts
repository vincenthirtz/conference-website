// features/player/scrims/repository/myScrims.ts — scrims d'une équipe et
// reports de score (`scrim_score_reports`). Toujours scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';

export type TeamScrimRow = {
  id: string;
  name: string | null;
  scheduled_date: string | null;
  status: string;
  ranked: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  dispute_reason: string | null;
};

export type ReportRow = {
  scrim_id: string;
  team_side: number;
  team1_score: number;
  team2_score: number;
};

export async function listTeamScrims(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('scrims')
    .select(
      'id, name, scheduled_date, status, ranked, team1_id, team2_id, team1_score, team2_score, winner_team_id, dispute_reason'
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .limit(50);
  return { rows: (data ?? []) as unknown as TeamScrimRow[], error };
}

export async function listTeamNames(db: AdminDb, ids: string[]) {
  if (ids.length === 0) return [] as Array<{ id: string; name: string }>;
  const { data } = await db.from('teams').select('id, name').in('id', ids);
  return (data ?? []) as unknown as Array<{ id: string; name: string }>;
}

export async function listReportsFor(
  db: AdminDb,
  tenantId: string,
  scrimIds: string[]
) {
  if (scrimIds.length === 0) return [] as ReportRow[];
  const { data } = await db
    .from('scrim_score_reports')
    .select('scrim_id, team_side, team1_score, team2_score')
    .eq('tenant_id', tenantId)
    .in('scrim_id', scrimIds);
  return (data ?? []) as unknown as ReportRow[];
}

export type ReportableScrim = {
  id: string;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  name: string | null;
  ranked: boolean | null;
  scheduled_date: string | null;
  slug: string | null;
  timezone: string | null;
  is_public: boolean | null;
  stream_url: string | null;
  description: string | null;
  source_demande_id: string | null;
};

export async function readReportableScrim(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { data, error } = await db
    .from('scrims')
    .select(
      'id, status, team1_id, team2_id, name, ranked, scheduled_date, slug, timezone, is_public, stream_url, description, source_demande_id'
    )
    .eq('tenant_id', tenantId)
    .eq('id', scrimId)
    .is('deleted_at', null)
    .maybeSingle();
  return { scrim: data as unknown as ReportableScrim | null, error };
}

export async function upsertReport(
  db: AdminDb,
  row: {
    tenant_id: string;
    scrim_id: string;
    team_side: 1 | 2;
    reported_by_auth_user_id: string;
    team1_score: number;
    team2_score: number;
    updated_at: string;
  }
) {
  const { error } = await db
    .from('scrim_score_reports')
    .upsert(row as never, { onConflict: 'scrim_id,team_side' });
  return { error };
}

export async function listScrimReports(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { data, error } = await db
    .from('scrim_score_reports')
    .select('team_side, team1_score, team2_score')
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId);
  return {
    reports: (data ?? []) as unknown as Array<{
      team_side: number;
      team1_score: number;
      team2_score: number;
    }>,
    error,
  };
}
