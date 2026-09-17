// pages/api/overlay/donations.ts
//
// GET (PUBLIC) — les derniers dons HelloAsso d'un espace et le total de la
// journée, tels que la source OBS « alerte don » (`/overlay/don-alert`) les
// affiche.
//
// URL :
//   /api/overlay/donations[?from=YYYY-MM-DD][&after=<id|ISO>][&tenant=<slug>]
//
//   from   début de la jauge : minuit à Paris ce jour-là (défaut : aujourd'hui)
//   after  ne rendre que les dons postérieurs à ce don (id) ou à cet instant
//   tenant slug d'espace, pour les sources d'un autre organisateur
//
// NI NOM NI EMAIL : la table n'en contient pas (cf.
// database/migrations/add_helloasso_donations.sql) et la réponse ne rend que
// id / montant / devise / date. Mêmes restrictions que les autres sources de
// stream : capacité `matchOverlays`, 402 sinon. Cache CDN court (5 s) : une
// alerte doit tomber vite, et la clé de cache varie déjà sur la query.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { resolveEmbedTenantId } from '@/utils/embed';
import { readTenantBranding } from '@/utils/tenant';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import { resolveDayBounds } from '@/utils/overlay/dayOverlay';
import {
  DONATION_LIST_LIMIT,
  DONATION_TOTAL_MAX_ROWS,
  donationListSinceMs,
  parseDonationAfter,
  selectRecentDonations,
  sumDonationsSince,
  type DonationRowForOverlay,
  type OverlayDonationView,
} from '@/utils/overlay/donationsOverlay';

export type OverlayDonationsResponse = {
  /** Dons des dernières 24 h (au plus 20), plus récents d'abord. */
  donations: OverlayDonationView[];
  /** Somme des dons depuis minuit (Paris) du jour `from`, en centimes. */
  totalCents: number;
  /** Nombre de dons comptés dans `totalCents`. */
  count: number;
  /** Jour de départ de la jauge, `YYYY-MM-DD`. */
  from: string;
  branding: {
    name: string | null;
    logoUrl: string | null;
    accent: string | null;
  } | null;
  serverTime: string;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 120, windowMs: 60_000 },
      'overlay-donations'
    )
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const nowMs = Date.now();
  const bounds = resolveDayBounds(firstParam(req.query.from), nowMs);
  if (!bounds) {
    return res
      .status(400)
      .json({ error: 'Paramètre from invalide (attendu : AAAA-MM-JJ).' });
  }
  const after = parseDonationAfter(firstParam(req.query.after));
  if (!after) {
    return res.status(400).json({
      error:
        'Paramètre after invalide (attendu : identifiant de don ou date ISO).',
    });
  }

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    // `after` désigné par un id : l'instant de CE don, dans CET espace. Un id
    // inconnu (don hors fenêtre, autre espace) ne filtre rien.
    let afterMs: number | null = after.kind === 'time' ? after.ms : null;
    if (after.kind === 'id') {
      const { data: ref } = await supabaseAdmin
        .from('helloasso_donations')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .eq('id', after.id)
        .maybeSingle();
      const ms = Date.parse(
        (ref as { created_at?: string } | null)?.created_at ?? ''
      );
      afterMs = Number.isFinite(ms) ? ms : null;
    }

    const listSinceIso = new Date(
      donationListSinceMs(nowMs, afterMs)
    ).toISOString();
    const fromIso = new Date(bounds.startMs).toISOString();

    const [recent, totals, branding] = await Promise.all([
      supabaseAdmin
        .from('helloasso_donations')
        .select('id, amount_cents, currency, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', listSinceIso)
        .order('created_at', { ascending: false })
        .limit(DONATION_LIST_LIMIT + 1),
      supabaseAdmin
        .from('helloasso_donations')
        .select('amount_cents, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', fromIso)
        .limit(DONATION_TOTAL_MAX_ROWS),
      readTenantBranding(tenantId),
    ]);
    if (recent.error || totals.error) {
      logger.error(
        '[overlay/donations] read error',
        recent.error ?? totals.error
      );
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    const { totalCents, count } = sumDonationsSince(
      (totals.data ?? []) as DonationRowForOverlay[],
      bounds.startMs
    );

    const payload: OverlayDonationsResponse = {
      donations: selectRecentDonations(
        (recent.data ?? []) as DonationRowForOverlay[],
        nowMs,
        afterMs
      ),
      totalCents,
      count,
      from: bounds.date,
      branding: branding
        ? {
            name: branding.name ?? null,
            logoUrl: branding.logoUrl ?? null,
            accent: branding.accentColor ?? branding.primaryColor ?? null,
          }
        : null,
      serverTime: new Date(nowMs).toISOString(),
    };

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=5, stale-while-revalidate=15'
    );
    return res.status(200).json(payload);
  } catch (err) {
    logger.error('[overlay/donations] unexpected error', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}
