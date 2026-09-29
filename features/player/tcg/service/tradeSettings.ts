// features/player/tcg/service/tradeSettings.ts — préférence d'échange,
// partenaires, blocages (lot P14, extraits de pages/api/player/tcg/trades/
// {settings,partners,blocks}.ts, même contrat).
//
// DÉSACTIVÉ PAR DÉFAUT (opt-in) : être sollicitable est une décision. ACTIVER
// EXIGE L'ANCIENNETÉ (compte ET collection, calculée par la base). DÉSACTIVER
// NE LAISSE RIEN EN ATTENTE : reçues annulées (`trading_disabled`, annoncées),
// envoyées retirées (`proposer_cancelled`, sans annonce).
//
// PARTENAIRES : CE N'EST PAS UN ANNUAIRE — seulement des volontaires, servis à
// une volontaire (réciprocité), nommés sans e-mail ; un compte sans nom est
// écarté.
//
// BLOCAGES : la personne bloquée n'apprend RIEN (`recipient_unavailable`, le
// refus vit dans `tcg_propose_trade`). Orienté, sans plafond.
//
// ERREUR DE LECTURE ≠ ZÉRO : un compteur illisible vaut `null` (« non
// mesurable »), jamais 0.

import { TRADE_LIMITS, tradeSettingsSchema } from '@/utils/tcg/tradeRules';
import {
  announceTradeResolved,
  readCollectorNames,
  readTradeEligibility,
  readTradeSettings,
} from '@/utils/tcg/trades';
import * as repo from '../repository/trades';
import { TradeBlockBody } from '../schemas';
import { parseOrRefuse, refuse } from './errors';
import type { TcgServiceContext } from './context';

/** Borne de lecture : un espace n'a pas des milliers de volontaires. */
const MAX_PARTNERS = 500;

export async function readTradeSettingsView(ctx: TcgServiceContext) {
  const { db, tenantId, userId } = ctx;
  const nowIso = new Date().toISOString();
  const [settings, eligibility, sentRes, receivedRes] = await Promise.all([
    readTradeSettings(tenantId, userId),
    readTradeEligibility(tenantId, userId),
    repo.countPendingTrades(db, {
      tenantId,
      userId,
      side: 'proposer_id',
      nowIso,
    }),
    repo.countPendingTrades(db, {
      tenantId,
      userId,
      side: 'recipient_id',
      nowIso,
    }),
  ]);
  if (!settings.ok) throw refuse(500, 'Lecture impossible.');

  return {
    acceptsProposals: settings.acceptsProposals,
    eligible: eligibility.ok ? eligibility.eligible : null,
    eligibleAt: eligibility.ok ? eligibility.eligibleAt : null,
    eligibilityReason: eligibility.ok ? eligibility.reason : null,
    limits: TRADE_LIMITS,
    pending: {
      sent: sentRes.error ? null : (sentRes.count ?? 0),
      received: receivedRes.error ? null : (receivedRes.count ?? 0),
    },
  };
}

