// pages/api/admin/map-pool/[mapId].ts
//
// PATCH  — mise à jour partielle d'une entrée du pool tenant
//          (`{ map_name?, map_type?, image_url?, enabled?, order_index? }`) →
//          200 `{ map }`. 404 si la ligne n'appartient pas au tenant actif.
// DELETE — suppression d'une entrée → 200 `{ ok: true }`. 404 si autre tenant.
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
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import type { MapPoolRow } from './index';

const MAP_POOL_COLUMNS =
  'id, tenant_id, game, map_name, map_type, image_url, enabled, order_index, created_at, updated_at';

const patchBodySchema = z
  .object({
    map_name: z.string().trim().min(1).max(120).optional(),
    map_type: z.string().trim().max(60).nullable().optional(),
    image_url: z.string().trim().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    order_index: z.number().int().nullable().optional(),
  })
  .refine(
    (b) =>
      b.map_name !== undefined ||
      b.map_type !== undefined ||
      b.image_url !== undefined ||
      b.enabled !== undefined ||
      b.order_index !== undefined,
    { message: 'Nothing to update.' }
  );

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

  if (req.method === 'PATCH') return handlePatch(req, res, ctx);
  if (req.method === 'DELETE') return handleDelete(req, res, ctx);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

function readMapId(req: NextApiRequest): string | null {
  const raw = req.query.mapId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !isValidUUID(value)) return null;
  return value;
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const mapId = readMapId(req);
  if (!mapId) {
    return res
      .status(400)
      .json({ error: 'Invalid map id.', code: 'INVALID_MAP_ID' });
  }

  const parsed = patchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Scope tenant strict : la ligne doit appartenir au tenant actif.
  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .select('id')
    .eq('id', mapId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[admin/map-pool] patch lookup error', lookupErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Map not found.', code: 'UNKNOWN_MAP' });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.map_name !== undefined)
    update.map_name = parsed.data.map_name;
  if (parsed.data.map_type !== undefined)
    update.map_type = parsed.data.map_type ?? null;
  if (parsed.data.image_url !== undefined)
    update.image_url = parsed.data.image_url ?? null;
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;
  if (parsed.data.order_index !== undefined)
    update.order_index = parsed.data.order_index ?? null;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .update(update)
    .eq('id', mapId)
    .eq('tenant_id', ctx.tenantId)
    .select(MAP_POOL_COLUMNS)
    .single();

  if (updateErr || !updated) {
    logger.error('[admin/map-pool] patch update error', updateErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to update map.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'map_pool',
    entity_id: mapId,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'update_map_pool_entry',
      fields: Object.keys(update).filter((k) => k !== 'updated_at'),
    },
  });

  return res.status(200).json({ map: updated as MapPoolRow });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const mapId = readMapId(req);
  if (!mapId) {
    return res
      .status(400)
      .json({ error: 'Invalid map id.', code: 'INVALID_MAP_ID' });
  }

  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .select('id, game, map_name')
    .eq('id', mapId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[admin/map-pool] delete lookup error', lookupErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Map not found.', code: 'UNKNOWN_MAP' });
  }

  const { error: delErr } = await supabaseAdmin
    .from('tenant_map_pool')
    .delete()
    .eq('id', mapId)
    .eq('tenant_id', ctx.tenantId);

  if (delErr) {
    logger.error('[admin/map-pool] delete error', delErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to delete map.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'map_pool',
    entity_id: mapId,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'delete_map_pool_entry',
      game: (row as { game?: string }).game ?? null,
      map_name: (row as { map_name?: string }).map_name ?? null,
    },
  });

  return res.status(200).json({ ok: true });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-map-pool-item' }),
  { permission: 'manage_tournaments' }
);
