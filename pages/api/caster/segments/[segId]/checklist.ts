// pages/api/caster/segments/[segId]/checklist.ts
//
// Feature: Run-of-show — Lot 2.
// PATCH : update un item de la checklist caster pour un segment.
// Body : { key: string, checked: boolean }
//
// Effet :
//   - checked=true  → set checked_by_user_id = session.user.id, checked_at = now()
//   - checked=false → clear checked_by_user_id et checked_at
//
// L'item doit deja exister dans caster_checklist (template defini par
// l'admin via le PATCH segment). Si la cle est absente, on retourne 404 —
// le caster ne cree pas d'items, il les coche.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const ChecklistPatchSchema = z.object({
  key: z.string().trim().min(1).max(80),
  checked: z.boolean(),
});

type ChecklistItem = {
  key: string;
  label: string;
  checked_by_user_id?: string | null;
  checked_at?: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'caster-checklist')
  )
    return;

  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }
  const admin = supabaseAdmin;

  const { segId } = req.query;
  if (!segId || Array.isArray(segId) || !isValidUUID(segId)) {
    return res.status(400).json({ error: 'Invalid segId.' });
  }

  const parsed = ChecklistPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { key, checked } = parsed.data;

  const { data: segment, error: fetchErr } = await admin
    .from('event_segments')
    .select('id, tenant_id, caster_checklist')
    .eq('id', segId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (fetchErr) {
    logger.error('[caster/checklist] segment lookup error', fetchErr);
    return res.status(500).json({ error: 'Failed to load segment.' });
  }
  if (!segment) {
    return res.status(404).json({ error: 'Segment not found.' });
  }

  const currentList = (
    Array.isArray(segment.caster_checklist) ? segment.caster_checklist : []
  ) as ChecklistItem[];

  const idx = currentList.findIndex((it) => it.key === key);
  if (idx === -1) {
    return res.status(404).json({
      error: `Aucun item de checklist avec la cle "${key}" sur ce segment.`,
      code: 'CHECKLIST_ITEM_NOT_FOUND',
    });
  }

  const now = new Date().toISOString();
  const updated: ChecklistItem = checked
    ? {
        ...currentList[idx],
        checked_by_user_id: ctx.user?.id ?? null,
        checked_at: now,
      }
    : {
        ...currentList[idx],
        checked_by_user_id: null,
        checked_at: null,
      };

  const newList = [...currentList];
  newList[idx] = updated;

  const { data: saved, error: updErr } = await admin
    .from('event_segments')
    .update({ caster_checklist: newList })
    .eq('id', segId)
    .eq('tenant_id', ctx.tenantId)
    .select(
      'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .single();

  if (updErr || !saved) {
    logger.error('[caster/checklist] update error', updErr);
    return res.status(500).json({ error: 'Failed to update checklist.' });
  }

  return res.status(200).json({ segment: saved });
}

export default withCasterRoute(handler);
