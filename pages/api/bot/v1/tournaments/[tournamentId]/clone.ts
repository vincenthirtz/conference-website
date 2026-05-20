// POST /api/bot/v1/tournaments/[tournamentId]/clone
//
// Commande /cloner-tournoi (admin) : duplique un tournoi (structure
// uniquement — stages + tournament_maps, pas les equipes ni les matches).
// Mirror exact du admin route admin/tournament/[id]/clone.
//
// Body :
//   actorDiscordUserId (staff admin/owner)
//   name?              defaut: "<source.name> (copie)"
//   slug?              defaut: slugified(name) + suffix si conflit

import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.tournamentId;
  const sourceId = Array.isArray(raw) ? raw[0] : raw;
  if (!sourceId || !isValidUUID(sourceId)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const { data: source, error: srcErr } = await supabaseAdmin
    .from('tournaments')
    .select('*')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', sourceId)
    .maybeSingle();
  if (srcErr) {
    logger.error('[bot/clone] source fetch error', srcErr);
    return res.status(500).json({ error: 'Erreur de chargement du tournoi' });
  }
  if (!source) {
    return res.status(404).json({ error: 'Tournoi source introuvable' });
  }

  const cloneName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `${source.name} (copie)`;

  let cloneSlug =
    typeof body.slug === 'string' && body.slug.trim()
      ? slugify(body.slug.trim(), { lower: true, strict: true })
      : slugify(cloneName, { lower: true, strict: true });

  const { data: clash } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('slug', cloneSlug)
    .maybeSingle();
  if (clash) {
    cloneSlug = `${cloneSlug}-${Date.now().toString(36)}`;
  }

  const { data: cloned, error: createErr } = await supabaseAdmin
    .from('tournaments')
    .insert({
      tenant_id: req.botContext!.tenantId,
      name: cloneName,
      slug: cloneSlug,
      game: source.game,
      status: 'draft',
      start_date: null,
      end_date: null,
      timezone: source.timezone,
      format_type: source.format_type,
      max_teams: source.max_teams,
      min_players: source.min_players,
      max_players: source.max_players,
      visibility: source.visibility,
      is_featured: false,
      logo_url: source.logo_url,
      banner_url: source.banner_url,
    })
    .select('*')
    .single();
  if (createErr || !cloned) {
    logger.error('[bot/clone] create tournament error', createErr);
    return res.status(500).json({ error: 'Échec de la création du clone' });
  }

  // Stages
  const { data: sourceStages } = await supabaseAdmin
    .from('tournament_stages')
    .select('name, slug, stage_type, order_index, settings')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('tournament_id', sourceId)
    .order('order_index', { ascending: true });

  let createdStages: unknown[] = [];
  if (sourceStages && sourceStages.length > 0) {
    const inserts = sourceStages.map((s) => ({
      tenant_id: req.botContext!.tenantId,
      tournament_id: cloned.id,
      name: (s as any).name,
      slug: (s as any).slug,
      stage_type: (s as any).stage_type,
      order_index: (s as any).order_index,
      is_active: false,
      is_public: false,
      start_date: null,
      end_date: null,
      settings: (s as any).settings,
    }));
    const { data: stages, error: stagesErr } = await supabaseAdmin
      .from('tournament_stages')
      .insert(inserts)
      .select('*');
    if (stagesErr) {
      logger.error('[bot/clone] copy stages error', stagesErr);
    } else {
      createdStages = stages ?? [];
    }
  }

  // Map pool
  const { data: sourceMaps } = await supabaseAdmin
    .from('tournament_maps')
    .select('map_name, map_slug, map_type, image_url, enabled, order_index')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('tournament_id', sourceId)
    .order('order_index', { ascending: true });

  let mapsCount = 0;
  if (sourceMaps && sourceMaps.length > 0) {
    const inserts = sourceMaps.map((m) => ({
      tenant_id: req.botContext!.tenantId,
      tournament_id: cloned.id,
      map_name: (m as any).map_name,
      map_slug: (m as any).map_slug,
      map_type: (m as any).map_type,
      image_url: (m as any).image_url,
      enabled: (m as any).enabled,
      order_index: (m as any).order_index,
    }));
    const { error: mapsErr } = await supabaseAdmin
      .from('tournament_maps')
      .insert(inserts);
    if (mapsErr) {
      logger.error('[bot/clone] copy maps error', mapsErr);
    } else {
      mapsCount = inserts.length;
    }
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'create_tournament',
    entity_type: 'tournament',
    entity_id: cloned.id,
    tournament_id: cloned.id,
    payload: {
      cloned_from: sourceId,
      cloned_from_name: source.name,
      stages_count: createdStages.length,
      maps_count: mapsCount,
    },
  });

  return res.status(201).json({
    tournament: cloned,
    stages: createdStages,
    maps: mapsCount,
    clonedFrom: sourceId,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 10, key: 'bot-tournament-clone' },
  idempotent: true,
});
