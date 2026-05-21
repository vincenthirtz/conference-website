// pages/api/events/[runIdOrSlug]/timeline.ts
//
// Feature: Run-of-show — Lot 2.
// GET public : timeline projection safe d'un event_run actuellement live.
//
// Acceptation : `runIdOrSlug` peut etre soit un UUID (id direct) soit un slug
// resolu via (tenant_id, slug). Pas d'auth — c'est la page fan publique.
//
// Tenant resolution : path-prefix via resolveTenantIdForPublicRequestAsync.
// Fallback DEFAULT_TENANT_ID si pas de prefix (compat pages legacy).
//
// Projection safe : on retourne uniquement les colonnes publiques. Pas de
// broadcast_message, pas de caster_checklist (peut contenir des notes
// internes/audit). Voir create_event_segments_table.sql pour la
// justification.
//
// Filtre : on retourne 404 si le run n'est pas en status='live' (les drafts
// et done restent invisibles cote public).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'public-events'))
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { runIdOrSlug } = req.query;
  if (
    !runIdOrSlug ||
    Array.isArray(runIdOrSlug) ||
    typeof runIdOrSlug !== 'string' ||
    runIdOrSlug.length > 200
  ) {
    return res.status(400).json({ error: 'Invalid runIdOrSlug.' });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);
  // Use admin client si dispo (bypass RLS pour les join cross-tables propre),
  // sinon fallback anon (qui passera la policy event_runs status='live').
  const admin = supabaseAdmin ?? getServerClient(req, res);

  // Resolution UUID vs slug.
  let runQuery = admin
    .from('event_runs')
    .select(
      'id, name, slug, description, scheduled_at, status, started_at, ended_at'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'live');

  if (isValidUUID(runIdOrSlug)) {
    runQuery = runQuery.eq('id', runIdOrSlug);
  } else {
    runQuery = runQuery.eq('slug', runIdOrSlug);
  }

  const { data: run, error: runErr } = await runQuery.maybeSingle();

  if (runErr) {
    logger.error('[public/events/timeline] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res
      .status(404)
      .json({ error: 'Event run not found or not live yet.' });
  }

  const { data: segments, error: segErr } = await admin
    .from('event_segments')
    .select(
      'id, ord, type, match_id, title, duration_min, status, started_at, ended_at'
    )
    .eq('event_run_id', run.id)
    .eq('tenant_id', tenantId)
    .order('ord', { ascending: true });

  if (segErr) {
    logger.error('[public/events/timeline] segments error', segErr);
    return res.status(500).json({ error: 'Failed to load timeline.' });
  }

  // Cache court — la timeline change pendant le live, mais 10s sont
  // acceptables (l'UI fan rafraichit via realtime ou polling).
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=10, stale-while-revalidate=30'
  );

  return res.status(200).json({
    run: {
      id: run.id,
      slug: run.slug,
      name: run.name,
      description: run.description,
      scheduledAt: run.scheduled_at,
      status: run.status,
      startedAt: run.started_at,
      endedAt: run.ended_at,
    },
    segments: (segments ?? []).map((s) => ({
      id: s.id,
      ord: s.ord,
      type: s.type,
      title: s.title,
      durationMin: s.duration_min,
      matchId: s.match_id,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    })),
  });
}
