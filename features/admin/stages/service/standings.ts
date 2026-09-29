// features/admin/stages/service/standings.ts — classement générique d'une
// phase (utils/stages/standings), découpé par poule pour une phase `group`,
// et ses exports (CSV / JSON) que la route écrit elle-même.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  computeGroupedStandings,
  computeStageStandings,
  type GroupedStandings,
} from '@/utils/stages/standings';
import * as stages from '../repository/stages';
import { stageNotFound } from './common';

/** Fichier téléchargé : la route pose les en-têtes et écrit le contenu. */
export type StandingsFile = {
  contentType: string;
  filename: string;
  content: string;
};

const escapeCsv = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

export async function stageStandings(
  ctx: ServiceContext,
  id: string,
  exportParam: unknown
): Promise<{ json: Record<string, unknown> } | { file: StandingsFile }> {
  const exportFormat =
    exportParam === 'csv' ? 'csv' : exportParam === 'json' ? 'json' : null;

  const { row: stage, error } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error || !stage) throw stageNotFound();

  const stageType = stage.stage_type || 'other';
  const standings = await computeStageStandings(ctx.tenantId, id, stageType);

  let grouped: GroupedStandings | undefined;
  if (stageType === 'group') {
    try {
      grouped = await computeGroupedStandings(ctx.tenantId, id);
    } catch (e) {
      ctx.logger.error('grouped standings error:', e);
    }
  }

  const base = `standings-${(stage.name || id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  if (exportFormat === 'csv') {
    const header = [
      'rank',
      'team_name',
      'wins',
      'losses',
      'draws',
      'score',
      'seed',
    ];
    const rows = standings.map((s) =>
      [
        s.rank,
        escapeCsv(s.teamName),
        s.wins,
        s.losses,
        s.draws,
        s.score,
        s.seed ?? '',
      ].join(',')
    );
    return {
      file: {
        contentType: 'text/csv; charset=utf-8',
        filename: `${base}.csv`,
        content: [header.join(','), ...rows].join('\n'),
      },
    };
  }

  if (exportFormat === 'json') {
    const exportData = {
      stageId: id,
      stageName: stage.name,
      stageType,
      exportedAt: new Date().toISOString(),
      standings: standings.map((s) => ({
        rank: s.rank,
        teamName: s.teamName,
        teamId: s.teamId,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        score: s.score,
        seed: s.seed,
      })),
    };
    return {
      file: {
        contentType: 'application/json; charset=utf-8',
        filename: `${base}.json`,
        content: JSON.stringify(exportData, null, 2),
      },
    };
  }

  return {
    json: {
      stageId: id,
      stageType,
      standings,
      ...(grouped ? { grouped } : {}),
    },
  };
}
