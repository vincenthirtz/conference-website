// features/admin/stages/service/matchOps.ts — opérations sur plusieurs matchs
// d'une phase : BYE automatiques, scores en lot, planification / édition /
// annulation en masse et leur annulation (undo).
//
// Métier délégué, inchangé : utils/matches/applyScore (score + propagation),
// utils/bracket/propagate, utils/matches/scoreReports (purge des reports à la
// réouverture), utils/matches/scheduleEvents (bot prévenu d'un déplacement),
// utils/tcg/paidMatches (un match qui a payé des récompenses ne se supprime pas).
//
// ⚠️ Défauts PRÉEXISTANTS conservés (signalés, non corrigés) :
//   * auto-byes et batch-scores lisent la phase, ses matchs et le tournoi SANS
//     filtre d'espace — un staff peut viser la phase d'un autre espace par son
//     id ; auto-byes écrit aussi les matchs sans filtre d'espace.
//   * l'undo en masse écrit `snapshots[].fields` TEL QUEL sur `matches` : le
//     client choisit librement les colonnes écrites (dans la phase et l'espace).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import type { MatchStatus } from '@/types/admin';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyMatchScore } from '@/utils/matches/applyScore';
import {
  propagateBracketForMatch,
  resetPropagationForMatch,
} from '@/utils/bracket/propagate';
import { emitScheduleEvents } from '@/utils/matches/scheduleEvents';
import {
  matchTransitionPurgesReports,
  purgeScoreReports,
  type PurgedScoreReport,
} from '@/utils/matches/scoreReports';
import { readPaidMatchIds } from '@/utils/tcg/paidMatches';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { fail, stageNotFound } from './common';

type Body = Record<string, unknown>;
type ItemResult = { matchId: string; success: boolean; error?: string };

/* -------------------------------- auto-byes ----------------------------- */

export async function autoByes(
  ctx: ServiceContext,
  id: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const roundFilter =
    typeof body.roundNumber === 'number' ? body.roundNumber : undefined;
  const scoreForBye =
    typeof body.scoreForBye === 'number' ? body.scoreForBye : 1;
  const propagate = body.propagate !== false;

  const { row: stageRow, error: stageErr } =
    await stages.getStageTournamentUnscoped(ctx.db, id);
  if (stageErr || !stageRow) throw stageNotFound();
  const tournamentId: string | null = stageRow.tournament_id ?? null;

  const { rows, error: mErr } = await matches.activeStageMatchesUnscoped(
    ctx.db,
    id,
    roundFilter
  );
  if (mErr) {
    ctx.logger.error('auto-byes: fetch matches error', mErr);
    throw fail(500, 'Failed to fetch stage matches');
  }

  // Éligible : pas déjà BYE, exactement une équipe (team1 XOR team2).
  const candidates = (rows || []).filter(
    (m) => !m.is_bye && !!m.team1_id !== !!m.team2_id
  );

  if (candidates.length === 0) {
    // Rien d'écrit : pas d'entrée de journal (comme à l'origine).
    return {
      result: {
        stageId: id,
        tournamentId,
        roundNumber: roundFilter ?? null,
        updatedMatchIds: [],
        failed: [],
      },
      audit: { skip: true },
    };
  }

  const updatedMatchIds: string[] = [];
  const failed: { matchId: string; reason: string }[] = [];

  for (const m of candidates) {
    const matchId = m.id;
    try {
      const winnerTeamId = m.team1_id || m.team2_id;
      if (!winnerTeamId) throw new Error('Match has no team to receive BYE');

      await resetPropagationForMatch(ctx.tenantId, matchId);

      const { error: updErr } = await matches.finishAsByeUnscoped(
        ctx.db,
        matchId,
        {
          is_bye: true,
          status: 'finished',
          winner_team_id: winnerTeamId,
          team1_score: m.team1_id === winnerTeamId ? scoreForBye : 0,
          team2_score: m.team2_id === winnerTeamId ? scoreForBye : 0,
          completed_at: new Date().toISOString(),
        }
      );
      if (updErr) throw updErr;

      if (propagate) {
        try {
          await propagateBracketForMatch(ctx.tenantId, matchId);
        } catch (e) {
          ctx.logger.error(
            'auto-byes: propagateBracketForMatch error',
            matchId,
            e
          );
        }
      }
      updatedMatchIds.push(matchId);
    } catch (err) {
      ctx.logger.error('auto-byes: error processing match', matchId, err);
      failed.push({ matchId, reason: (err as Error)?.message ?? 'unknown' });
    }
  }

  return {
    result: {
      stageId: id,
      tournamentId,
      roundNumber: roundFilter ?? null,
      updatedMatchIds,
      failed,
    },
    audit: {
      entity_type: 'match_auto_byes',
      entity_id: null,
      tournament_id: tournamentId,
      payload: {
        stage_id: id,
        round_number: roundFilter ?? null,
        score_for_bye: scoreForBye,
        propagate,
        updated_match_ids: updatedMatchIds,
        failed,
      },
    },
  };
}