export async function writeTradeSettings(
  ctx: TcgServiceContext,
  rawBody: unknown
) {
  const { db, tenantId, userId, logger } = ctx;
  const parsed = tradeSettingsSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw refuse(400, 'Préférence invalide.', 'invalid_body', {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { acceptsProposals } = parsed.data;

  if (acceptsProposals) {
    const eligibility = await readTradeEligibility(tenantId, userId);
    if (!eligibility.ok) throw refuse(500, 'Vérification impossible.');
    if (!eligibility.eligible) {
      throw refuse(
        409,
        'Ton compte ou ta collection est trop récent pour échanger.',
        'collection_too_recent',
        { eligibleAt: eligibility.eligibleAt, reason: eligibility.reason }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await repo.upsertTradeSettings(db, {
    tenantId,
    userId,
    acceptsProposals,
    nowIso,
  });
  if (error) {
    logger.error('[tcg/trades] préférence non écrite: %s', error.message);
    throw refuse(500, 'Enregistrement impossible.');
  }

  let cancelledReceived = 0;
  let cancelledSent = 0;
  if (!acceptsProposals) {
    const received = await repo.cancelReceivedPending(db, {
      tenantId,
      userId,
      nowIso,
    });
    const sent = await repo.cancelSentPending(db, { tenantId, userId, nowIso });
    if (received.error || sent.error) {
      logger.error(
        '[tcg/trades] annulation à la désactivation incomplète: %s',
        received.error?.message ?? sent.error?.message
      );
    }
    cancelledReceived = received.rows.length;
    cancelledSent = sent.rows.length;
    await announceTradeResolved(
      tenantId,
      received.rows.map((r) => ({
        tradeId: r.id,
        proposerId: r.proposer_id,
        recipientId: r.recipient_id,
        outcome: 'cancelled' as const,
      }))
    );
  }

  logger.info(
    '[tcg/trades] échanges %s pour %s',
    acceptsProposals ? 'activés' : 'désactivés',
    userId
  );
  return {
    acceptsProposals,
    cancelled: { received: cancelledReceived, sent: cancelledSent },
  };
}

export async function readTradePartners(ctx: TcgServiceContext) {
  const { db, tenantId, userId, logger } = ctx;
  const mine = await readTradeSettings(tenantId, userId);
  if (!mine.ok) throw refuse(500, 'Lecture impossible.');
  if (!mine.acceptsProposals) {
    throw refuse(
      403,
      'Active les échanges pour voir les partenaires.',
      'trading_disabled'
    );
  }

  const { ids, error } = await repo.readTradeVolunteers(db, {
    tenantId,
    userId,
    limit: MAX_PARTNERS,
  });
  if (error) {
    logger.error('[tcg/trades] partenaires illisibles: %s', error.message);
    throw refuse(500, 'Lecture impossible.');
  }
  const names = await readCollectorNames(tenantId, ids);

  const partners = ids
    .map((id) => ({ userId: id, displayName: names.get(id) ?? null }))
    .filter(
      (p): p is { userId: string; displayName: string } =>
        typeof p.displayName === 'string' && p.displayName.length > 0
    )
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' })
    );
  return { partners };
}

export async function listTradeBlocks(ctx: TcgServiceContext) {
  const { rows, error } = await repo.readTradeBlocks(ctx.db, ctx);
  if (error) {
    ctx.logger.error('[tcg/blocks] lecture impossible: %s', error.message);
    throw refuse(500, 'Lecture impossible.');
  }
  return {
    blocked: rows.map((row) => ({
      userId: row.blocked_user_id,
      since: row.created_at,
    })),
  };
}

export async function blockTrader(ctx: TcgServiceContext, rawBody: unknown) {
  const target = parseOrRefuse(TradeBlockBody, rawBody, {
    message: 'Joueuse invalide.',
    code: 'invalid_body',
  }).userId;
  if (target === ctx.userId.toLowerCase()) {
    throw refuse(400, 'Pas de blocage de soi-même.', 'self_block');
  }
  const { error } = await repo.upsertTradeBlock(ctx.db, { ...ctx, target });
  if (error) {
    ctx.logger.error('[tcg/blocks] blocage impossible: %s', error.message);
    throw refuse(500, 'Blocage impossible.');
  }
  return { blocked: target };
}

export async function unblockTrader(ctx: TcgServiceContext, rawBody: unknown) {
  const target = parseOrRefuse(TradeBlockBody, rawBody, {
    message: 'Joueuse invalide.',
    code: 'invalid_body',
  }).userId;
  const { error } = await repo.deleteTradeBlock(ctx.db, { ...ctx, target });
  if (error) {
    ctx.logger.error('[tcg/blocks] déblocage impossible: %s', error.message);
    throw refuse(500, 'Déblocage impossible.');
  }
  return { unblocked: target };
}
