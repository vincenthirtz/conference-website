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
import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { logger } from '@/utils/logger';
import { cloneBodySchema } from '@/lib/apiContracts/bot/tournaments/[tournamentId]/clone';
import { cloneQuerySchema } from '@/lib/apiContracts/bot/tournaments/[tournamentId]/clone.query';

/**
 * LES DEUX LECTURES SOURCES, déclarées une fois — elles recopient exactement
 * les `.select()` plus bas.
 *
 * Elles étaient lues derrière `as any`, un cast par colonne. Ici l'enjeu est
 * particulier : ces valeurs sont RECOPIÉES dans un INSERT. Une colonne mal
 * nommée n'aurait pas seulement affiché un vide — elle aurait cloné un tournoi
 * avec des étapes ou un pool de maps incomplets, en silence.
 */
type SourceStageRow = {
  name: string;
  slug: string | null;
  stage_type: string;
  order_index: number | null;
  settings: Record<string, unknown> | null;
};

type SourceMapRow = {
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean | null;
  order_index: number | null;
};

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { tournamentId: sourceId } = req.botQuery as z.infer<
    typeof cloneQuerySchema
  >;

  const actor = await requireBotStaff(req, res, req.body ?? {});
  if (!actor) return;

  const input = req.botInput as z.infer<typeof cloneBodySchema>;

  const { data: source, error: srcErr } = await supabaseAdmin
    .from('tournaments')
    .select('*')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', sourceId)
    .maybeSingle();
  if (srcErr) {
    logger.error('[bot/clone] source fetch error', srcErr);
    return res.status(500).json({ error: 'Erreur de chargement du tournoi' });
  }
  if (!source) {
    return res.status(404).json({ error: 'Tournoi source introuvable' });
  }

  const cloneName = input.name ? input.name : `${source.name} (copie)`;

  let cloneSlug = input.slug
    ? slugify(input.slug, { lower: true, strict: true })
    : slugify(cloneName, { lower: true, strict: true });

  const { data: clash } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('slug', cloneSlug)
    .maybeSingle();
  if (clash) {
    cloneSlug = `${cloneSlug}-${Date.now().toString(36)}`;
  }

  const { data: cloned, error: createErr } = await supabaseAdmin
    .from('tournaments')
    .insert({
      tenant_id: req.botContext.tenantId,
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
    .eq('tenant_id', req.botContext.tenantId)
    .eq('tournament_id', sourceId)
    .order('order_index', { ascending: true });

  let createdStages: unknown[] = [];
  if (sourceStages && sourceStages.length > 0) {
    const inserts = (sourceStages as SourceStageRow[]).map((s) => ({
      tenant_id: req.botContext.tenantId,
      tournament_id: cloned.id,
      name: s.name,
      slug: s.slug,
      stage_type: s.stage_type,
      order_index: s.order_index,
      is_active: false,
      is_public: false,
      start_date: null,
      end_date: null,
      settings: s.settings,
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
    .eq('tenant_id', req.botContext.tenantId)
    .eq('tournament_id', sourceId)
    // Seul le pool PAR DEFAUT est cloné, ni journées ni dates (cf. la route
    // admin équivalente).
    .is('round_number', null)
    .is('play_date', null)
    .order('order_index', { ascending: true });

  let mapsCount = 0;
  if (sourceMaps && sourceMaps.length > 0) {
    const inserts = (sourceMaps as SourceMapRow[]).map((m) => ({
      tenant_id: req.botContext.tenantId,
      tournament_id: cloned.id,
      map_name: m.map_name,
      map_slug: m.map_slug,
      map_type: m.map_type,
      image_url: m.image_url,
      enabled: m.enabled,
      order_index: m.order_index,
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
  bodySchema: cloneBodySchema,
  querySchema: cloneQuerySchema,
});
