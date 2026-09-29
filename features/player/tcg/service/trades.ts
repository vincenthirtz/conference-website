// features/player/tcg/service/trades.ts — ma boîte d'échanges et la
// proposition (lot P14, extrait de pages/api/player/tcg/trades/index.ts, même
// contrat).
//
// CARTE CONTRE CARTE, RIEN D'AUTRE : aucun champ pour des pièces, un paquet ou
// un message (`proposeTradeSchema` est strict) — la monnaie reste GAGNÉE,
// jamais transférée.
//
// LA PROPOSITION S'ÉCRIT EN UNE TRANSACTION (`tcg_propose_trade`) :
// consentements, ancienneté, plafonds PAR COMPTE, possession et engagement
// sont vérifiés sous verrous dans la base. Le rate-limit et l'Idempotency-Key
// de la route ne sont que des amortisseurs EN PLUS.
//
// ANNONCE à la destinataire sur le seul statut `proposed`, jamais sur un refus.

import {
  decodePacksCursor,
  encodePacksCursor,
  parsePageLimit,
} from '@/utils/tcg/pageCursor';
import {
  TRADE_DECLINE_COOLDOWN_HOURS,
  TRADE_MAX_CARDS_PER_SIDE,
  TRADE_MAX_PENDING_RECEIVED,
  TRADE_MAX_PENDING_SENT,
  TRADE_MIN_ACCOUNT_AGE_DAYS,
  TRADE_MIN_COLLECTION_AGE_DAYS,
  TRADE_TTL_HOURS,
  proposeTradeSchema,
} from '@/utils/tcg/tradeRules';
import {
  announceTradeProposed,
  expireOverdueTrades,
  hydrateTrades,
} from '@/utils/tcg/trades';
import * as repo from '../repository/trades';
import { refuse } from './errors';
import type { TcgServiceContext } from './context';

/** Une boîte d'échanges se lit par vingtaines : au-delà, plus personne ne lit. */
const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

/**
 * Refus de la fonction SQL → statut HTTP + code STABLE. `recipient_unavailable`
 * regroupe VOLONTAIREMENT « n'accepte pas », « trop récent », « bloquée » et
 * « n'existe pas ici » : distinguer dirait à qui cherche si une personne est là.
 */
const PROPOSE_REFUSALS: Record<string, { status: number; error: string }> = {
  invalid_items: { status: 400, error: 'Cartes invalides.' },
  self_trade: { status: 400, error: 'Pas d’échange avec soi-même.' },
  trading_disabled: {
    status: 403,
    error: 'Active d’abord les échanges pour en proposer.',
  },
  collection_too_recent: {
    status: 403,
    error: 'Ton compte ou ta collection est trop récent pour échanger.',
  },
  recipient_unavailable: {
    status: 409,
    error: 'Cette joueuse ne reçoit pas de propositions.',
  },
  recipient_inbox_full: {
    status: 409,
    error: 'Cette joueuse a trop de propositions en attente.',
  },
  too_many_pending: {
    status: 409,
    error: 'Tu as trop de propositions en attente.',
  },
  already_pending: {
    status: 409,
    error: 'Une proposition à cette joueuse est déjà en attente.',
  },
  recently_declined: {
    status: 409,
    error: 'Elle a refusé récemment : attends avant de reproposer.',
  },
  offered_not_owned: {
    status: 409,
    error: 'Une carte offerte n’est pas disponible à l’échange.',
  },
  requested_not_available: {
    status: 409,
    error: 'Une carte demandée n’est plus proposée en double.',
  },
};

export type TradesQuery = {
  box?: unknown;
  state?: unknown;
  limit?: unknown;
  cursor?: unknown;
};

