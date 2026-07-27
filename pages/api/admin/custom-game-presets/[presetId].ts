// pages/api/admin/custom-game-presets/[presetId].ts
//
// PATCH  — mise à jour partielle d'un preset de partie personnalisée
//          (`{ name?, import_code?, description?, map_pool?, enabled? }`) →
//          200 `{ preset }`. Le PÉRIMÈTRE (game / tournament_id / stage_id)
//          n'est pas modifiable : changer de périmètre = supprimer + recréer,
//          sinon on peut faire collisionner l'index unique de scope et rendre
//          la résolution ambiguë.
// DELETE — suppression → 200 `{ ok: true }`. 404 si la ligne appartient à un
//          autre tenant.
//
// Auth : admin+ sur le tenant actif. Scope tenant strict via `ctx.tenantId`.
// Writes : withAdminIdempotency + applyRateLimit. Audit : staff_logs
// action='other', entity_type='custom_game_preset'.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  normalizeImportCode,
  isValidImportCode,
  normalizeMapPool,
  presetScope,
  PRESET_NAME_MAX,
  PRESET_DESCRIPTION_MAX,
  type CustomGamePresetRow,
} from '@/utils/customGamePresets';
import { PRESET_COLUMNS, DEFAULT_PRESET_GAME } from './index';

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(PRESET_NAME_MAX).optional(),
    import_code: z.string().min(1).optional(),
    description: z
      .string()
      .trim()
      .max(PRESET_DESCRIPTION_MAX)
      .nullable()
      .optional(),
    map_pool: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.import_code !== undefined ||
      b.description !== undefined ||
      b.map_pool !== undefined ||
      b.enabled !== undefined,
    { message: 'Nothing to update.' }
  );

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-custom-game-presets'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'PATCH') return handlePatch(req, res, ctx);
  if (req.method === 'DELETE') return handleDelete(req, res, ctx);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

function readPresetId(req: NextApiRequest): string | null {
  const raw = req.query.presetId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !isValidUUID(value)) return null;
  return value;
}

async function loadPreset(
  presetId: string,
  tenantId: string
): Promise<{ row: CustomGamePresetRow | null; failed: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('custom_game_presets')
    .select(PRESET_COLUMNS)
    .eq('id', presetId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) return { row: null, failed: true };
  return { row: (data as CustomGamePresetRow) ?? null, failed: false };
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const presetId = readPresetId(req);
  if (!presetId) {
    return res
      .status(400)
      .json({ error: 'Invalid preset id.', code: 'INVALID_PRESET_ID' });
  }

  const parsed = patchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { row, failed } = await loadPreset(presetId, ctx.tenantId);
  if (failed) {
    logger.error('[admin/custom-game-presets] patch lookup error', null, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Preset not found.', code: 'UNKNOWN_PRESET' });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) {
    update.description = parsed.data.description ?? null;
  }
  if (parsed.data.map_pool !== undefined) {
    update.map_pool = normalizeMapPool(parsed.data.map_pool);
  }
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;

  if (parsed.data.import_code !== undefined) {
    const game = row.game || DEFAULT_PRESET_GAME;
    const code = normalizeImportCode(parsed.data.import_code, game);
    if (!isValidImportCode(code, game)) {
      return res.status(400).json({
        error:
          game === DEFAULT_PRESET_GAME
            ? "Code d'import invalide (4 à 12 caractères alphanumériques)."
            : "Code d'import invalide.",
        code: 'INVALID_IMPORT_CODE',
      });
    }
    update.import_code = code;
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('custom_game_presets')
    .update(update)
    .eq('id', presetId)
    .eq('tenant_id', ctx.tenantId)
    .select(PRESET_COLUMNS)
    .single();

  if (updateErr || !updated) {
    logger.error('[admin/custom-game-presets] patch update error', updateErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to update preset.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'custom_game_preset',
    entity_id: presetId,
    tenant_id: ctx.tenantId,
    tournament_id: row.tournament_id ?? null,
    payload: {
      action: 'update_custom_game_preset',
      // Les NOMS des champs touchés, jamais leurs valeurs : import_code donne
      // accès au lobby et les logs staff sont largement lisibles.
      fields: Object.keys(update).filter((k) => k !== 'updated_at'),
    },
  });

  return res.status(200).json({ preset: updated as CustomGamePresetRow });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const presetId = readPresetId(req);
  if (!presetId) {
    return res
      .status(400)
      .json({ error: 'Invalid preset id.', code: 'INVALID_PRESET_ID' });
  }

  const { row, failed } = await loadPreset(presetId, ctx.tenantId);
  if (failed) {
    logger.error('[admin/custom-game-presets] delete lookup error', null, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Preset not found.', code: 'UNKNOWN_PRESET' });
  }

  const { error: delErr } = await supabaseAdmin
    .from('custom_game_presets')
    .delete()
    .eq('id', presetId)
    .eq('tenant_id', ctx.tenantId);

  if (delErr) {
    logger.error('[admin/custom-game-presets] delete error', delErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to delete preset.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'custom_game_preset',
    entity_id: presetId,
    tenant_id: ctx.tenantId,
    tournament_id: row.tournament_id ?? null,
    payload: {
      action: 'delete_custom_game_preset',
      game: row.game,
      scope: presetScope(row),
      name: row.name,
    },
  });

  return res.status(200).json({ ok: true });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-custom-game-presets-item' }),
  'admin'
);
