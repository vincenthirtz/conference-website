// pages/api/tournament/[id]/maps.ts
// Gestion des maps d'un tournoi (pool de maps / ordre / activation)

// ⚠️ Route staff : protégée par withStaffRoute (min: manager)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { getGame, isGameSlug } from '@/config/games';

import { logger } from '../../../../utils/logger';
export type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null; // ex: "control", "hybrid", ...
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
  created_at: string;
};

export type TournamentMapInput = {
  id?: string;
  map_name: string;
  map_slug?: string | null;
  map_type?: string | null;
  image_url?: string | null;
  enabled?: boolean;
  order_index?: number | null;
};

// Rôle minimum : manager (peut gérer les settings du tournoi)
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, res, ctx);
      case 'POST':
        return await handlePost(id, req, res, ctx);
      case 'PUT':
        return await handlePut(id, req, res, ctx);
      case 'PATCH':
        return await handlePatch(id, req, res, ctx);
      case 'DELETE':
        return await handleDelete(id, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/tournament/[id]/maps] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des maps du tournoi
 * ---------------------------------------------------------*/

async function handleGet(
  tournamentId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin
    .from('tournament_maps')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .order('order_index', { ascending: true })
    .order('map_name', { ascending: true });

  if (error) {
    logger.error('GET tournament_maps error:', error);
    return res.status(500).json({
      error: 'Failed to fetch tournament maps',
    });
  }

  // Récupérer aussi les infos tournoi (game pour adapter l'UI multi-jeu)
  const { data: tournamentRow, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, slug, game')
    .eq('id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (tErr) {
    logger.error('GET tournament for maps error:', tErr);
  }

  return res.status(200).json({
    maps: (data || []) as TournamentMapRow[],
    tournament: tournamentRow ?? null,
  });
}

/* -----------------------------------------------------------
 * POST : créer / ajouter une map pour le tournoi
 * body: TournamentMapInput (sans tournament_id)
 * ---------------------------------------------------------*/

async function handlePost(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const body = req.body as TournamentMapInput & { defaults?: boolean };

  // Action « ajouter toutes les maps par défaut » : source d'abord le pool
  // tenant éditable (tenant_map_pool), fallback sur le catalogue statique
  // config/games si le pool tenant est vide.
  if (body && body.defaults === true) {
    return await handleAddDefaults(tournamentId, res, ctx);
  }

  if (!body || !body.map_name) {
    return res.status(400).json({
      error: 'map_name is required',
    });
  }

  // on calcule un order_index par défaut à la suite de ce qui existe
  let nextIndex: number | null = null;
  const { data: existing, error: countErr } = await supabaseAdmin
    .from('tournament_maps')
    .select('order_index')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId);

  if (!countErr && existing) {
    const max = (existing as any[])
      .map((m) => m.order_index ?? 0)
      .reduce((acc, v) => Math.max(acc, v), -1);
    nextIndex = max + 1;
  }

  const payload = {
    tournament_id: tournamentId,
    map_name: body.map_name,
    map_slug: body.map_slug ?? null,
    map_type: body.map_type ?? null,
    image_url: body.image_url ?? null,
    enabled: body.enabled ?? true,
    order_index:
      typeof body.order_index === 'number' ? body.order_index : nextIndex,
    tenant_id: ctx.tenantId,
  };

  const { data, error } = await supabaseAdmin
    .from('tournament_maps')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('POST tournament_maps error:', error);
    return res.status(500).json({
      error: 'Failed to create tournament map',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament_map',
      entity_id: (data as any).id,
      tournament_id: tournamentId,
      tenant_id: ctx.tenantId,
      payload: {
        created: true,
        map_name: body.map_name,
      },
    });
  }

  return res.status(201).json({ map: data as TournamentMapRow });
}

/* -----------------------------------------------------------
 * POST { defaults: true } : ajouter toutes les maps par défaut
 *
 * Source : le pool tenant éditable `tenant_map_pool`
 * (tenant du tournoi, game du tournoi, enabled = true). Si ce pool est
 * VIDE, on retombe sur le catalogue statique `getGame(game).mapPool`
 * (comportement historique inchangé). Les maps déjà présentes sur le
 * tournoi (par lower(map_name)) sont ignorées → idempotent.
 * ---------------------------------------------------------*/

