// pages/api/admin/tournament/[id]/clone.ts
// Duplique un tournoi : copie la structure (stages, map pool, settings)
// sans les equipes ni les resultats.
// POST : { name?: string, slug?: string }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import slugify from 'slugify';

import { logger } from '../../../../../utils/logger';
type ApiResponse =
  | { tournament: any; stages: any[]; maps: number }
  | { error: string };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tournament-clone' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const sourceId = String(id);

  try {
    // 1) Fetch source tournament
    const { data: source, error: srcErr } = await supabaseAdmin
      .from('tournaments')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle();

    if (srcErr || !source) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // 2) Determine name & slug for the clone
    const body = req.body || {};
    const cloneName =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : `${source.name} (copie)`;

    let cloneSlug =
      typeof body.slug === 'string' && body.slug.trim()
        ? body.slug.trim()
        : slugify(cloneName, { lower: true, strict: true });

    // Ensure slug uniqueness
    const { data: existingSlug } = await supabaseAdmin
      .from('tournaments')
      .select('id')
      .eq('slug', cloneSlug)
      .maybeSingle();

    if (existingSlug) {
      cloneSlug = `${cloneSlug}-${Date.now().toString(36)}`;
    }

    // 3) Create the cloned tournament (reset status to draft, clear dates)
    const { data: cloned, error: createErr } = await supabaseAdmin
      .from('tournaments')
      .insert({
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
      logger.error('clone: create tournament error', createErr);
      return res
        .status(500)
        .json({ error: 'Failed to create cloned tournament' });
    }

    // 4) Copy stages (structure only, no teams/matches)
    const { data: sourceStages } = await supabaseAdmin
      .from('tournament_stages')
      .select('name, slug, stage_type, order_index, settings')
      .eq('tournament_id', sourceId)
      .order('order_index', { ascending: true });

    let createdStages: any[] = [];
    if (sourceStages && sourceStages.length > 0) {
      const stageInserts = sourceStages.map((s: any) => ({
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
        .insert(stageInserts)
        .select('*');

      if (stagesErr) {
        logger.error('clone: copy stages error', stagesErr);
      } else {
        createdStages = stages || [];
      }
    }

    // 5) Copy map pool
    const { data: sourceMaps } = await supabaseAdmin
      .from('tournament_maps')
      .select('map_name, map_slug, map_type, image_url, enabled, order_index')
      .eq('tournament_id', sourceId)
      .order('order_index', { ascending: true });

    let copiedMapsCount = 0;
    if (sourceMaps && sourceMaps.length > 0) {
      const mapInserts = sourceMaps.map((m: any) => ({
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
        .insert(mapInserts);

      if (mapsErr) {
        logger.error('clone: copy maps error', mapsErr);
      } else {
        copiedMapsCount = mapInserts.length;
      }
    }

    // 6) Log staff action
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_tournament',
          entity_type: 'tournament',
          entity_id: cloned.id,
          tournament_id: cloned.id,
          payload: {
            cloned_from: sourceId,
            cloned_from_name: source.name,
            stages_count: createdStages.length,
            maps_count: copiedMapsCount,
          },
        });
      } catch (e) {
        logger.error('clone: logStaffAction error', e);
      }
    }

    return res.status(201).json({
      tournament: cloned,
      stages: createdStages,
      maps: copiedMapsCount,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/clone] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
