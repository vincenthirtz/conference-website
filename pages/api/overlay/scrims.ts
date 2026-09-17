// pages/api/overlay/scrims.ts
//
// GET (PUBLIC) — les prochains scrims publics d'un espace, tels que la source
// OBS « scrims à venir » (`/overlay/scrims`) les affiche.
//
// URL :
//   /api/overlay/scrims[?days=14][&limit=6][&tenant=<slug>]
//
// Mêmes règles d'exposition que `GET /api/scrims` (is_public, pas de
// brouillon, pas de supprimé) et mêmes restrictions que les autres sources de
// stream (capacité `matchOverlays`, 402 sinon). Pourquoi une route à part plutôt
// que `/api/scrims` : cf. utils/overlay/scrimsOverlay.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { resolveEmbedTenantId } from '@/utils/embed';
import { readTenantBranding } from '@/utils/tenant';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import {
  parseScrimHorizon,
  parseScrimLimit,
  selectUpcomingScrims,
  type OverlayScrimView,
  type ScrimRowForOverlay,
} from '@/utils/overlay/scrimsOverlay';

export type OverlayScrimsResponse = {
  scrims: OverlayScrimView[];
  /** Nombre total de scrims retenus, avant la coupe à `limit`. */
  total: number;
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
    applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'overlay-scrims')
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

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    const nowMs = Date.now();
    const [{ data, error }, branding] = await Promise.all([
      supabaseAdmin
        .from('scrims')
        .select(
          `id, name, slug, status, scheduled_date,
          team1:teams!scrims_team1_id_fkey(name, short_name, logo_url),
          team2:teams!scrims_team2_id_fkey(name, short_name, logo_url)`
        )
        .eq('tenant_id', tenantId)
        .eq('is_public', true)
        .is('deleted_at', null)
        .in('status', ['scheduled', 'running'])
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(200),
      readTenantBranding(tenantId),
    ]);
    if (error) {
      logger.error('[overlay/scrims] list error', error);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    const all = selectUpcomingScrims(
      (data ?? []) as unknown as ScrimRowForOverlay[],
      nowMs,
      parseScrimHorizon(firstParam(req.query.days as string | undefined))
    );
    const limit = parseScrimLimit(
      firstParam(req.query.limit as string | undefined)
    );

    const payload: OverlayScrimsResponse = {
      scrims: all.slice(0, limit),
      total: all.length,
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
      'public, s-maxage=30, stale-while-revalidate=120'
    );
    return res.status(200).json(payload);
  } catch (err) {
    logger.error('[overlay/scrims] unexpected error', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}