type DefaultPoolMap = {
  name: string;
  type: string | null;
  image: string | null;
};

async function handleAddDefaults(
  tournamentId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // Résoudre le jeu du tournoi (scopé tenant).
  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, game')
    .eq('id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (tErr) {
    logger.error('add-defaults: tournament lookup error:', tErr);
    return res.status(500).json({ error: 'Failed to load tournament' });
  }
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const game = (tournament as { game?: string | null }).game ?? null;

  // 1) Pool tenant éditable (source prioritaire).
  let poolMaps: DefaultPoolMap[] = [];
  let source: 'tenant' | 'defaults' = 'tenant';

  if (game) {
    const { data: tenantPool, error: poolErr } = await supabaseAdmin
      .from('tenant_map_pool')
      .select('map_name, map_type, image_url, order_index, enabled')
      .eq('tenant_id', ctx.tenantId)
      .eq('game', game)
      .eq('enabled', true);

    if (poolErr) {
      logger.error('add-defaults: tenant_map_pool lookup error:', poolErr);
      return res.status(500).json({ error: 'Failed to load tenant map pool' });
    }

    const rows = (tenantPool ?? []) as Array<{
      map_name: string;
      map_type: string | null;
      image_url: string | null;
      order_index: number | null;
    }>;

    if (rows.length > 0) {
      poolMaps = [...rows]
        .sort((a, b) => {
          const ai = a.order_index;
          const bi = b.order_index;
          if (ai == null && bi != null) return 1;
          if (ai != null && bi == null) return -1;
          if (ai != null && bi != null && ai !== bi) return ai - bi;
          return a.map_name.localeCompare(b.map_name);
        })
        .map((r) => ({
          name: r.map_name,
          type: r.map_type ?? null,
          image: r.image_url ?? null,
        }));
    }
  }

  // 2) Fallback catalogue statique config/games (pool tenant vide).
  if (poolMaps.length === 0) {
    source = 'defaults';
    const gameDef = game && isGameSlug(game) ? getGame(game) : null;
    poolMaps = (gameDef?.mapPool ?? []).map((m) => ({
      name: m.name,
      type: m.type ?? null,
      image: m.image ?? null,
    }));
  }

  // Maps déjà présentes sur le tournoi (dédup insensible à la casse).
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('tournament_maps')
    .select('map_name, order_index')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId);

  if (exErr) {
    logger.error('add-defaults: existing maps lookup error:', exErr);
    return res.status(500).json({ error: 'Failed to load tournament maps' });
  }

  const existingRows = (existing ?? []) as Array<{
    map_name: string;
    order_index: number | null;
  }>;
  const present = new Set(
    existingRows.map((r) => (r.map_name ?? '').toLowerCase())
  );
  let nextIndex =
    existingRows.reduce((acc, r) => Math.max(acc, r.order_index ?? -1), -1) + 1;

  const toInsert = poolMaps
    .filter((m) => !present.has(m.name.toLowerCase()))
    .map((m) => ({
      tournament_id: tournamentId,
      map_name: m.name,
      map_slug: null,
      map_type: m.type,
      image_url: m.image,
      enabled: true,
      order_index: nextIndex++,
      tenant_id: ctx.tenantId,
    }));

  let insertedMaps: TournamentMapRow[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('tournament_maps')
      .insert(toInsert)
      .select('*');

    if (error) {
      logger.error('add-defaults: insert error:', error);
      return res.status(500).json({ error: 'Failed to add default maps' });
    }
    insertedMaps = (data ?? []) as TournamentMapRow[];
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament_map',
      entity_id: null,
      tournament_id: tournamentId,
      tenant_id: ctx.tenantId,
      payload: {
        added_defaults: true,
        source,
        imported: insertedMaps.length,
      },
    });
  }

  return res.status(200).json({
    maps: insertedMaps,
    imported: insertedMaps.length,
    source,
  });
}

/* -----------------------------------------------------------
 * PUT/PATCH : remplacer la liste des maps du tournoi
 * body: { maps: TournamentMapInput[] }
 * ---------------------------------------------------------*/

