// pages/api/player/tcg/trades/settings.ts
//
//   GET → ma préférence « recevoir des propositions », mon éligibilité, les
//         plafonds en vigueur et mes compteurs.
//   PUT → activer ou désactiver les échanges.
//
// DÉSACTIVÉ PAR DÉFAUT (opt-in), et c'est le choix le plus protecteur : dans un
// milieu où les joueuses subissent du harcèlement, être sollicitable est une
// décision, pas un état initial. Même règle que la photo de carte (accord
// explicite) et que la découverte joueuse (invisible par défaut). Activer vaut
// aussi apparaître dans la liste des partenaires de l'espace et montrer ses
// DOUBLES échangeables aux autres collectionneuses volontaires — la page le
// dit AVANT l'interrupteur.
//
// ACTIVER EXIGE L'ANCIENNETÉ (compte ET collection, calculée par la base) :
// garde multi-comptes. Toute personne listée comme partenaire est donc déjà
// éligible.
//
// DÉSACTIVER NE LAISSE RIEN EN ATTENTE. Les propositions REÇUES en attente
// sont annulées par le système (`trading_disabled`) et annoncées à leurs
// proposantes ; les propositions ENVOYÉES sont retirées comme si elle les
// annulait (`proposer_cancelled`, sans annonce — c'est son geste). Laisser
// des propositions acceptables chez quelqu'un qui ne veut plus échanger serait
// incohérent ; les laisser en attente chez les autres, une promesse qu'elle ne
// tiendra pas.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { TRADE_LIMITS, tradeSettingsSchema } from '@/utils/tcg/tradeRules';
import {
  announceTradeResolved,
  readTradeEligibility,
  readTradeSettings,
} from '@/utils/tcg/trades';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const tenantId = resolveTenantIdForUserRequest(req);

  if (req.method === 'GET') return readSettings(req, res, tenantId, user.id);
  if (req.method === 'PUT') return writeSettings(req, res, tenantId, user.id);

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
});

async function readSettings(
  req: NextApiRequest,
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-tcg-trade-settings'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const nowIso = new Date().toISOString();
  const [settings, eligibility, sentRes, receivedRes] = await Promise.all([
    readTradeSettings(tenantId, userId),
    readTradeEligibility(tenantId, userId),
    supabaseAdmin!
      .from('tcg_trades')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('proposer_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', nowIso),
    supabaseAdmin!
      .from('tcg_trades')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('recipient_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', nowIso),
  ]);

  // Une préférence illisible n'est PAS « désactivé » : on le dit plutôt que de
  // montrer un interrupteur éteint qu'un clic « rallumerait » à tort.
  if (!settings.ok) {
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  return res.status(200).json({
    acceptsProposals: settings.acceptsProposals,
    // `null` = pas mesurable : l'interface masque la date plutôt que d'en
    // inventer une.
    eligible: eligibility.ok ? eligibility.eligible : null,
    eligibleAt: eligibility.ok ? eligibility.eligibleAt : null,
    eligibilityReason: eligibility.ok ? eligibility.reason : null,
    limits: TRADE_LIMITS,
    pending: {
      sent: sentRes.error ? null : (sentRes.count ?? 0),
      received: receivedRes.error ? null : (receivedRes.count ?? 0),
    },
  });
}

async function writeSettings(
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
      'player-tcg-trade-settings-put'
    )
  ) {
    return;
  }

  const parsed = tradeSettingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Préférence invalide.',
      code: 'invalid_body',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { acceptsProposals } = parsed.data;

  if (acceptsProposals) {
    const eligibility = await readTradeEligibility(tenantId, userId);
    if (!eligibility.ok) {
      return res.status(500).json({ error: 'Vérification impossible.' });
    }
    if (!eligibility.eligible) {
      return res.status(409).json({
        error: 'Ton compte ou ta collection est trop récent pour échanger.',
        code: 'collection_too_recent',
        eligibleAt: eligibility.eligibleAt,
        reason: eligibility.reason,
      });
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin!.from('tcg_trade_settings').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      accepts_proposals: acceptsProposals,
      updated_at: nowIso,
    },
    { onConflict: 'tenant_id,user_id' }
  );
  if (error) {
    logger.error('[tcg/trades] préférence non écrite: %s', error.message);
    return res.status(500).json({ error: 'Enregistrement impossible.' });
  }

  let cancelledReceived = 0;
  let cancelledSent = 0;
  if (!acceptsProposals) {
    // Reçues : annulées par le système, ANNONCÉES aux proposantes.
    const received = await supabaseAdmin!
      .from('tcg_trades')
      .update({
        status: 'cancelled',
        resolution_reason: 'trading_disabled',
        resolved_at: nowIso,
      })
      .eq('tenant_id', tenantId)
      .eq('recipient_id', userId)
      .eq('status', 'pending')
      .select('id, proposer_id, recipient_id');
    // Envoyées : retirées par elle, SANS annonce.
    const sent = await supabaseAdmin!
      .from('tcg_trades')
      .update({
        status: 'cancelled',
        resolution_reason: 'proposer_cancelled',
        resolved_at: nowIso,
      })
      .eq('tenant_id', tenantId)
      .eq('proposer_id', userId)
      .eq('status', 'pending')
      .select('id');

    if (received.error || sent.error) {
      // La préférence est écrite : plus aucune proposition ne peut lui
      // arriver (la fonction SQL la relit). Des propositions restées en
      // attente expireront ; on le journalise sans faire échouer le geste.
      logger.error(
        '[tcg/trades] annulation à la désactivation incomplète: %s',
        received.error?.message ?? sent.error?.message
      );
    }
    const receivedRows = (received.data ?? []) as Array<{
      id: string;
      proposer_id: string;
      recipient_id: string;
    }>;
    cancelledReceived = receivedRows.length;
    cancelledSent = ((sent.data ?? []) as unknown[]).length;
    await announceTradeResolved(
      tenantId,
      receivedRows.map((r) => ({
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

  return res.status(200).json({
    acceptsProposals,
    cancelled: { received: cancelledReceived, sent: cancelledSent },
  });
}
