// pages/api/events/current.ts
//
// Feature: Run-of-show — Lot 4.
// GET public : event_run actuellement 'live' pour le tenant resolu (path
// prefix). Renvoie projection safe identique a /api/events/[runIdOrSlug]/timeline
// (pas de broadcast_message, pas de caster_checklist).
//
// Utilise par /live et autres surfaces publiques pour afficher un encart
// "EN DIRECT MAINTENANT" sans connaitre l ID du run a l avance.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 120, windowMs: 60_000 },
      'public-events-current'
    )
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);
  const admin = supabaseAdmin ?? getServerClient(req, res);

  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select(
      'id, name, slug, description, scheduled_at, status, started_at, ended_at'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'live')
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (runErr) {
    logger.error('[public/events/current] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load current run.' });
  }

  if (!run) {
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=10, stale-while-revalidate=30'
    );
    return res.status(200).json({ run: null, segments: [] });
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
    logger.error('[public/events/current] segments error', segErr);
    return res.status(500).json({ error: 'Failed to load timeline.' });
  }

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
