// pages/api/helloasso/prize-checkout.ts
//
// POST : génère un lien de paiement HelloAsso pour CONTRIBUER à la cagnotte
// (prize pool) d'un tournoi — « Profondeur de la monétisation », cash-prize
// crowdfundé.
//
// Public + rate-limité (miroir de pages/api/helloasso/checkout.ts). On attache
// `metadata: { kind:'prize_pool', prize_pool_id, tenant_id }` au checkout-intent
// (canal de corrélation renvoyé dans le webhook) et on stocke une row
// `prize_pool_checkouts` (status pending) capturant le montant + les inputs
// contributeur (nom / email privé / message / anonymat) que le payload de
// paiement HelloAsso ne portera pas. Voir utils/billing/prizePoolFunding.ts et
// database/migrations/create_prize_pool_tables.sql.
//
// UNITÉ MONÉTAIRE : le body porte `amountCents` (CENTIMES). Cohérent avec (1) la
// convention du checkout générique (`amount` en centimes), (2) HelloAsso
// (totalAmount en centimes) et (3) le schéma DB (`amount_cents`). Évite tout
// arrondi flottant euros→centimes.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { createCheckoutIntent } from '@/utils/helloasso';
import { formatZodError } from '@/utils/validation';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { buildPrizeCheckoutMetadata } from '@/utils/billing/prizePoolFunding';
import { logger } from '@/utils/logger';

// Bornes de sécurité : 1 € min, 100 000 € max (miroir du checkout générique).
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 100_000_00;

const bodySchema = z
  .object({
    tournamentId: z.string().uuid().optional(),
    prizePoolId: z.string().uuid().optional(),
    amountCents: z
      .number()
      .int('Le montant doit être un entier de centimes')
      .min(MIN_AMOUNT_CENTS, 'Le montant minimum est 1 €')
      .max(MAX_AMOUNT_CENTS, 'Montant trop élevé'),
    contributorName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email('Email invalide').max(254).optional(),
    message: z.string().trim().max(500).optional(),
    isAnonymous: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.tournamentId || d.prizePoolId), {
    message: 'tournamentId ou prizePoolId requis',
    path: ['tournamentId'],
  });

type PrizePoolRow = {
  id: string;
  tournament_id: string;
  tenant_id: string;
  is_open: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 10 tentatives de checkout par IP par heure (miroir du checkout générique).
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60 * 60 * 1000 },
      'helloasso-prize-checkout'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: formatZodError(parsed.error), code: 'INVALID_BODY' });
  }
  const { tournamentId, prizePoolId, amountCents, contributorName, email } =
    parsed.data;
  const message = parsed.data.message || null;
  const isAnonymous = parsed.data.isAnonymous ?? false;

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  // ── Charger la cagnotte (par id explicite, sinon par tournoi) ──────────────
  let pool: PrizePoolRow | null = null;
  {
    let query = supabaseAdmin
      .from('tournament_prize_pools')
      .select('id, tournament_id, tenant_id, is_open')
      .eq('tenant_id', tenantId);
    query = prizePoolId
      ? query.eq('id', prizePoolId)
      : query.eq('tournament_id', tournamentId as string);
    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.error('[helloasso/prize-checkout] pool lookup error', error);
      return res.status(500).json({ error: 'Server error' });
    }
    pool = (data as PrizePoolRow | null) ?? null;
  }

  if (!pool) {
    return res
      .status(400)
      .json({ error: 'Cagnotte introuvable.', code: 'POOL_NOT_FOUND' });
  }
  if (!pool.is_open) {
    return res.status(400).json({
      error: "Cette cagnotte n'accepte pas de contribution.",
      code: 'POOL_CLOSED',
    });
  }

  // Callback URLs vers la page publique du tournoi.
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const tournamentUrl = `${origin}/tournament/${pool.tournament_id}`;

  let checkout: { id: number; redirectUrl: string };
  try {
    checkout = await createCheckoutIntent({
      totalAmount: amountCents,
      returnUrl: `${tournamentUrl}?prize=success`,
      errorUrl: `${tournamentUrl}?prize=error`,
      itemName: 'Contribution au prize pool',
      metadata: buildPrizeCheckoutMetadata(pool.id, pool.tenant_id),
    });
  } catch (err) {
    logger.error('[helloasso/prize-checkout] checkout create error', err);
    return res.status(502).json({
      error: 'Impossible de créer la session de paiement. Réessayez plus tard.',
    });
  }

  // Row d'intent (status pending) : capture montant + inputs contributeur, keyé
  // par le checkout_intent_id (TEXT). Le webhook la promeut en contribution.
  const { error: ckErr } = await supabaseAdmin
    .from('prize_pool_checkouts')
    .insert({
      checkout_intent_id: String(checkout.id),
      prize_pool_id: pool.id,
      tenant_id: pool.tenant_id,
      amount_cents: amountCents,
      contributor_name: contributorName ?? null,
      contributor_email: email ?? null,
      message,
      is_anonymous: isAnonymous,
      status: 'pending',
    });
  if (ckErr) {
    // Non bloquant : le canal primaire de corrélation reste la metadata
    // HelloAsso. On log (le nom / message / anonymat seront alors indisponibles).
    logger.warn('[helloasso/prize-checkout] checkout row insert failed', ckErr);
  }

  return res.status(200).json({ redirectUrl: checkout.redirectUrl });
}
