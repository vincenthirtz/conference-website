// pages/api/admin/map-pool/import-defaults.ts
//
// POST — seed le pool tenant d'un jeu depuis le catalogue statique
//        `getGame(game).mapPool` (config/games). Les maps déjà présentes
//        (par lower(map_name)) sont ignorées → l'opération est idempotente.
//        Réponse `{ imported, skipped, maps }`.
//
// Auth : manager+ sur le tenant actif. Scope tenant strict via `ctx.tenantId`.
// Writes : withAdminIdempotency + applyRateLimit. Audit : staff_logs
// action='other', entity_type='map_pool'.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { getGame, isGameSlug } from '@/config/games';
import { sortMapPool, type MapPoolRow } from './index';

const MAP_POOL_COLUMNS =
  'id, tenant_id, game, map_name, map_type, image_url, enabled, order_index, created_at, updated_at';

const bodySchema = z.object({ game: z.string() });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-map-pool')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid body.', code: 'INVALID_BODY' });
  }

  const { game } = parsed.data;
  if (!isGameSlug(game)) {
    return res
      .status(400)
      .json({ error: 'Invalid game slug.', code: 'INVALID_GAME' });
  }

  const gameDef = getGame(game);
  const defaults = gameDef?.mapPool ?? [];

  // État courant du pool tenant (pour dédup + prochain order_index).
  const { data: existing, error: existErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .select('map_name, order_index')
    .eq('tenant_id', ctx.tenantId)
    .eq('game', game);

  if (existErr) {
    logger.error('[admin/map-pool] import-defaults lookup error', existErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
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

  const now = new Date().toISOString();
  const toInsert = defaults
    .filter((m) => !present.has(m.name.toLowerCase()))
    .map((m) => ({
      tenant_id: ctx.tenantId,
      game,
      map_name: m.name,
      map_type: m.type ?? null,
      image_url: m.image ?? null,
      enabled: true,
      order_index: nextIndex++,
      updated_at: now,
    }));

  const skipped = defaults.length - toInsert.length;

  if (toInsert.length === 0) {
    // Rien à insérer : renvoyer l'état courant complet du jeu.
    const { data: current } = await supabaseAdmin
      .from('tenant_map_pool')
      .select(MAP_POOL_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .eq('game', game);
    return res.status(200).json({
      imported: 0,
      skipped,
      maps: sortMapPool((current ?? []) as MapPoolRow[]),
    });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .insert(toInsert)
    .select(MAP_POOL_COLUMNS);

  if (insErr) {
    logger.error('[admin/map-pool] import-defaults insert error', insErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to import default maps.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'map_pool',
    entity_id: null,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'import_default_maps',
      game,
      imported: (inserted ?? []).length,
      skipped,
    },
  });

  // Renvoyer l'état complet du jeu après import (existant + nouveau).
  const { data: full } = await supabaseAdmin
    .from('tenant_map_pool')
    .select(MAP_POOL_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('game', game);

  return res.status(200).json({
    imported: (inserted ?? []).length,
    skipped,
    maps: sortMapPool((full ?? []) as MapPoolRow[]),
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-map-pool-import' }),
  { permission: 'manage_tournaments' }
);
