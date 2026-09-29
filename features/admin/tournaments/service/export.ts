// features/admin/tournaments/service/export.ts — export des résultats d'un
// tournoi (CSV par défaut, JSON sur `?format=json`). Le service construit le
// fichier ; la route l'écrit (en-têtes de téléchargement).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/insights';
import { fail } from './common';

const CSV_HEADER = [
  'match_id',
  'stage',
  'stage_type',
  'round',
  'round_name',
  'bracket_side',
  'team1',
  'team2',
  'score',
  'team1_score',
  'team2_score',
  'winner',
  'status',
  'format',
  'scheduled_at',
  'completed_at',
  'is_bye',
] as const;

function escapeCsv(v: unknown): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export type ExportFile = {
  filename: string;
  contentType: string;
  content: string;
};

export async function exportResults(
  ctx: ServiceContext,
  tournamentId: string,
  format: 'csv' | 'json'
): Promise<ExportFile> {
  const { data: tournament, error: tErr } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr || !tournament) fail(404, 'Tournament not found');

  const { data: stages } = await repo.stagesForExport(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  const stageMap = new Map(
    (stages ?? []).map((s) => [
      s.id,
      { name: s.name, stage_type: s.stage_type },
    ])
  );

  const { data: matches } = await repo.matchesForExport(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  const teamIds = new Set<string>();
  for (const m of matches ?? []) {
    if (m.team1_id) teamIds.add(m.team1_id);
    if (m.team2_id) teamIds.add(m.team2_id);
  }
  const teamNameMap = new Map<string, string>();
  if (teamIds.size > 0) {
    const { data } = await repo.teamNames(ctx.db, ctx.tenantId, [...teamIds]);
    for (const t of data ?? []) teamNameMap.set(t.id, t.name);
  }
  const nameOr = (id: string | null) => (id ? teamNameMap.get(id) || id : '');

  const rows = (matches ?? []).map((m) => {
    const stage = m.stage_id ? stageMap.get(m.stage_id) : null;
    return {
      match_id: m.id,
      stage: stage?.name || '',
      stage_type: stage?.stage_type || '',
      round: m.round_number ?? '',
      round_name: m.round_name || '',
      bracket_side: m.bracket_side || '',
      team1: nameOr(m.team1_id),
      team2: nameOr(m.team2_id),
      score:
        m.team1_score != null && m.team2_score != null
          ? `${m.team1_score}-${m.team2_score}`
          : '',
      team1_score: m.team1_score ?? '',
      team2_score: m.team2_score ?? '',
      winner: nameOr(m.winner_team_id),
      status: m.status,
      format: m.best_of ? `BO${m.best_of}` : m.match_format || '',
      scheduled_at: m.scheduled_at || '',
      completed_at: m.completed_at || '',
      is_bye: m.is_bye ? 'true' : 'false',
    };
  });

  const slugSafe = (tournament.slug || tournament.name || tournamentId).replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );

  if (format === 'json') {
    return {
      filename: `results-${slugSafe}.json`,
      contentType: 'application/json; charset=utf-8',
      content: JSON.stringify(
        {
          tournament: {
            id: tournament.id,
            name: tournament.name,
            game: tournament.game,
            status: tournament.status,
          },
          exportedAt: new Date().toISOString(),
          totalMatches: rows.length,
          results: rows,
        },
        null,
        2
      ),
    };
  }

  const csvRows = rows.map((r) =>
    CSV_HEADER.map((h) => escapeCsv(r[h])).join(',')
  );
  return {
    filename: `results-${slugSafe}.csv`,
    contentType: 'text/csv; charset=utf-8',
    content: [CSV_HEADER.join(','), ...csvRows].join('\n'),
  };
}
