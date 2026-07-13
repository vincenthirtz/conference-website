// pages/api/tournaments/[id]/prize-pool.ts
//
// GET public : données de la jauge de cagnotte (prize pool) d'un tournoi —
// « Profondeur de la monétisation », cash-prize crowdfundé.
//
// Total AFFICHÉ = base_amount_cents + raised_amount_cents. On NE renvoie JAMAIS
// contributor_email (colonne privée), et une contribution anonyme voit son nom
// masqué (name: null). Voir database/migrations/create_prize_pool_tables.sql.
//
// Les tables prize-pool sont RLS service-role-only : on lit via supabaseAdmin
// mais on SCOPE strictement par tenant_id + tournament_id, et on ne projette que
// les colonnes publiques. Réponse cacheable-ish (jauge peu volatile).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';

const RECENT_LIMIT = 10;

type PublicContributor = {
  name: string | null;
  amountCents: number;
  message: string | null;
  createdAt: string | null;
};

type PrizePoolResponse = {
  exists: boolean;
  isOpen: boolean;
  currency: string;
  baseAmountCents: number;
  raisedAmountCents: number;
  totalCents: number;
  goalAmountCents: number | null;
  contributorCount: number;
  recentContributors: PublicContributor[];
};

/** Forme vide normalisée : le widget se rend gracieusement (rien à afficher). */
function emptyShape(): PrizePoolResponse {
  return {
    exists: false,
    isOpen: false,
    currency: 'EUR',
    baseAmountCents: 0,
    raisedAmountCents: 0,
    totalCents: 0,
    goalAmountCents: null,
    contributorCount: 0,
    recentContributors: [],
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PrizePoolResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'prize-pool-public')
  ) {
    return;
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const tournamentId = String(id);
  const tenantId = resolveTenantIdForPublicRequest(req);

  try {
    const { data: pool, error: poolErr } = await supabaseAdmin
      .from('tournament_prize_pools')
      .select(
        'id, is_open, currency, base_amount_cents, raised_amount_cents, goal_amount_cents'
      )
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (poolErr) {
      logger.error('[tournaments/[id]/prize-pool] pool lookup error', poolErr);
      return res.status(500).json({ error: 'Server error' });
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );

    // Pas de cagnotte → forme vide (200) : friendly pour un widget public.
    if (!pool) {
      return res.status(200).json(emptyShape());
    }

    const base =
      typeof pool.base_amount_cents === 'number' ? pool.base_amount_cents : 0;
    const raised =
      typeof pool.raised_amount_cents === 'number'
        ? pool.raised_amount_cents
        : 0;

    // Nombre total de contributeurs (count exact, scope pool + tenant).
    const { count: contributorCount } = await supabaseAdmin
      .from('prize_pool_contributions')
      .select('id', { count: 'exact' })
      .eq('prize_pool_id', pool.id)
      .eq('tenant_id', tenantId);

    // Contributions récentes — colonnes publiques uniquement (jamais d'email).
    const { data: recent } = await supabaseAdmin
      .from('prize_pool_contributions')
      .select(
        'amount_cents, contributor_name, is_anonymous, message, created_at'
      )
      .eq('prize_pool_id', pool.id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT);

    const recentContributors: PublicContributor[] = (recent || []).map((c) => ({
      // Anonymisation à la lecture : le nom réel n'est jamais exposé si anonyme.
      name: c.is_anonymous ? null : ((c.contributor_name as string) ?? null),
      amountCents: (c.amount_cents as number) ?? 0,
      message: (c.message as string) ?? null,
      createdAt: (c.created_at as string) ?? null,
    }));

    return res.status(200).json({
      exists: true,
      isOpen: Boolean(pool.is_open),
      currency: (pool.currency as string) ?? 'EUR',
      baseAmountCents: base,
      raisedAmountCents: raised,
      totalCents: base + raised,
      goalAmountCents:
        typeof pool.goal_amount_cents === 'number'
          ? pool.goal_amount_cents
          : null,
      contributorCount:
        typeof contributorCount === 'number' ? contributorCount : 0,
      recentContributors,
    });
  } catch (err) {
    logger.error('[tournaments/[id]/prize-pool] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