async function handlePut(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { maps } = req.body as {
    maps: TournamentMapInput[];
  };

  if (!Array.isArray(maps)) {
    return res.status(400).json({
      error: "Body must include an array 'maps'",
    });
  }

  // 1) On supprime toutes les maps existantes du tournoi
  const { error: delErr } = await supabaseAdmin
    .from('tournament_maps')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId);

  if (delErr) {
    logger.error('DELETE existing tournament_maps error:', delErr);
    return res.status(500).json({
      error: 'Failed to clear tournament maps',
    });
  }

  // 2) On insère les nouvelles maps
  const payload = maps.map((m, idx) => ({
    tournament_id: tournamentId,
    map_name: m.map_name,
    map_slug: m.map_slug ?? null,
    map_type: m.map_type ?? null,
    image_url: m.image_url ?? null,
    enabled: m.enabled ?? true,
    order_index: typeof m.order_index === 'number' ? m.order_index : idx,
    tenant_id: ctx.tenantId,
  }));

  let insertedMaps: TournamentMapRow[] = [];

  if (payload.length > 0) {
    const { data, error: insErr } = await supabaseAdmin
      .from('tournament_maps')
      .insert(payload)
      .select('*');

    if (insErr) {
      logger.error('INSERT tournament_maps error:', insErr);
      return res.status(500).json({
        error: 'Failed to insert tournament maps',
      });
    }

    insertedMaps = (data || []) as TournamentMapRow[];
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament_map',
      entity_id: null,
      tournament_id: tournamentId,
      tenant_id: ctx.tenantId,
      payload: {
        replaced_all_maps: true,
        maps_count: insertedMaps.length,
      },
    });
  }

  return res.status(200).json({
    maps: insertedMaps,
  });
}

/* -----------------------------------------------------------
 * PATCH : mettre à jour une map individuelle
 * query.mapId = id de la map à modifier (requis)
 * body: TournamentMapInput (champs à modifier)
 * ---------------------------------------------------------*/

async function handlePatch(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { mapId } = req.query;

  if (!mapId || Array.isArray(mapId)) {
    return res.status(400).json({
      error: 'mapId is required for PATCH',
    });
  }

  const body = req.body as Partial<TournamentMapInput>;

  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({
      error: 'No fields to update',
    });
  }

  // Construire le payload avec seulement les champs fournis
  const updatePayload: any = {};

  if (body.map_name !== undefined) updatePayload.map_name = body.map_name;
  if (body.map_slug !== undefined)
    updatePayload.map_slug = body.map_slug ?? null;
  if (body.map_type !== undefined)
    updatePayload.map_type = body.map_type ?? null;
  if (body.image_url !== undefined)
    updatePayload.image_url = body.image_url ?? null;
  if (body.enabled !== undefined) updatePayload.enabled = body.enabled;
  if (body.order_index !== undefined)
    updatePayload.order_index = body.order_index ?? null;

  const { data, error } = await supabaseAdmin
    .from('tournament_maps')
    .update(updatePayload)
    .eq('id', mapId)
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('PATCH tournament_map error:', error);
    return res.status(500).json({
      error: 'Failed to update tournament map',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament_map',
      entity_id: mapId,
      tournament_id: tournamentId,
      tenant_id: ctx.tenantId,
      payload: {
        updated: true,
        fields: Object.keys(updatePayload),
      },
    });
  }

  return res.status(200).json({ map: data as TournamentMapRow });
}

/* -----------------------------------------------------------
 * DELETE : supprimer une map (ou toutes)
 * - query.mapId = id spécifique
 * - sinon : supprime toutes les maps du tournoi
 * ---------------------------------------------------------*/

async function handleDelete(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { mapId } = req.query;

  if (mapId && Array.isArray(mapId)) {
    return res.status(400).json({
      error: 'Invalid mapId',
    });
  }

  let query = supabaseAdmin
    .from('tournament_maps')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId);

  if (mapId) {
    query = query.eq('id', mapId);
  }

  const { error } = await query;

  if (error) {
    logger.error('DELETE tournament_map(s) error:', error);
    return res.status(500).json({
      error: 'Failed to delete tournament maps',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament_map',
      entity_id: mapId ? String(mapId) : null,
      tournament_id: tournamentId,
      tenant_id: ctx.tenantId,
      payload: {
        deleted_all: !mapId,
        deleted_one: !!mapId,
      },
    });
  }

  return res.status(200).json({ success: true });
}
