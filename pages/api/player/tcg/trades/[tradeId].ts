// pages/api/player/tcg/trades/[tradeId].ts
//
//   POST { action: 'accept' }  → la destinataire accepte (échange atomique)
//   POST { action: 'decline' } → la destinataire refuse
//   POST { action: 'cancel' }  → la proposante retire sa proposition
//
// ACCEPTER = UNE FONCTION SQL (`tcg_accept_trade`), donc une transaction :
// verrous consultatifs sur les deux joueuses, verrous de ligne sur les cartes,
// possession REVÉRIFIÉE au moment même, déplacement des cartes, statut. Deux
// `update` PostgREST successifs ne seraient pas atomiques — une carte pourrait
// partir sans que l'autre arrive.
//
// IDEMPOTENCE. Accepter une proposition déjà acceptée PAR L'APPELANTE rend 200
// `replayed: true` sans rien réécrire ni réannoncer : un double clic ou un
// retry réseau ne doit ni échouer ni notifier deux fois. Même règle pour un
// refus ou une annulation rejoués.
//
// REFUSER ET ANNULER tiennent en une écriture conditionnelle
// (`status = 'pending'`) : la ligne rendue EST la transition, et seule elle
// déclenche une annonce.
//
// 404 PLUTÔT QUE 403 sur une proposition qui ne concerne pas l'appelante — ou
// qui vit dans un autre espace : on ne confirme pas son existence.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import {
  TRADE_MAX_ACCEPTED_PER_DAY,
  TRADE_MIN_ACCOUNT_AGE_DAYS,
  TRADE_MIN_COLLECTION_AGE_DAYS,
  tradeActionSchema,
  tradeIdSchema,
} from '@/utils/tcg/tradeRules';
import {
  TRADE_COLUMNS,
  announceTradeResolved,
  expireOverdueTrades,
  type TradeResolution,
  type TradeRow,
} from '@/utils/tcg/trades';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'player-tcg-trade-action'
    )
  ) {
    return;
  }

  const idParsed = tradeIdSchema.safeParse(req.query.tradeId);
  if (!idParsed.success) {
    return res
      .status(400)
      .json({ error: 'Identifiant invalide.', code: 'invalid_trade_id' });
  }
  const bodyParsed = tradeActionSchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    return res.status(400).json({
      error: 'Action invalide.',
      code: 'invalid_body',
      fields: bodyParsed.error.flatten().fieldErrors,
    });
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  const tradeId = idParsed.data;
  const { action } = bodyParsed.data;

  if (action === 'accept') return accept(res, tenantId, tradeId, user.id);
  return resolveSimple(res, tenantId, tradeId, user.id, action);
});

/* -------------------------------------------------------------------------- */
/* Accepter                                                                    */
/* -------------------------------------------------------------------------- */

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

async function accept(
  res: NextApiResponse,
  tenantId: string,
  tradeId: string,
  userId: string
) {
  const { data, error } = await supabaseAdmin!.rpc('tcg_accept_trade', {
    p_tenant_id: tenantId,
    p_trade_id: tradeId,
    p_user_id: userId,
    p_max_accepted_per_day: TRADE_MAX_ACCEPTED_PER_DAY,
    p_min_account_age_days: TRADE_MIN_ACCOUNT_AGE_DAYS,
    p_min_collection_age_days: TRADE_MIN_COLLECTION_AGE_DAYS,
  });

  if (error) {
    // La transaction a été ANNULÉE en bloc (c'est tout l'intérêt d'une fonction
    // SQL) : rien n'a bougé, la joueuse peut réessayer. Un retry qui tomberait
    // après un commit dont l'accusé s'est perdu rend `already_accepted`, donc
    // un succès — jamais un second échange.
    logger.error(
      '[tcg/trades] acceptation impossible (%s): %s',
      tradeId,
      (error as { message?: string }).message ?? String(error)
    );
    return res.status(500).json({ error: 'Acceptation impossible.' });
  }

  const result = (data ?? {}) as Record<string, unknown>;
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

    const resolutions: TradeResolution[] = [
      { tradeId, proposerId, recipientId, outcome: 'accepted' },
    ];
    // Les propositions devenues caduques PAR CET ÉCHANGE (une carte qu'elles
    // offraient vient de partir) : annulées par le système, donc annoncées.
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
    // La VITRINE de chacune relit la possession à l'affichage, mais la fiche
    // publique est en ISR (300 s) : sans régénération, la carte cédée y
    // resterait visible jusqu'à cinq minutes chez la cédante, et la carte reçue
    // absente chez la receveuse. Les deux cèdent et reçoivent. Best-effort :
    // `revalidatePlayerCard` ne lève jamais, l'échange est déjà écrit.
    await Promise.all([
      announceTradeResolved(tenantId, resolutions),
      revalidatePlayerCard(res, proposerId),
      revalidatePlayerCard(res, recipientId),
    ]);

    return res.status(200).json({
      trade: { id: tradeId, status: 'accepted' },
      replayed: false,
    });
  }

  if (status === 'already_accepted') {
    // Rejeu : succès, SANS annonce.
    return res.status(200).json({
      trade: { id: tradeId, status: 'accepted' },
      replayed: true,
    });
  }

  // Deux refus sont AUSSI des transitions écrites par la fonction : elles
  // s'annoncent à la proposante, puis se rendent en 409.
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
    return res.status(500).json({ error: 'Acceptation impossible.' });
  }
  return res
    .status(refusal.status)
    .json({ error: refusal.error, code: status });
}

