// features/admin/stages/service/rollback.ts — filets de sécurité d'une phase :
// snapshots de bracket (liste, création manuelle, restauration) et overrides
// de départage (« A passe devant B à égalité », appliqués par
// computeStageStandings).
//
// Moteurs : utils/bracket/snapshot, utils/stages/standingsCache. Ces gestes
// étaient journalisés sous `other` + `payload.subject` ; ils ont désormais
// leur slug propre (payload inchangé, `subject` compris).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { StaffRole } from '@/types/admin';
import { hasAtLeastRole } from '@/utils/staffRoles';
import { isValidUUID } from '@/utils/apiHelpers';
import { invalidateStandingsCache } from '@/utils/stages/standingsCache';
import {
  createBracketSnapshot,
  restoreBracketSnapshot,
} from '@/utils/bracket/snapshot';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as related from '../repository/related';
import { fail } from './common';
import { staffIdOf } from './seeding';

type Body = Record<string, unknown>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** 404 propre avant tout geste (le FK CASCADE protège déjà côté base). */
async function loadStage(ctx: ServiceContext, stageId: string) {
  const { row } = await stages.getStageCore(ctx.db, ctx.tenantId, stageId);
  if (!row) throw fail(404, 'Stage introuvable.');
  return row;
}

/* ------------------------------ snapshots ------------------------------- */

export async function listSnapshots(
  ctx: ServiceContext,
  stageId: string,
  rawLimit: unknown
) {
  await loadStage(ctx, stageId);
  const n = Number(rawLimit);
  const limit = Number.isFinite(n)
    ? Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const { rows, error } = await related.listSnapshots(
    ctx.db,
    ctx.tenantId,
    stageId,
    limit
  );
  if (error) {
    ctx.logger.error('[admin/stages/snapshots] list error', error);
    throw fail(500, 'Erreur lors du chargement des snapshots.');
  }
  return { snapshots: rows ?? [] };
}

export async function createSnapshot(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<{ snapshotId: number; matchCount: number }>> {
  const stage = await loadStage(ctx, stageId);
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 200)
      : 'manual';

  const result = await createBracketSnapshot({
    stageId,
    reason,
    staffId: staffIdOf(ctx),
    tenantId: ctx.tenantId,
  });
  if (!result) throw fail(500, 'Échec de la création du snapshot.');

  return {
    result: { snapshotId: result.id, matchCount: result.matchCount },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        subject: 'bracket_snapshot_created',
        snapshot_id: result.id,
        match_count: result.matchCount,
        reason,
      },
    },
  };
}

/** Restauration : geste destructif, admin et plus (pas la seule permission). */
export async function restoreSnapshot(
  ctx: ServiceContext,
  stageId: string,
  role: StaffRole,
  body: Body
): Promise<Audited<{ success: true; restored: number; missing: number }>> {
  const stage = await loadStage(ctx, stageId);

  if (!hasAtLeastRole(role, 'admin')) {
    throw fail(403, 'Seul un admin peut restaurer un snapshot.');
  }

  const snapshotId =
    typeof body.snapshotId === 'number' && Number.isInteger(body.snapshotId)
      ? body.snapshotId
      : null;
  if (!snapshotId || snapshotId <= 0) {
    throw fail(400, 'snapshotId (integer) requis.');
  }

  const snap = await related.findSnapshot(
    ctx.db,
    ctx.tenantId,
    stageId,
    snapshotId
  );
  if (!snap) throw fail(404, 'Snapshot introuvable pour ce stage.');

  // Auto-snapshot AVANT restauration (« annuler la restauration »). Best-effort.
  await createBracketSnapshot({
    stageId,
    reason: 'pre_restore',
    staffId: staffIdOf(ctx),
    tenantId: ctx.tenantId,
  }).catch((e) =>
    ctx.logger.error('[snapshots/restore] pre_restore snapshot failed', e)
  );

  const result = await restoreBracketSnapshot(snapshotId);
  if (!result) throw fail(500, 'Échec de la restauration du snapshot.');

  // Scores / vainqueurs potentiellement changés en nombre.
  invalidateStandingsCache(stageId);

  return {
    result: {
      success: true,
      restored: result.restored,
      missing: result.missing,
    },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        subject: 'bracket_snapshot_restored',
        snapshot_id: snapshotId,
        restored: result.restored,
        missing: result.missing,
        snapshot_reason: snap.reason,
        snapshot_taken_at: snap.taken_at,
      },
    },
  };
}

/* ------------------------ overrides de départage ------------------------ */

export async function listOverrides(ctx: ServiceContext, stageId: string) {
  await loadStage(ctx, stageId);
  const { rows, error } = await related.listOverrides(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (error) {
    ctx.logger.error('[tiebreaker-override] list error', error);
    throw fail(500, 'Erreur lors du chargement des overrides.');
  }
  return { overrides: rows ?? [] };
}

export async function setOverride(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<{ override: unknown }>> {
  const stage = await loadStage(ctx, stageId);

  const winnerTeamId =
    typeof body.winnerTeamId === 'string' ? body.winnerTeamId : '';
  const loserTeamId =
    typeof body.loserTeamId === 'string' ? body.loserTeamId : '';
  if (!isValidUUID(winnerTeamId) || !isValidUUID(loserTeamId)) {
    throw fail(400, 'winnerTeamId et loserTeamId UUID requis.');
  }
  if (winnerTeamId === loserTeamId) {
    throw fail(400, 'winner et loser doivent être différents.');
  }
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : null;

  const found = new Set(
    await stages.stageTeamIdsAmong(ctx.db, ctx.tenantId, stageId, [
      winnerTeamId,
      loserTeamId,
    ])
  );
  if (!found.has(winnerTeamId) || !found.has(loserTeamId)) {
    throw fail(400, 'Les deux équipes doivent être inscrites au stage.');
  }

  const { row, error } = await related.insertOverride(ctx.db, {
    tenant_id: ctx.tenantId,
    stage_id: stageId,
    winner_team_id: winnerTeamId,
    loser_team_id: loserTeamId,
    reason,
    set_by_staff_id: staffIdOf(ctx),
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw fail(409, 'Cet override existe déjà.', 'OVERRIDE_EXISTS');
    }
    ctx.logger.error('[tiebreaker-override] insert error', error);
    throw fail(500, "Échec de l'insertion de l'override.");
  }

  // La prochaine lecture du classement applique l'override immédiatement.
  invalidateStandingsCache(stageId);

  return {
    result: { override: row },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        subject: 'tiebreaker_override_set',
        winner_team_id: winnerTeamId,
        loser_team_id: loserTeamId,
        reason,
      },
    },
  };
}

export async function removeOverride(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<{ success: true }>> {
  const stage = await loadStage(ctx, stageId);

  const overrideId =
    typeof body.id === 'number' && Number.isInteger(body.id) ? body.id : null;
  if (!overrideId || overrideId <= 0) throw fail(400, 'id (integer) requis.');

  const before = await related.findOverride(
    ctx.db,
    ctx.tenantId,
    stageId,
    overrideId
  );
  if (!before) throw fail(404, 'Override introuvable.');

  const { error } = await related.deleteOverride(
    ctx.db,
    ctx.tenantId,
    stageId,
    overrideId
  );
  if (error) {
    ctx.logger.error('[tiebreaker-override] delete error', error);
    throw fail(500, "Échec de la suppression de l'override.");
  }

  invalidateStandingsCache(stageId);

  return {
    result: { success: true },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        subject: 'tiebreaker_override_removed',
        override_id: overrideId,
        winner_team_id: before.winner_team_id,
        loser_team_id: before.loser_team_id,
      },
    },
  };
}
