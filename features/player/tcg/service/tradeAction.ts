// features/player/tcg/service/tradeAction.ts — accepter, refuser, annuler une
// proposition (lot P14, extrait de pages/api/player/tcg/trades/[tradeId].ts,
// même contrat).
//
// ACCEPTER = UNE FONCTION SQL (`tcg_accept_trade`) : verrous sur les deux
// joueuses et les cartes, possession REVÉRIFIÉE, déplacement, statut — tout ou
// rien. Rejouée par l'appelante : 200 `replayed: true`, sans réécrire ni
// réannoncer. REFUSER / ANNULER = une écriture CONDITIONNELLE
// (`status = 'pending'`) : la ligne rendue EST la transition, seule elle
// annonce. L'Idempotency-Key de la route s'y AJOUTE.
//
// 404 PLUTÔT QUE 403 sur une proposition qui ne concerne pas l'appelante : on
// ne confirme pas son existence.
//
// La régénération des fiches publiques (`revalidatePlayerCard`) est HTTP :
// elle arrive en callback (`revalidateCard`), le service ignore Next.

import {
  TRADE_MAX_ACCEPTED_PER_DAY,
  TRADE_MIN_ACCOUNT_AGE_DAYS,
  TRADE_MIN_COLLECTION_AGE_DAYS,
  tradeActionSchema,
  tradeIdSchema,
} from '@/utils/tcg/tradeRules';
import {
  announceTradeResolved,
  expireOverdueTrades,
  type TradeResolution,
} from '@/utils/tcg/trades';
import * as repo from '../repository/trades';
import { refuse } from './errors';
import type { TcgServiceContext } from './context';

const ACCEPT_REFUSALS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Proposition introuvable.' },
  not_pending: { status: 409, error: 'Cette proposition est déjà close.' },
  expired: { status: 409, error: 'Cette proposition a expiré.' },
  stale: {
    status: 409,
    error: 'Une carte offerte n’est plus disponible : proposition annulée.',
  },
  requested_unavailable: {
    status: 409,
    error: 'Tu ne possèdes plus une carte demandée.',
  },
  daily_limit: {
    status: 429,
    error: 'Tu as atteint le nombre d’échanges du jour.',
  },
  partner_daily_limit: {
    status: 409,
    error: 'Cette joueuse a atteint le nombre d’échanges du jour.',
  },
  not_eligible: {
    status: 403,
    error: 'Un des deux comptes est trop récent pour échanger.',
  },
};

type ActionCtx = TcgServiceContext & {
  /** Régénère la fiche publique d'une joueuse (vitrine) — fourni par la route. */
  revalidateCard: (userId: string) => Promise<void>;
};

export async function actOnTrade(
  ctx: ActionCtx,
  rawTradeId: unknown,
  rawBody: unknown
) {
  const idParsed = tradeIdSchema.safeParse(rawTradeId);
  if (!idParsed.success) {
    throw refuse(400, 'Identifiant invalide.', 'invalid_trade_id');
  }
  const bodyParsed = tradeActionSchema.safeParse(rawBody ?? {});
  if (!bodyParsed.success) {
    throw refuse(400, 'Action invalide.', 'invalid_body', {
      fields: bodyParsed.error.flatten().fieldErrors,
    });
  }
  const tradeId = idParsed.data;
  const { action } = bodyParsed.data;
  if (action === 'accept') return accept(ctx, tradeId);
  return resolveSimple(ctx, tradeId, action);
}