/* -------------------------------------------------------------------------- */
/* Refuser / annuler                                                           */
/* -------------------------------------------------------------------------- */

async function resolveSimple(
  res: NextApiResponse,
  tenantId: string,
  tradeId: string,
  userId: string,
  action: 'decline' | 'cancel'
) {
  // Qui a le droit : la destinataire refuse, la proposante annule. Une
  // proposante ne peut pas « refuser » sa propre proposition, ni l'inverse.
  const actorColumn = action === 'decline' ? 'recipient_id' : 'proposer_id';
  const targetStatus = action === 'decline' ? 'declined' : 'cancelled';

  // Une proposition échue ne doit pas pouvoir être « refusée » : elle a expiré,
  // et c'est cette issue-là que la proposante doit apprendre.
  await expireOverdueTrades({ tenantId, userId });

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin!
    .from('tcg_trades')
    .update({
      status: targetStatus,
      resolved_at: nowIso,
      // L'annulation par la proposante est la SEULE annulation non annoncée :
      // son motif le dit, pour que la base et le contrat bot racontent la même
      // chose.
      resolution_reason: action === 'cancel' ? 'proposer_cancelled' : null,
    })
    .eq('id', tradeId)
    .eq('tenant_id', tenantId)
    .eq(actorColumn, userId)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .select(TRADE_COLUMNS);

  if (error) {
    logger.error(
      '[tcg/trades] %s impossible (%s): %s',
      action,
      tradeId,
      error.message
    );
    return res.status(500).json({ error: 'Action impossible.' });
  }

  const changed = (data ?? []) as TradeRow[];
  if (changed.length > 0) {
    const row = changed[0];
    logger.info('[tcg/trades] proposition %s : %s', tradeId, targetStatus);
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
    return res
      .status(200)
      .json({ trade: { id: tradeId, status: targetStatus }, replayed: false });
  }

  // Rien n'a basculé : rejeu, proposition close, ou pas la sienne. On relit
  // pour répondre juste — la contrainte a déjà tranché, relire ne rouvre
  // aucune fenêtre.
  const { data: current, error: readError } = await supabaseAdmin!
    .from('tcg_trades')
    .select(TRADE_COLUMNS)
    .eq('id', tradeId)
    .eq('tenant_id', tenantId)
    .eq(actorColumn, userId)
    .maybeSingle();
  if (readError) {
    logger.error('[tcg/trades] relecture impossible: %s', readError.message);
    return res.status(500).json({ error: 'Action impossible.' });
  }
  const trade = current as TradeRow | null;
  if (!trade) {
    return res
      .status(404)
      .json({ error: 'Proposition introuvable.', code: 'not_found' });
  }
  const isReplay =
    trade.status === targetStatus &&
    (action === 'decline' || trade.resolution_reason === 'proposer_cancelled');
  if (isReplay) {
    return res
      .status(200)
      .json({ trade: { id: tradeId, status: targetStatus }, replayed: true });
  }
  return res.status(409).json({
    error:
      trade.status === 'expired'
        ? 'Cette proposition a expiré.'
        : 'Cette proposition est déjà close.',
    code: trade.status === 'expired' ? 'expired' : 'not_pending',
  });
}
