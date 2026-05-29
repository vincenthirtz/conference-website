// pages/api/bot/v1/runs/current.ts
//
// Feature: Run-of-show — Lot 2.
// GET : pour le bot, retourne le current event_run du tenant (header
// x-tenant-id ou per-tenant API key) + sa timeline projetee safe.
//
// Usage : slash command `/run` ou `/event` cote bot, ou affichage d'un panel
// "What's live right now" dans un channel d'annonce.
//
// Auth : withBotRoute (x-api-key + x-tenant-id ou per-tenant key). Pas
// d'idempotency (GET).
//
// Cette route est optionnelle — la consommation principale du bot reste
// l'outbox `event_segment.transitioned`. Mais elle permet au bot d'afficher
// l'etat courant sans avoir a recoller les fragments via les events.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext?.tenantId;
  if (!tenantId) {
    // Defense en profondeur — withBotRoute aurait du resoudre le tenantId
    // sauf en mode crossTenant (qu'on n'active pas ici).
    return res
      .status(400)
      .json({ error: 'Missing tenant context.', code: 'MISSING_TENANT' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }
  const admin = supabaseAdmin;

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
    logger.error('[bot/runs/current] run error', runErr);
    return res.status(500).json({ error: 'Failed to load current run.' });
  }
  if (!run) {
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
    logger.error('[bot/runs/current] segments error', segErr);
    return res.status(500).json({ error: 'Failed to load segments.' });
  }

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

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-runs-current' },
});