export async function listTrades(ctx: TcgServiceContext, query: TradesQuery) {
  const { db, tenantId, userId, logger } = ctx;
  const box = query.box ?? 'received';
  if (box !== 'received' && box !== 'sent') {
    throw refuse(400, 'Paramètre box invalide.', 'invalid_box');
  }
  const state = query.state ?? 'open';
  if (state !== 'open' && state !== 'closed') {
    throw refuse(400, 'Paramètre state invalide.', 'invalid_state');
  }
  const limitParam = parsePageLimit(query.limit);
  if (
    limitParam === 'invalid' ||
    (limitParam !== null && limitParam > MAX_PAGE)
  ) {
    throw refuse(400, 'Paramètre limit invalide.', 'invalid_limit');
  }
  const limit = limitParam ?? DEFAULT_PAGE;

  let cursor: { grantedAt: string; id: string } | null = null;
  if (query.cursor !== undefined) {
    cursor = decodePacksCursor(query.cursor);
    if (!cursor) throw refuse(400, 'Curseur invalide.', 'invalid_cursor');
  }

  // Une proposition échue ne doit pas s'afficher « en attente ».
  await expireOverdueTrades({ tenantId, userId });

  const { rows, error } = await repo.readTradesPage(db, {
    tenantId,
    userId,
    box,
    state,
    after: cursor,
    limit,
  });
  if (error) {
    logger.error('[tcg/trades] lecture impossible: %s', error.message);
    throw refuse(500, 'Lecture impossible.');
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  const hydrated = await hydrateTrades(tenantId, userId, page);
  if (!hydrated.ok) throw refuse(500, 'Lecture impossible.');

  return {
    trades: hydrated.trades,
    nextCursor:
      hasMore && last
        ? encodePacksCursor({ grantedAt: last.created_at, id: last.id })
        : null,
  };
}

export async function proposeTrade(ctx: TcgServiceContext, rawBody: unknown) {
  const { db, tenantId, userId, logger } = ctx;
  const parsed = proposeTradeSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw refuse(400, 'Proposition invalide.', 'invalid_body', {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const body = parsed.data;

  if (body.recipientId === userId.toLowerCase()) {
    throw refuse(400, 'Pas d’échange avec soi-même.', 'self_trade');
  }

  await expireOverdueTrades({ tenantId, userId });

  const { result, error } = await repo.proposeTradeRpc(db, {
    p_tenant_id: tenantId,
    p_proposer_id: userId,
    p_recipient_id: body.recipientId,
    p_offered: body.offered,
    p_requested: body.requested,
    p_ttl_hours: TRADE_TTL_HOURS,
    p_max_cards: TRADE_MAX_CARDS_PER_SIDE,
    p_max_pending_sent: TRADE_MAX_PENDING_SENT,
    p_max_pending_received: TRADE_MAX_PENDING_RECEIVED,
    p_decline_cooldown_hours: TRADE_DECLINE_COOLDOWN_HOURS,
    p_min_account_age_days: TRADE_MIN_ACCOUNT_AGE_DAYS,
    p_min_collection_age_days: TRADE_MIN_COLLECTION_AGE_DAYS,
  });

  if (error) {
    // Course perdue sur l'index unique « une proposition en attente par
    // paire » : c'est un refus ordinaire, pas une panne.
    if ((error as { code?: string }).code === '23505') {
      throw refuse(
        409,
        PROPOSE_REFUSALS.already_pending.error,
        'already_pending'
      );
    }
    logger.error(
      '[tcg/trades] proposition impossible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    throw refuse(500, 'Proposition impossible.');
  }

  const status = typeof result.status === 'string' ? result.status : '';
  if (status !== 'proposed') {
    const refusal = PROPOSE_REFUSALS[status];
    if (!refusal) {
      logger.error('[tcg/trades] réponse inattendue: %s', status || 'vide');
      throw refuse(500, 'Proposition impossible.');
    }
    throw refuse(
      refusal.status,
      refusal.error,
      status,
      typeof result.kind === 'string' && typeof result.id === 'string'
        ? { subject: { kind: result.kind, id: result.id } }
        : undefined
    );
  }

  const tradeId = String(result.tradeId);
  const expiresAt = String(result.expiresAt);
  logger.info(
    '[tcg/trades] proposition %s : %s → %s (%d contre %d)',
    tradeId,
    userId,
    body.recipientId,
    body.offered.length,
    body.requested.length
  );

  await announceTradeProposed(tenantId, {
    tradeId,
    proposerId: userId,
    recipientId: body.recipientId,
    offeredCount: body.offered.length,
    requestedCount: body.requested.length,
    expiresAt,
  });

  return { trade: { id: tradeId, expiresAt } };
}
