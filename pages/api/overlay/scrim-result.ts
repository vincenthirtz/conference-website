// pages/api/overlay/scrim-result.ts
//
// GET (PUBLIC) — le résultat d'un scrim, tel que la source OBS « résultat de
// scrim » (`/overlay/scrim-result`) l'affiche.
//
// URL :
//   /api/overlay/scrim-result?scrim=<id|slug>   → ce scrim
//   /api/overlay/scrim-result?scrim=latest      → le scrim du moment (défaut) :
//       en cours, sinon le dernier clos depuis moins de 24 h
//
// Mêmes règles d'exposition que `GET /api/scrims/:id` (is_public, ni brouillon
// ni supprimé) et mêmes restrictions que les autres sources de stream
// (capacité `matchOverlays`, 402 sinon). Pas de match à montrer pour `latest`
// → 200 avec `scrim: null` : la source reste vide, ce n'est pas une erreur.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { resolveEmbedTenantId } from '@/utils/embed';
import { readTenantBranding } from '@/utils/tenant';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import {
  buildScrimResultView,
  pickLatestResultScrim,
  type OverlayScrimResultView,
  type ScrimRowForResult,
} from '@/utils/overlay/scrimResultOverlay';

/** Strictement ce que l'écran affiche : ni lobby, ni litige, ni notes. */
const SCRIM_COLUMNS = `id, name, slug, status, scheduled_date, completed_at,
  team1_id, team2_id, team1_score, team2_score, winner_team_id,
  team1:teams!scrims_team1_id_fkey(name, short_name, logo_url),
  team2:teams!scrims_team2_id_fkey(name, short_name, logo_url)`;

export type OverlayScrimResultResponse = {
  scrim: OverlayScrimResultView | null;
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
      { max: 240, windowMs: 60_000 },
      'overlay-scrim-result'
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

  const ref = (
    firstParam(req.query.scrim as string | string[] | undefined) ?? 'latest'
  ).trim();
  const wantsLatest = !ref || ref.toLowerCase() === 'latest';
  if (!wantsLatest && !/^[a-z0-9-]{1,120}$/i.test(ref)) {
    return res.status(400).json({ error: 'Paramètre `scrim` invalide.' });
  }

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    const base = () =>
      supabaseAdmin!
        .from('scrims')
        .select(SCRIM_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('is_public', true)
        .is('deleted_at', null)
        .neq('status', 'draft');

    const nowMs = Date.now();
    let row: ScrimRowForResult | null = null;

    if (wantsLatest) {
      const { data, error } = await base()
        .in('status', ['running', 'completed'])
        .order('completed_at', { ascending: false, nullsFirst: true })
        .limit(50);
      if (error) {
        logger.error('[overlay/scrim-result] latest error', error);
        return res.status(500).json({ error: 'Lecture impossible.' });
      }
      row = pickLatestResultScrim(
        (data ?? []) as unknown as ScrimRowForResult[],
        nowMs
      );
    } else {
      const query = isValidUUID(ref)
        ? base().eq('id', ref)
        : base().eq('slug', ref);
      const { data, error } = await query.maybeSingle();
      if (error) {
        logger.error('[overlay/scrim-result] scrim error', error);
        return res.status(500).json({ error: 'Lecture impossible.' });
      }
      if (!data) return res.status(404).json({ error: 'Scrim introuvable.' });
      row = data as unknown as ScrimRowForResult;
    }

    const branding = await readTenantBranding(tenantId);
    const payload: OverlayScrimResultResponse = {
      scrim: row ? buildScrimResultView(row) : null,
      branding: branding
        ? {
            name: branding.name ?? null,
            logoUrl: branding.logoUrl ?? null,
            accent: branding.accentColor ?? branding.primaryColor ?? null,
          }
        : null,
      serverTime: new Date(nowMs).toISOString(),
    };

    // Court : le résultat doit apparaître vite quand le score est validé.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=5, stale-while-revalidate=30'
    );
    return res.status(200).json(payload);
  } catch (err) {
    logger.error('[overlay/scrim-result] unexpected error', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}