async function accept(ctx: ActionCtx, tradeId: string) {
  const { db, tenantId, userId, logger } = ctx;
  const { result, error } = await repo.acceptTradeRpc(db, {
    p_tenant_id: tenantId,
    p_trade_id: tradeId,
    p_user_id: userId,
    p_max_accepted_per_day: TRADE_MAX_ACCEPTED_PER_DAY,
    p_min_account_age_days: TRADE_MIN_ACCOUNT_AGE_DAYS,
    p_min_collection_age_days: TRADE_MIN_COLLECTION_AGE_DAYS,
  });
  if (error) {
    logger.error(
      '[tcg/trades] acceptation impossible (%s): %s',
      tradeId,
      (error as { message?: string }).message ?? String(error)
    );
    throw refuse(500, 'Acceptation impossible.');
  }

  const status = typeof result.status === 'string' ? result.status : '';

  if (status === 'accepted') {
    const proposerId = String(result.proposerId);
    const recipientId = String(result.recipientId);
    logger.info(
      '[tcg/trades] échange %s accepté : %s ↔ %s',
      tradeId,
      proposerId,
      recipientId
    );
    // L'acceptation a pu annuler d'autres propositions devenues caduques
    // (cartes parties) : chacune est annoncée à sa proposante.
    const resolutions: TradeResolution[] = [
      { tradeId, proposerId, recipientId, outcome: 'accepted' },
    ];
    const cancelled = Array.isArray(result.cancelled) ? result.cancelled : [];
    for (const c of cancelled as Array<Record<string, unknown>>) {
      if (
        typeof c.tradeId === 'string' &&
        typeof c.proposerId === 'string' &&
        typeof c.recipientId === 'string'
      ) {
        resolutions.push({
          tradeId: c.tradeId,
          proposerId: c.proposerId,
          recipientId: c.recipientId,
          outcome: 'cancelled',
        });
      }
    }
    await Promise.all([
      announceTradeResolved(tenantId, resolutions),
      ctx.revalidateCard(proposerId),
      ctx.revalidateCard(recipientId),
    ]);
    return { trade: { id: tradeId, status: 'accepted' }, replayed: false };
  }

  if (status === 'already_accepted') {
    return { trade: { id: tradeId, status: 'accepted' }, replayed: true };
  }

  if (status === 'expired' || status === 'stale') {
    if (
      typeof result.proposerId === 'string' &&
      typeof result.recipientId === 'string'
    ) {
      await announceTradeResolved(tenantId, [
        {
          tradeId,
          proposerId: result.proposerId,
          recipientId: result.recipientId,
          outcome: status === 'expired' ? 'expired' : 'cancelled',
        },
      ]);
    }
  }

  const refusal = ACCEPT_REFUSALS[status];
  if (!refusal) {
    logger.error('[tcg/trades] réponse inattendue: %s', status || 'vide');
    throw refuse(500, 'Acceptation impossible.');
  }
  throw refuse(refusal.status, refusal.error, status);
}

async function resolveSimple(
  ctx: ActionCtx,
  tradeId: string,
  action: 'decline' | 'cancel'
) {
  const { db, tenantId, userId, logger } = ctx;
  const actorColumn = action === 'decline' ? 'recipient_id' : 'proposer_id';
  const targetStatus = action === 'decline' ? 'declined' : 'cancelled';

  await expireOverdueTrades({ tenantId, userId });

  const nowIso = new Date().toISOString();
  const { changed, error } = await repo.resolvePendingTrade(db, {
    tenantId,
    tradeId,
    userId,
    actorColumn,
    targetStatus,
    resolutionReason: action === 'cancel' ? 'proposer_cancelled' : null,
    nowIso,
  });
  if (error) {
    logger.error(
      '[tcg/trades] %s impossible (%s): %s',
      action,
      tradeId,
      error.message
    );
    throw refuse(500, 'Action impossible.');
  }

  if (changed.length > 0) {
    const row = changed[0];
    logger.info('[tcg/trades] proposition %s : %s', tradeId, targetStatus);
    // Un refus s'annonce à la proposante ; une annulation est SON geste.
    if (action === 'decline') {
      await announceTradeResolved(tenantId, [
        {
          tradeId,
          proposerId: row.proposer_id,
          recipientId: row.recipient_id,
          outcome: 'declined',
        },
      ]);
    }
    return { trade: { id: tradeId, status: targetStatus }, replayed: false };
  }

  // Rien n'a bougé : rejeu, proposition close, expirée, ou pas la mienne.
  const { trade, error: readError } = await repo.readMyTrade(db, {
    tenantId,
    tradeId,
    userId,
    actorColumn,
  });
  if (readError) {
    logger.error('[tcg/trades] relecture impossible: %s', readError.message);
    throw refuse(500, 'Action impossible.');
  }
  if (!trade) throw refuse(404, 'Proposition introuvable.', 'not_found');
  const isReplay =
    trade.status === targetStatus &&
    (action === 'decline' || trade.resolution_reason === 'proposer_cancelled');
  if (isReplay) {
    return { trade: { id: tradeId, status: targetStatus }, replayed: true };
  }
  throw refuse(
    409,
    trade.status === 'expired'
      ? 'Cette proposition a expiré.'
      : 'Cette proposition est déjà close.',
    trade.status === 'expired' ? 'expired' : 'not_pending'
  );
}
