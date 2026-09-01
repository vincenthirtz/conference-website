// pages/api/admin/moderation/entity-blacklist/[id].ts
//
// Feature Blacklist entités (équipes / structures-assos) — endpoints admin
// staff, miroir des endpoints joueurs (moderation/blacklist/[id]).
// Ref: docs/BLACKLIST_DESIGN.md (section « Extension : blacklist entités »).
//
// PATCH  → met à jour name / entity_type / reason / notes / active (toggle du
//          ban inclus). Audit logStaffAction('entity_blacklist_update').
// DELETE → supprime définitivement l'entrée.
//          Audit logStaffAction('entity_blacklist_remove').
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
  'id, tenant_id, entity_type, name, reason, notes, banned_by, active, created_at, updated_at';

// Au moins un champ doit être fourni pour un PATCH utile.
const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom est requis.').max(190).optional(),
    entity_type: z.enum(['team', 'org']).optional(),
    reason: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.entity_type !== undefined ||
      v.reason !== undefined ||
      v.notes !== undefined ||
      v.active !== undefined,
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
      'admin-entity-blacklist-id'
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
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.entity_type !== undefined)
      updatePayload.entity_type = body.entity_type;
    if (body.reason !== undefined)
      updatePayload.reason = nullableText(body.reason);
    if (body.notes !== undefined)
      updatePayload.notes = nullableText(body.notes);
    if (body.active !== undefined) updatePayload.active = body.active;

    const { data, error } = await admin
      .from('entity_blacklist')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select(SELECT_COLS)
      .maybeSingle();

    if (error) {
      logger.error('[admin/entity-blacklist/id] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the entity blacklist entry.' });
    }

    if (!data) {
      return res
        .status(404)
        .json({ error: 'Entity blacklist entry not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'entity_blacklist_update',
        entity_type: 'entity_blacklist',
        entity_id: data.id,
        tenant_id: ctx.tenantId,
        payload: updatePayload,
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { data, error } = await admin
      .from('entity_blacklist')
      .delete()
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('[admin/entity-blacklist/id] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the entity blacklist entry.' });
    }

    if (!data) {
      return res
        .status(404)
        .json({ error: 'Entity blacklist entry not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'entity_blacklist_remove',
        entity_type: 'entity_blacklist',
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
