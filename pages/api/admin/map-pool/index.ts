// pages/api/admin/map-pool/index.ts
//
// Catalogue de maps **tenant-level** éditable (`tenant_map_pool`). Source du
// flux par-tournoi (voir pages/api/tournament/[id]/maps.ts) qui retombe sur le
// catalogue statique config/games UNIQUEMENT si le pool tenant est vide.
//
// GET  — sans query : toutes les maps du tenant groupées par jeu
//        (`{ pools: Record<GameSlug, MapPoolRow[]> }`). Avec `?game=<slug>` :
//        `{ game, maps: MapPoolRow[] }`.
// POST — créer une map (`{ game, map_name, map_type?, image_url?, enabled?,
//        order_index? }`) → 201 `{ map }`. 409 si doublon (tenant, game,
//        lower(map_name)).
//
// Auth : manager+ sur le tenant actif (aligné sur pages/admin/tournament/[id]/
// maps.tsx). Scope tenant strict via `ctx.tenantId`. Writes : withAdminIdempotency
// + applyRateLimit. Audit : staff_logs action='other', entity_type='map_pool'.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { isGameSlug, GAME_SLUGS, type GameSlug } from '@/config/games';

export type MapPoolRow = {
  id: string;
  tenant_id: string;
  game: string;
  map_name: string;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
  created_at: string;
  updated_at: string;
};

const MAP_POOL_COLUMNS =
  'id, tenant_id, game, map_name, map_type, image_url, enabled, order_index, created_at, updated_at';

const createBodySchema = z.object({
  game: z.string(),
  map_name: z.string().trim().min(1).max(120),
  map_type: z.string().trim().max(60).nullable().optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  order_index: z.number().int().nullable().optional(),
});

/** Tri stable : order_index NULLS LAST, puis map_name (insensible casse). */
export function sortMapPool(rows: MapPoolRow[]): MapPoolRow[] {
  return [...rows].sort((a, b) => {
    const ai = a.order_index;
    const bi = b.order_index;
    if (ai == null && bi != null) return 1;
    if (ai != null && bi == null) return -1;
    if (ai != null && bi != null && ai !== bi) return ai - bi;
    return a.map_name.localeCompare(b.map_name);
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return handleList(req, res, ctx);
  if (req.method === 'POST') {
    if (
      applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-map-pool')
    ) {
      return;
    }
    return handleCreate(req, res, ctx);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const rawGame = req.query.game;
  const gameParam = Array.isArray(rawGame) ? rawGame[0] : rawGame;

  // ?game=<slug> → liste plate d'un jeu.
  if (typeof gameParam === 'string' && gameParam.length > 0) {
    if (!isGameSlug(gameParam)) {
      return res
        .status(400)
        .json({ error: 'Invalid game slug.', code: 'INVALID_GAME' });
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_map_pool')
      .select(MAP_POOL_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .eq('game', gameParam);

    if (error) {
      logger.error('[admin/map-pool] list by game error', error, {
        tenantId: ctx.tenantId,
      });
      return res.status(500).json({ error: 'Server error.' });
    }

    return res.status(200).json({
      game: gameParam,
      maps: sortMapPool((data ?? []) as MapPoolRow[]),
    });
  }

  // Sans query → toutes les maps du tenant, groupées par jeu.
  const { data, error } = await supabaseAdmin
    .from('tenant_map_pool')
    .select(MAP_POOL_COLUMNS)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('[admin/map-pool] list all error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  const pools: Record<string, MapPoolRow[]> = {};
  for (const slug of GAME_SLUGS) pools[slug] = [];
  for (const row of (data ?? []) as MapPoolRow[]) {
    (pools[row.game] ||= []).push(row);
  }
  for (const slug of Object.keys(pools)) {
    pools[slug] = sortMapPool(pools[slug]);
  }

  return res
    .status(200)
    .json({ pools: pools as Record<GameSlug, MapPoolRow[]> });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { game } = parsed.data;
  if (!isGameSlug(game)) {
    return res
      .status(400)
      .json({ error: 'Invalid game slug.', code: 'INVALID_GAME' });
  }

  const mapName = parsed.data.map_name;

  // Dédup insensible à la casse (tenant, game, lower(map_name)). L'index unique
  // DB garantit l'unicité ; on pré-vérifie ici pour renvoyer un 409 propre
  // (le mock de test ne lève pas la contrainte unique).
  const { data: existing, error: existErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .select('id, map_name, order_index')
    .eq('tenant_id', ctx.tenantId)
    .eq('game', game);

  if (existErr) {
    logger.error('[admin/map-pool] dedup lookup error', existErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }

  const rows = (existing ?? []) as Array<{
    map_name: string;
    order_index: number | null;
  }>;
  const wanted = mapName.toLowerCase();
  if (rows.some((r) => (r.map_name ?? '').toLowerCase() === wanted)) {
    return res.status(409).json({
      error: 'A map with this name already exists for this game.',
      code: 'DUPLICATE_MAP',
    });
  }

  // order_index par défaut : à la suite de l'existant.
  let orderIndex: number | null = null;
  if (typeof parsed.data.order_index === 'number') {
    orderIndex = parsed.data.order_index;
  } else if (parsed.data.order_index === null) {
    orderIndex = null;
  } else {
    const maxIndex = rows.reduce(
      (acc, r) => Math.max(acc, r.order_index ?? -1),
      -1
    );
    orderIndex = maxIndex + 1;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('tenant_map_pool')
    .insert({
      tenant_id: ctx.tenantId,
      game,
      map_name: mapName,
      map_type: parsed.data.map_type ?? null,
      image_url: parsed.data.image_url ?? null,
      enabled: parsed.data.enabled ?? true,
      order_index: orderIndex,
      updated_at: now,
    })
    .select(MAP_POOL_COLUMNS)
    .single();

  if (error || !data) {
    logger.error('[admin/map-pool] insert error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to create map.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'map_pool',
    entity_id: (data as MapPoolRow).id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'create_map_pool_entry',
      game,
      map_name: mapName,
    },
  });

  return res.status(201).json({ map: data as MapPoolRow });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-map-pool' }),
  'manager'
);