/* ------------------------------ scores en lot --------------------------- */

/**
 * Valeurs possibles de `matches.status` : `satisfies` lie la liste au type,
 * un statut ajouté à l'un sans l'autre ne compile pas. Un statut libre du
 * corps n'atteint jamais la colonne sans passer par ici.
 */
const MATCH_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'postponed',
  'disputed',
  'walkover',
] as const satisfies readonly MatchStatus[];

function isMatchStatus(v: unknown): v is MatchStatus {
  return (
    typeof v === 'string' && (MATCH_STATUSES as readonly string[]).includes(v)
  );
}

type ScoreEntry = {
  matchId: string;
  team1Score?: number;
  team2Score?: number;
  winnerTeamId?: string | null;
  status?: string;
  forfeitTeamId?: string | null;
  propagate?: boolean;
};

export type BatchScoresOutcome = {
  /** 500 quand AUCUN score n'est passé (corps inchangé : pas de `error`). */
  httpStatus: 200 | 500;
  body: {
    results: Array<{
      matchId: string;
      success: boolean;
      error?: string;
      winnerTeamId?: string | null;
    }>;
    successCount: number;
    failureCount: number;
  };
};

export async function batchScores(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<BatchScoresOutcome>> {
  const { row: stage, error: stageErr } =
    await stages.getStageTournamentUnscoped(ctx.db, stageId);
  if (stageErr || !stage) throw stageNotFound();

  const tournament = await related.tournamentStatusUnscoped(
    ctx.db,
    stage.tournament_id
  );
  if (tournament?.status === 'completed') {
    throw fail(
      403,
      'Impossible de modifier les scores : le tournoi est terminé.',
      'TOURNAMENT_COMPLETED'
    );
  }

  const scores = body.scores as ScoreEntry[] | undefined;
  if (!Array.isArray(scores) || scores.length === 0) {
    throw fail(400, 'Body must contain a non-empty "scores" array');
  }
  if (scores.length > 50) throw fail(400, 'Maximum 50 scores per batch');

  const validated: Array<
    Omit<ScoreEntry, 'status'> & { status?: MatchStatus }
  > = [];
  for (const entry of scores) {
    if (!entry.matchId || !isValidUUID(entry.matchId)) {
      throw fail(400, `Invalid matchId: ${entry.matchId}`);
    }
    let status: MatchStatus | undefined;
    if (entry.status !== undefined) {
      if (!isMatchStatus(entry.status)) {
        throw fail(400, `Invalid status: ${entry.status}`);
      }
      status = entry.status;
    }
    validated.push({ ...entry, status });
  }

  const { rows, error: matchErr } = await matches.matchStagesUnscoped(
    ctx.db,
    scores.map((s) => s.matchId)
  );
  if (matchErr) throw fail(500, 'Failed to verify matches');
  const stageOf = new Map((rows || []).map((m) => [m.id, m.stage_id]));
  for (const entry of scores) {
    if (stageOf.get(entry.matchId) !== stageId) {
      throw fail(
        400,
        `Match ${entry.matchId} does not belong to stage ${stageId}`
      );
    }
  }

  // Séquentiel : l'ordre compte pour la propagation du bracket.
  const results: BatchScoresOutcome['body']['results'] = [];
  let successCount = 0;
  let failureCount = 0;
  for (const entry of validated) {
    try {
      const r = await applyMatchScore({
        tenantId: ctx.tenantId,
        matchId: entry.matchId,
        team1Score: entry.team1Score,
        team2Score: entry.team2Score,
        winnerTeamId: entry.winnerTeamId,
        forfeitTeamId: entry.forfeitTeamId,
        status: entry.status,
        markFinished: !entry.status && !entry.forfeitTeamId,
        staffId: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
        propagateBracket: entry.propagate !== false,
      });
      results.push({
        matchId: entry.matchId,
        success: true,
        winnerTeamId: r.winnerTeamId,
      });
      successCount++;
    } catch (err) {
      results.push({
        matchId: entry.matchId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      failureCount++;
    }
  }

  return {
    result: {
      httpStatus: failureCount > 0 && successCount === 0 ? 500 : 200,
      body: { results, successCount, failureCount },
    },
    audit: {
      entity_type: 'match',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        action: 'batch_scores',
        count: scores.length,
        successCount,
        failureCount,
      },
    },
  };
}

/* --------------------------- opérations en masse ------------------------ */

async function loadStage(ctx: ServiceContext, stageId: string) {
  const { row, error } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (error || !row) throw stageNotFound();
  return row;
}

/** Entrée de journal commune (`staff_batch_action` sur la phase). */
function batchAudit(stageId: string, tournamentId: string, payload: Body) {
  return {
    entity_type: 'match',
    entity_id: stageId,
    tournament_id: tournamentId,
    payload,
  };
}

/** PATCH : planification en masse `{ schedules: [{ matchId, scheduled_at }] }`. */
export async function bulkSchedule(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { tournament_id: tournamentId } = await loadStage(ctx, stageId);
  const schedules = body.schedules as Array<{
    matchId?: unknown;
    scheduled_at?: unknown;
  }>;

  if (!Array.isArray(schedules) || schedules.length === 0) {
    throw fail(400, "Body must include non-empty array 'schedules'");
  }

  const results: ItemResult[] = [];
  const succeeded: Array<{
    matchId: string;
    previousScheduledAt: string | null;
  }> = [];

  const validIds = schedules
    .filter(
      (e): e is { matchId: string; scheduled_at?: unknown } =>
        typeof e.matchId === 'string' && e.matchId.length > 0
    )
    .map((e) => e.matchId);
  const snapshots =
    validIds.length > 0
      ? await matches.scheduleSnapshots(ctx.db, ctx.tenantId, stageId, validIds)
      : [];
  const snapshotMap = new Map(snapshots.map((s) => [s.id, s.scheduled_at]));

  for (const entry of schedules) {
    if (!entry.matchId || typeof entry.matchId !== 'string') {
      results.push({
        matchId: entry.matchId as string,
        success: false,
        error: 'Invalid matchId',
      });
      continue;
    }

    const { error } = await matches.updateStageMatch(
      ctx.db,
      ctx.tenantId,
      stageId,
      entry.matchId,
      { scheduled_at: (entry.scheduled_at ?? null) as string | null }
    );

    if (error) {
      results.push({
        matchId: entry.matchId,
        success: false,
        error: 'Database update failed',
      });
      // Échec après une réussite : retour arrière de tout le lot.
      if (succeeded.length > 0) {
        for (const prev of succeeded) {
          await matches.updateStageMatch(
            ctx.db,
            ctx.tenantId,
            stageId,
            prev.matchId,
            {
              scheduled_at: prev.previousScheduledAt,
            }
          );
        }
        throw fail(
          500,
          `Partial failure at match ${entry.matchId}. All ${succeeded.length} previous updates have been rolled back.`,
          undefined,
          { failedMatchId: entry.matchId }
        );
      }
    } else {
      succeeded.push({
        matchId: entry.matchId,
        previousScheduledAt: snapshotMap.get(entry.matchId) ?? null,
      });
      results.push({ matchId: entry.matchId, success: true });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  // Événements de planification : seulement les matchs de CETTE phase (ceux
  // de l'instantané) dont le créneau a changé.
  const requested = new Map<string, string | null>();
  for (const e of schedules) {
    if (typeof e?.matchId !== 'string') continue;
    requested.set(
      e.matchId,
      typeof e.scheduled_at === 'string' ? e.scheduled_at : null
    );
  }
  await emitScheduleEvents(
    succeeded
      .filter((s) => snapshotMap.has(s.matchId))
      .map((s) => ({
        matchId: s.matchId,
        tournamentId,
        scrimId: null,
        previous: s.previousScheduledAt,
        next: requested.get(s.matchId) ?? null,
      })),
    ctx.tenantId
  );

  const undoPayload = {
    type: 'bulk_schedule' as const,
    snapshots: succeeded.map((s) => ({
      matchId: s.matchId,
      fields: { scheduled_at: s.previousScheduledAt },
    })),
  };

  return {
    result: { results, successCount, undoPayload },
    audit: batchAudit(stageId, tournamentId, {
      action: 'bulk_schedule',
      count: schedules.length,
      successCount,
      schedules,
    }),
  };
}

const VALID_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'postponed',
  'disputed',
  'walkover',
];
const BULK_EDITABLE_FIELDS = [
  'status',
  'best_of',
  'round_number',
  'notes',
  'stream_url',
  'lobby_code',
] as const;

/** PUT : édition en masse `{ matchIds, fields }` (liste blanche de champs). */
export async function bulkUpdate(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { tournament_id: tournamentId } = await loadStage(ctx, stageId);
  const matchIds = body.matchIds as string[];
  const fields = body.fields as Record<string, unknown> | undefined;

  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    throw fail(400, "Body must include non-empty array 'matchIds'");
  }
  if (
    !fields ||
    typeof fields !== 'object' ||
    Object.keys(fields).length === 0
  ) {
    throw fail(400, "Body must include non-empty object 'fields'");
  }

  const updatePayload: Record<string, unknown> = {};
  for (const key of BULK_EDITABLE_FIELDS) {
    if (key in fields) updatePayload[key] = fields[key];
  }
  if (Object.keys(updatePayload).length === 0) {
    throw fail(
      400,
      `No valid fields. Allowed: ${BULK_EDITABLE_FIELDS.join(', ')}`
    );
  }
  if (
    'status' in updatePayload &&
    !VALID_STATUSES.includes(updatePayload.status as string)
  ) {
    throw fail(400, `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
  }
  if ('best_of' in updatePayload && updatePayload.best_of !== null) {
    const bo = Number(updatePayload.best_of);
    if (!Number.isInteger(bo) || bo < 1 || bo > 15) {
      throw fail(400, 'best_of must be an integer between 1 and 15');
    }
    updatePayload.best_of = bo;
  }

  const fieldKeys = Object.keys(updatePayload);
  const snapshotRows = await matches.fieldSnapshots(
    ctx.db,
    ctx.tenantId,
    stageId,
    matchIds,
    ['id', ...fieldKeys].join(', ')
  );

  // Réouverture en masse : purge des reports capitaines des SEULS matchs qui
  // repassent à un statut reportable, en une requête, AVANT l'écriture.
  let purgedReports: PurgedScoreReport[] = [];
  if ('status' in updatePayload) {
    const reopenedIds = snapshotRows
      .filter((row) =>
        matchTransitionPurgesReports(
          row.status as string,
          updatePayload.status as string
        )
      )
      .map((row) => row.id);
    if (reopenedIds.length > 0) {
      const purge = await purgeScoreReports('match', ctx.tenantId, reopenedIds);
      if (!purge.ok) throw fail(500, `${purge.error} Aucun match modifié.`);
      purgedReports = purge.purged;
    }
  }

  const { error, count } = await matches.updateStageMatches(
    ctx.db,
    ctx.tenantId,
    stageId,
    matchIds,
    updatePayload as TablesUpdate<'matches'>
  );
  if (error) {
    ctx.logger.error('bulk update matches error:', error);
    throw fail(500, 'Failed to update matches');
  }

  const undoPayload = {
    type: 'bulk_update' as const,
    snapshots: snapshotRows.map((row) => {
      const f: Record<string, unknown> = {};
      for (const k of fieldKeys) f[k] = row[k] ?? null;
      return { matchId: row.id, fields: f };
    }),
  };

  return {
    result: {
      success: true,
      count: count ?? matchIds.length,
      fields: updatePayload,
      undoPayload,
    },
    audit: batchAudit(stageId, tournamentId, {
      action: 'bulk_update',
      matchIds,
      fields: updatePayload,
      count: matchIds.length,
      ...(purgedReports.length > 0 ? { purged_reports: purgedReports } : {}),
    }),
  };
}

/** DELETE : annulation (défaut) ou suppression définitive (`hard`). */
export async function bulkDelete(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { tournament_id: tournamentId } = await loadStage(ctx, stageId);
  const matchIds = body.matchIds as string[];
  const hard = body.hard ?? false;

  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    throw fail(400, "Body must include non-empty array 'matchIds'");
  }

  let undoPayload: {
    type: string;
    snapshots: { matchId: string; fields: Record<string, unknown> }[];
  } | null = null;

  if (!hard) {
    const rows = await matches.cancelSnapshots(
      ctx.db,
      ctx.tenantId,
      stageId,
      matchIds
    );
    undoPayload = {
      type: 'bulk_cancel',
      snapshots: rows.map((row) => ({
        matchId: row.id,
        fields: {
          status: row.status,
          team1_score: row.team1_score,
          team2_score: row.team2_score,
          winner_team_id: row.winner_team_id,
        },
      })),
    };
  }

  if (hard) {
    // Un match qui a payé des récompenses TCG s'annule, il ne se supprime
    // pas. Tout ou rien.
    const paidRead = await readPaidMatchIds(ctx.tenantId, matchIds);
    if (!paidRead.ok) {
      throw fail(
        500,
        'Impossible de vérifier les récompenses TCG de ces matchs : suppression annulée.',
        'TCG_REWARDS_UNREADABLE'
      );
    }
    if (paidRead.paid.size > 0) {
      throw fail(
        409,
        `${paidRead.paid.size} match(s) ont déjà distribué des récompenses TCG : annule-les plutôt que de les supprimer.`,
        'MATCH_HAS_TCG_REWARDS',
        { paidMatchIds: [...paidRead.paid] }
      );
    }
    const { error } = await matches.deleteStageMatches(
      ctx.db,
      ctx.tenantId,
      stageId,
      matchIds
    );
    if (error) {
      ctx.logger.error('bulk hard delete matches error:', error);
      throw fail(500, 'Failed to delete matches');
    }
  } else {
    const { error } = await matches.updateStageMatches(
      ctx.db,
      ctx.tenantId,
      stageId,
      matchIds,
      {
        status: 'cancelled',
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
      }
    );
    if (error) {
      ctx.logger.error('bulk cancel matches error:', error);
      throw fail(500, 'Failed to cancel matches');
    }
  }

  return {
    result: {
      success: true,
      count: matchIds.length,
      hard,
      ...(undoPayload ? { undoPayload } : {}),
    },
    audit: batchAudit(stageId, tournamentId, {
      action: hard ? 'bulk_hard_delete' : 'bulk_cancel',
      matchIds,
      count: matchIds.length,
    }),
  };
}

/** POST : annulation d'une opération en masse (`action: 'undo'`). */
export async function bulkUndo(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { tournament_id: tournamentId } = await loadStage(ctx, stageId);
  const undoPayload = body.undoPayload as
    | { type?: unknown; snapshots?: unknown }
    | undefined;

  if (body.action !== 'undo') {
    throw fail(400, "POST body must include action: 'undo'");
  }
  if (
    !undoPayload ||
    !undoPayload.type ||
    !Array.isArray(undoPayload.snapshots) ||
    undoPayload.snapshots.length === 0
  ) {
    throw fail(
      400,
      'Body must include undoPayload with type and non-empty snapshots array'
    );
  }

  const snapshots = undoPayload.snapshots as Array<{
    matchId: string;
    fields: Record<string, unknown>;
  }>;
  const results: ItemResult[] = [];

  // Un undo qui restaure `scheduled_at` DÉPLACE des matchs : le bot doit en
  // être prévenu. On relit les créneaux actuels avant d'écrire.
  const restoredSchedule = new Map<string, string | null>();
  for (const snap of snapshots) {
    if (
      snap &&
      typeof snap.matchId === 'string' &&
      snap.fields &&
      typeof snap.fields === 'object' &&
      'scheduled_at' in snap.fields
    ) {
      const v = snap.fields.scheduled_at;
      restoredSchedule.set(snap.matchId, typeof v === 'string' ? v : null);
    }
  }
  const currentSchedule = new Map<string, string | null>();
  if (restoredSchedule.size > 0) {
    for (const r of await matches.scheduleSnapshots(
      ctx.db,
      ctx.tenantId,
      stageId,
      [...restoredSchedule.keys()]
    )) {
      currentSchedule.set(r.id, r.scheduled_at ?? null);
    }
  }

  for (const snap of snapshots) {
    if (!snap.matchId || typeof snap.matchId !== 'string' || !snap.fields) {
      results.push({
        matchId: snap.matchId,
        success: false,
        error: 'Invalid snapshot entry',
      });
      continue;
    }
    const { error } = await matches.updateStageMatch(
      ctx.db,
      ctx.tenantId,
      stageId,
      snap.matchId,
      snap.fields as TablesUpdate<'matches'>
    );
    results.push(
      error
        ? {
            matchId: snap.matchId,
            success: false,
            error: 'Database update failed',
          }
        : { matchId: snap.matchId, success: true }
    );
  }

  const restoredOk = new Set(
    results.filter((r) => r.success).map((r) => r.matchId)
  );
  await emitScheduleEvents(
    [...restoredSchedule.entries()]
      .filter(([mid]) => restoredOk.has(mid) && currentSchedule.has(mid))
      .map(([mid, next]) => ({
        matchId: mid,
        tournamentId,
        scrimId: null,
        previous: currentSchedule.get(mid) ?? null,
        next,
      })),
    ctx.tenantId
  );

  const successCount = results.filter((r) => r.success).length;

  return {
    result: { success: successCount > 0, results, successCount },
    audit: batchAudit(stageId, tournamentId, {
      action: 'bulk_undo',
      originalType: undoPayload.type,
      count: snapshots.length,
      successCount,
    }),
  };
}
