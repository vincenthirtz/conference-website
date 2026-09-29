// features/admin/tournaments/service/prizePool.ts — cagnotte (prize pool)
// d'un tournoi côté organisateur : configuration + contributions.
//
// Tables RLS service-role-only, scopées strictement par tenant (voir
// database/migrations/create_prize_pool_tables.sql). `raised_amount_cents`
// est géré EXCLUSIVEMENT par le webhook HelloAsso : jamais écrit ici.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { formatZodError } from '@/utils/validation';
import { canCollectForTenant } from '@/utils/billing/helloassoAccount';
import type { Audited } from '../../_shared/audited';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/ops';
import { PrizePoolUpsertSchema } from '../schemas';
import { codedTournamentId, fail, failWith, type StatusResult } from './common';

/** `[id]` codé + tournoi du tenant (cohérence + FK). */
async function resolveTournament(ctx: ServiceContext, rawId: unknown) {
  const id = codedTournamentId(
    rawId,
    'Invalid tournament id.',
    'INVALID_TOURNAMENT_ID'
  );
  const { data, error } = await tRepo.findTournament(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error(
      '[admin/tournaments/prize-pool] tournament lookup error',
      error
    );
    fail(500, 'Server error.');
  }
  if (!data) failWith(404, 'Tournament not found.', 'UNKNOWN_TOURNAMENT');
  return id;
}

export async function getPrizePool(ctx: ServiceContext, rawId: unknown) {
  const tournamentId = await resolveTournament(ctx, rawId);
  const { data: pool, error: poolErr } = await repo.prizePoolView(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (poolErr) {
    ctx.logger.error(
      '[admin/tournaments/prize-pool] pool lookup error',
      poolErr
    );
    fail(500, 'Server error.');
  }
  if (!pool) return { pool: null, contributions: [], contributorCount: 0 };

  const { data: contributions, error: cErr } =
    await repo.prizePoolContributions(ctx.db, ctx.tenantId, pool.id);
  if (cErr) {
    ctx.logger.error(
      '[admin/tournaments/prize-pool] contributions error',
      cErr
    );
    fail(500, 'Server error.');
  }
  const list = contributions ?? [];
  const base =
    typeof pool.base_amount_cents === 'number' ? pool.base_amount_cents : 0;
  const raised =
    typeof pool.raised_amount_cents === 'number' ? pool.raised_amount_cents : 0;
  return {
    pool: { ...pool, total_cents: base + raised },
    contributions: list,
    contributorCount: list.length,
  };
}

/** Crée (201) ou met à jour (200) la cagnotte du tournoi. */
export async function upsertPrizePool(
  ctx: ServiceContext,
  rawId: unknown,
  rawBody: unknown
): Promise<Audited<StatusResult<unknown>>> {
  const tournamentId = await resolveTournament(ctx, rawId);
  const parsed = PrizePoolUpsertSchema.safeParse(rawBody);
  if (!parsed.success) {
    failWith(400, formatZodError(parsed.error), 'INVALID_BODY');
  }
  const body = parsed.data;

  // OUVRIR une cagnotte, c'est encaisser : l'espace doit avoir relié SON
  // compte HelloAsso (Q036). Préparer la cagnotte fermée reste possible.
  if (body.is_open === true && !(await canCollectForTenant(ctx.tenantId))) {
    failWith(
      409,
      'Reliez d’abord votre compte HelloAsso (Réglages › Encaissement) : sans lui, les contributions ne peuvent pas être encaissées par votre structure.',
      'HELLOASSO_NOT_CONNECTED'
    );
  }

  const { data: existing, error: exErr } = await repo.prizePoolId(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (exErr) {
    ctx.logger.error(
      '[admin/tournaments/prize-pool] existing lookup error',
      exErr
    );
    fail(500, 'Server error.');
  }

  const audit = (action: 'create_prize_pool' | 'update_prize_pool') => ({
    action,
    entity_type: 'tournament',
    entity_id: tournamentId,
    tournament_id: tournamentId,
    payload: { action, changes: body },
  });

  if (existing) {
    // N'écrase que les champs fournis.
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.title !== undefined) patch.title = body.title;
    if (body.goal_amount_cents !== undefined) {
      patch.goal_amount_cents = body.goal_amount_cents;
    }
    if (body.base_amount_cents !== undefined) {
      patch.base_amount_cents = body.base_amount_cents;
    }
    if (body.is_open !== undefined) patch.is_open = body.is_open;
    const { data: updated, error: updErr } = await repo.updatePrizePool(
      ctx.db,
      ctx.tenantId,
      existing.id,
      patch as TablesUpdate<'tournament_prize_pools'>
    );
    if (updErr) {
      ctx.logger.error('[admin/tournaments/prize-pool] update error', updErr);
      fail(500, 'Failed to update prize pool.');
    }
    return {
      result: { status: 200, body: { pool: updated } },
      audit: audit('update_prize_pool'),
    };
  }

  const { data: created, error: insErr } = await repo.insertPrizePool(ctx.db, {
    tournament_id: tournamentId,
    tenant_id: ctx.tenantId,
    title: body.title ?? null,
    goal_amount_cents: body.goal_amount_cents ?? null,
    base_amount_cents: body.base_amount_cents ?? 0,
    is_open: body.is_open ?? false,
  });
  if (insErr || !created) {
    ctx.logger.error('[admin/tournaments/prize-pool] insert error', insErr);
    fail(500, 'Failed to create prize pool.');
  }
  return {
    result: { status: 201, body: { pool: created } },
    audit: audit('create_prize_pool'),
  };
}
