// features/admin/tournaments/service/bulk.ts — opérations en masse sur les
// matchs d'un tournoi (toutes phases) : décalage d'un tour, changement de
// phase. Distinct de /api/admin/stages/[stageId]/bulk-matches (une phase).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitScheduleEvents } from '@/utils/matches/scheduleEvents';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/matches';
import { fail } from './common';

/* ---------------------------------------------------------------------------
 * Opérations en masse (niveau tournoi, toutes phases)
 * ------------------------------------------------------------------------ */

export async function runBulkMatches(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<Audited<ShiftRoundResult | ReassignStageResult>> {
  if (body.mode === 'shift_round') return shiftRound(ctx, tournamentId, body);
  if (body.mode === 'reassign_stage') {
    return reassignStage(ctx, tournamentId, body);
  }
  fail(400, "Invalid mode. Use 'shift_round' or 'reassign_stage'.");
}

type ShiftRoundResult = {
  mode: 'shift_round';
  shifted: number;
  ignored: number;
  offsetMinutes: number;
};

type ReassignStageResult = {
  mode: 'reassign_stage';
  moved: string[];
  skipped: { matchId: string; reason: string }[];
  targetStageId: string;
};

async function shiftRound(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<Audited<ShiftRoundResult>> {
  const { stageId, roundNumber, offsetMinutes } = body;
  if (!stageId || typeof stageId !== 'string' || !isValidUUID(stageId)) {
    fail(400, 'Invalid stageId');
  }
  if (typeof roundNumber !== 'number' || !Number.isInteger(roundNumber)) {
    fail(400, 'roundNumber must be an integer');
  }
  if (typeof offsetMinutes !== 'number' || !Number.isFinite(offsetMinutes)) {
    fail(400, 'offsetMinutes must be a number');
  }
  if (offsetMinutes === 0) {
    fail(400, 'offsetMinutes cannot be 0 (no shift to apply)');
  }

  const stage = await repo.findStage(ctx.db, ctx.tenantId, stageId);
  if (!stage || stage.tournament_id !== tournamentId) {
    fail(404, 'Stage not found in this tournament');
  }

  const { data: matches, error: fetchErr } = await repo.roundMatches(
    ctx.db,
    ctx.tenantId,
    stageId,
    roundNumber
  );
  if (fetchErr) fail(500, 'Failed to fetch round matches');

  const list = matches ?? [];
  const toShift = list.filter((m) => m.scheduled_at);
  const ignored = list.length - toShift.length;
  const noOp = {
    mode: 'shift_round' as const,
    shifted: 0,
    ignored,
    offsetMinutes,
  };
  // Rien de décalé : rien à journaliser (comportement d'origine).
  if (toShift.length === 0) {
    return { result: noOp, audit: { skip: true } } satisfies Audited<unknown>;
  }

  const offsetMs = offsetMinutes * 60 * 1000;
  // Un update par match (décalage relatif) ; instantané pour rollback en cas
  // d'échec partiel.
  const succeeded: { id: string; previous: string }[] = [];
  for (const m of toShift) {
    const previous = m.scheduled_at as string;
    const newDate = new Date(
      new Date(previous).getTime() + offsetMs
    ).toISOString();
    const { error: updErr } = await repo.updateMatch(
      ctx.db,
      ctx.tenantId,
      m.id,
      { scheduled_at: newDate, updated_at: new Date().toISOString() }
    );
    if (updErr) {
      for (const prev of succeeded) {
        await repo.updateMatch(ctx.db, ctx.tenantId, prev.id, {
          scheduled_at: prev.previous,
        });
      }
      fail(500, `Echec sur le match ${m.id}. Rollback effectue.`);
    }
    succeeded.push({ id: m.id, previous });
  }

  // Chaque match décalé AVAIT une date : match.scheduled + match.rescheduled.
  await emitScheduleEvents(
    succeeded.map((s) => ({
      matchId: s.id,
      tournamentId,
      scrimId: null,
      previous: s.previous,
      next: new Date(new Date(s.previous).getTime() + offsetMs).toISOString(),
    })),
    ctx.tenantId
  );

  return {
    result: { ...noOp, shifted: succeeded.length },
    audit: {
      entity_type: 'match',
      entity_id: stageId,
      tournament_id: tournamentId,
      payload: {
        action: 'shift_round',
        stage_id: stageId,
        round_number: roundNumber,
        offset_minutes: offsetMinutes,
        shifted_count: succeeded.length,
      },
    },
  } satisfies Audited<unknown>;
}

async function reassignStage(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<Audited<ReassignStageResult>> {
  const { matchIds, targetStageId } = body;
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    fail(400, 'matchIds must be a non-empty array');
  }
  if (
    !targetStageId ||
    typeof targetStageId !== 'string' ||
    !isValidUUID(targetStageId)
  ) {
    fail(400, 'Invalid targetStageId');
  }

  const target = await repo.findStage(ctx.db, ctx.tenantId, targetStageId);
  if (!target || target.tournament_id !== tournamentId) {
    fail(404, 'Target stage not found in this tournament');
  }

  const { data: matches, error: matchErr } = await repo.matchesForReassign(
    ctx.db,
    ctx.tenantId,
    matchIds as string[]
  );
  if (matchErr) fail(500, 'Failed to fetch matches');

  const fetched = matches ?? [];
  const moved: string[] = [];
  const skipped: { matchId: string; reason: string }[] = [];
  for (const id of matchIds as string[]) {
    const m = fetched.find((x) => x.id === id);
    let reason: string | null = null;
    if (!m) reason = 'not_found';
    else if (m.tournament_id !== tournamentId) reason = 'wrong_tournament';
    else if (m.stage_id === targetStageId) reason = 'already_in_target_stage';
    else if (m.status === 'disputed') reason = 'match_disputed';
    // Liens de propagation actifs : les défaire d'abord, sinon le bracket casse.
    else if (m.next_match_win_id || m.next_match_lose_id) {
      reason = 'has_bracket_links';
    }
    if (reason) {
      skipped.push({ matchId: id, reason });
      continue;
    }
    const { error: updErr } = await repo.updateMatch(ctx.db, ctx.tenantId, id, {
      stage_id: targetStageId,
      // L'assignation de groupe dépend de la phase cible.
      group_key: null,
      updated_at: new Date().toISOString(),
    });
    if (updErr) skipped.push({ matchId: id, reason: 'update_failed' });
    else moved.push(id);
  }

  return {
    result: {
      mode: 'reassign_stage' as const,
      moved,
      skipped,
      targetStageId,
    },
    // Journalisé seulement si au moins un match a bougé (comportement d'origine).
    audit:
      moved.length === 0
        ? { skip: true }
        : {
            entity_type: 'match',
            entity_id: targetStageId,
            tournament_id: tournamentId,
            payload: {
              action: 'reassign_stage',
              target_stage_id: targetStageId,
              moved_count: moved.length,
              moved_ids: moved,
              skipped,
            },
          },
  } satisfies Audited<unknown>;
}
