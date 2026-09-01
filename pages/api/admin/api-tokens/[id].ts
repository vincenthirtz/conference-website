// pages/api/admin/api-tokens/[id].ts
//
// PATCH  — update a token's partner exemption (`comp` / `comp_note`). Setting
//          `comp = true` (free API access, bypasses the plan gate) requires the
//          `owner` role — a plain admin cannot self-exempt from billing.
// DELETE — revoke a public API token (soft : sets `revoked_at`). A revoked
//          token is rejected 401 by the public write middleware but the row is
//          kept for audit (`last_used_at`, creation metadata).
//
// Auth : admin+ on the active tenant. The token must belong to `ctx.tenantId`
// (an admin cannot touch another tenant's token). Already-revoked tokens →
// idempotent 200.
//
// Rate-limited at 10/min per IP. Audit : staff_logs action='other'.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const patchBodySchema = z
  .object({
    comp: z.boolean().optional(),
    comp_note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((b) => b.comp !== undefined || b.comp_note !== undefined, {
    message: 'Rien à mettre à jour.',
  });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'admin-api-tokens')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'PATCH') return handlePatch(req, res, ctx);
  if (req.method === 'DELETE') return handleDelete(req, res, ctx);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

/** DELETE — révocation soft (`revoked_at`). Idempotent si déjà révoqué. */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid token id.', code: 'INVALID_TOKEN_ID' });
  }

  // Scope au tenant courant : on ne peut révoquer que ses propres tokens.
  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('tenant_api_tokens')
    .select('id, name, token_prefix, revoked_at')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[admin/api-tokens] revoke lookup error', lookupErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Token not found.', code: 'UNKNOWN_TOKEN' });
  }

  // Déjà révoqué → idempotent.
  if (row.revoked_at) {
    return res.status(200).json({ id: row.id, revokedAt: row.revoked_at });
  }

  const revokedAt = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('tenant_api_tokens')
    .update({ revoked_at: revokedAt })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);

  if (updateErr) {
    logger.error('[admin/api-tokens] revoke update error', updateErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to revoke token.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'api_token',
    entity_id: id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'revoke_api_token',
      name: row.name,
      prefix: row.token_prefix,
    },
  });

  return res.status(200).json({ id, revokedAt });
}

/**
 * PATCH — met à jour l'exemption partenaire d'une clé. Poser `comp = true`
 * (accès API gratuit) exige le rôle `owner`. `comp_note` est libre (admin).
 */
async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid token id.', code: 'INVALID_TOKEN_ID' });
  }

  const parsed = patchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid body.', code: 'INVALID_BODY' });
  }

  // Activer une exemption partenaire est réservé à l'owner (bypass du modèle
  // payant). La désactiver (`comp: false`) reste possible pour un admin.
  if (parsed.data.comp === true && !hasAtLeastRole(ctx.role, 'owner')) {
    return res.status(403).json({
      error: 'Seul un owner peut activer une clé partenaire (comp).',
      code: 'FORBIDDEN_COMP',
    });
  }

  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('tenant_api_tokens')
    .select('id, name, token_prefix, comp, comp_note')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[admin/api-tokens] patch lookup error', lookupErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Token not found.', code: 'UNKNOWN_TOKEN' });
  }

  const update: { comp?: boolean; comp_note?: string | null } = {};
  if (parsed.data.comp !== undefined) update.comp = parsed.data.comp;
  if (parsed.data.comp_note !== undefined)
    update.comp_note = parsed.data.comp_note;
  // Retirer l'exemption efface aussi la note (cohérence : plus de partenaire).
  if (parsed.data.comp === false && parsed.data.comp_note === undefined) {
    update.comp_note = null;
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('tenant_api_tokens')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id, name, token_prefix, scopes, comp, comp_note, revoked_at')
    .single();

  if (updateErr || !updated) {
    logger.error('[admin/api-tokens] patch update error', updateErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to update token.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'api_token',
    entity_id: id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'update_api_token_comp',
      name: row.name,
      prefix: row.token_prefix,
      comp: updated.comp === true,
    },
  });

  return res.status(200).json({ token: updated });
}

export default withStaffRoute(handler, { permission: 'manage_settings' });
