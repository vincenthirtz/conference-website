// pages/api/admin/moderation/blacklist/[id].ts
//
// Feature Blacklist joueurs — Lot 2 (endpoints admin staff).
// Ref: docs/BLACKLIST_DESIGN.md.
//
// PATCH  → met à jour reason / notes / active (toggle du ban inclus).
//          Audit logStaffAction('blacklist_update').
// DELETE → supprime définitivement l'entrée.
//          Audit logStaffAction('blacklist_remove').
//
// Toutes les requêtes sont scopées par tenant_id : un staff ne touche QUE les
// entrées de son tenant courant. Service-role only (RLS default-deny).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

const SELECT_COLS =
  'id, tenant_id, battle_tag, display_name, discord_user_id, reason, notes, banned_by, active, created_at, updated_at';

// Au moins un champ doit être fourni pour un PATCH utile.
const updateSchema = z
  .object({
    reason: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.reason !== undefined || v.notes !== undefined || v.active !== undefined,
    { message: 'Aucun champ à mettre à jour.' }
  );

/** Normalise une valeur texte optionnelle en `string | null` (vide → null). */
function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-blacklist-id'
    )
  )
    return;

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ID.' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  if (req.method === 'PATCH') {
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: formatZodError(parsed.error),
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const body = parsed.data;

    const updatePayload: Record<string, unknown> = {};
    if (body.reason !== undefined)
      updatePayload.reason = nullableText(body.reason);
    if (body.notes !== undefined)
      updatePayload.notes = nullableText(body.notes);
    if (body.active !== undefined) updatePayload.active = body.active;

    const { data, error } = await admin
      .from('player_blacklist')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select(SELECT_COLS)
      .maybeSingle();

    if (error) {
      logger.error('[admin/blacklist/id] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the blacklist entry.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Blacklist entry not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'blacklist_update',
        entity_type: 'blacklist',
        entity_id: data.id,
        tenant_id: ctx.tenantId,
        payload: updatePayload,
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { data, error } = await admin
      .from('player_blacklist')
      .delete()
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('[admin/blacklist/id] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the blacklist entry.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Blacklist entry not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'blacklist_remove',
        entity_type: 'blacklist',
        entity_id: id,
        tenant_id: ctx.tenantId,
        payload: null,
      });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'moderate_support' });
