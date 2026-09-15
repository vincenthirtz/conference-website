// pages/api/player/tcg/trades/index.ts
//
//   GET  → mes propositions d'échange, reçues ou envoyées, paginées.
//   POST → proposer un échange : des cartes à moi contre des cartes qu'elle
//          montre en double.
//
// CARTE CONTRE CARTE, RIEN D'AUTRE. Le corps n'a AUCUN champ pour des pièces,
// un paquet fermé ou un message (`proposeTradeSchema` est strict) : la monnaie
// reste gagnée, jamais transférée, et une proposition n'est pas un canal de
// discussion — donc pas un canal de harcèlement.
//
// LA PROPOSITION S'ÉCRIT EN UNE TRANSACTION (`tcg_propose_trade`). Consentements,
// ancienneté, plafonds, possession et engagement d'un exemplaire sont vérifiés
// sous verrous consultatifs dans la base : deux propositions simultanées ne
// peuvent ni promettre la même carte, ni dépasser un plafond. Les plafonds sont
// PAR COMPTE ; le rate-limit ci-dessous n'est qu'un amortisseur (l'IP qu'il lit
// est fournie par le client).
//
// ANNONCE : `tcg.trade_proposed` à la destinataire, sur le seul statut
// `proposed` rendu par la fonction — jamais sur un refus ni un rejeu.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
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
  TRADE_COLUMNS,
  announceTradeProposed,
  expireOverdueTrades,
  hydrateTrades,
  type TradeRow,
} from '@/utils/tcg/trades';

/** Une boîte d'échanges se lit par vingtaines : au-delà, plus personne ne lit. */
const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

/**
 * Refus de la fonction SQL → statut HTTP + code STABLE. L'interface traduit le
 * code ; le message n'est qu'un repli.
 *
 * `recipient_unavailable` regroupe volontairement « n'accepte pas de
 * propositions », « compte trop récent » et « n'existe pas dans cet espace » :
 * distinguer les trois dirait à qui cherche si une personne est là.
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

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const tenantId = resolveTenantIdForUserRequest(req);

  if (req.method === 'GET') return listTrades(req, res, tenantId, user.id);
  if (req.method === 'POST') return proposeTrade(req, res, tenantId, user.id);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
});

/* -------------------------------------------------------------------------- */
/* GET                                                                         */
/* -------------------------------------------------------------------------- */

async function listTrades(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-tcg-trades')
  ) {
    return;
  }

  const box = req.query.box ?? 'received';
  if (box !== 'received' && box !== 'sent') {
    return res
      .status(400)
      .json({ error: 'Paramètre box invalide.', code: 'invalid_box' });
  }
  const state = req.query.state ?? 'open';
  if (state !== 'open' && state !== 'closed') {
    return res
      .status(400)
      .json({ error: 'Paramètre state invalide.', code: 'invalid_state' });
  }
  const limitParam = parsePageLimit(req.query.limit);
  if (
    limitParam === 'invalid' ||
    (limitParam !== null && limitParam > MAX_PAGE)
  ) {
    return res
      .status(400)
      .json({ error: 'Paramètre limit invalide.', code: 'invalid_limit' });
  }
  const limit = limitParam ?? DEFAULT_PAGE;

  // Même forme de curseur que les paquets — un horodatage et un UUID, validés
  // en forme exacte parce qu'ils finissent interpolés dans un `.or(...)`.
  let cursor: { grantedAt: string; id: string } | null = null;
  if (req.query.cursor !== undefined) {
    cursor = decodePacksCursor(req.query.cursor);
    if (!cursor) {
      return res
        .status(400)
        .json({ error: 'Curseur invalide.', code: 'invalid_cursor' });
    }
  }

  res.setHeader('Cache-Control', 'private, no-store');

  // Expiration PARESSEUSE avant de lire : une proposition échue ne doit jamais
  // s'afficher comme acceptable, même si le cron n'est pas encore passé.
  await expireOverdueTrades({ tenantId, userId });

  let q = supabaseAdmin!
    .from('tcg_trades')
    .select(TRADE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq(box === 'received' ? 'recipient_id' : 'proposer_id', userId);
  q = state === 'open' ? q.eq('status', 'pending') : q.neq('status', 'pending');
  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.grantedAt},and(created_at.eq.${cursor.grantedAt},id.lt.${cursor.id})`
    );
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) {
    logger.error('[tcg/trades] lecture impossible: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const rows = (data ?? []) as TradeRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  const hydrated = await hydrateTrades(tenantId, userId, page);
  if (!hydrated.ok) {
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  return res.status(200).json({
    trades: hydrated.trades,
    nextCursor:
      hasMore && last
        ? encodePacksCursor({ grantedAt: last.created_at, id: last.id })
        : null,
  });
}

/* -------------------------------------------------------------------------- */
/* POST                                                                        */
/* -------------------------------------------------------------------------- */

async function proposeTrade(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'player-tcg-trades-propose'
    )
  ) {
    return;
  }

  const parsed = proposeTradeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Proposition invalide.',
      code: 'invalid_body',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const body = parsed.data;

  // Refusé AVANT la base : aucune raison de prendre un verrou pour ça.
  if (body.recipientId === userId.toLowerCase()) {
    return res
      .status(400)
      .json({ error: 'Pas d’échange avec soi-même.', code: 'self_trade' });
  }

  // Une proposition échue mais pas encore marquée compterait dans les plafonds
  // et bloquerait la paire (index unique « une en attente par paire »).
  await expireOverdueTrades({ tenantId, userId });

  const { data, error } = await supabaseAdmin!.rpc('tcg_propose_trade', {
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
    const code = (error as { code?: string }).code;
    // L'index unique « une en attente par paire » a tranché avant la
    // vérification de la fonction (course entre deux onglets) : c'est le même
    // refus, pas une panne.
    if (code === '23505') {
      return res.status(409).json({
        error: PROPOSE_REFUSALS.already_pending.error,
        code: 'already_pending',
      });
    }
    logger.error(
      '[tcg/trades] proposition impossible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    return res.status(500).json({ error: 'Proposition impossible.' });
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const status = typeof result.status === 'string' ? result.status : '';

  if (status !== 'proposed') {
    const refusal = PROPOSE_REFUSALS[status];
    if (!refusal) {
      logger.error('[tcg/trades] réponse inattendue: %s', status || 'vide');
      return res.status(500).json({ error: 'Proposition impossible.' });
    }
    return res.status(refusal.status).json({
      error: refusal.error,
      code: status,
      // Quelle carte pose problème, quand la base le dit : l'interface la
      // désigne au lieu d'un refus global. Ce sont des sujets que l'appelante
      // a elle-même envoyés.
      ...(typeof result.kind === 'string' && typeof result.id === 'string'
        ? { subject: { kind: result.kind, id: result.id } }
        : {}),
    });
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

  return res.status(201).json({ trade: { id: tradeId, expiresAt } });
}
