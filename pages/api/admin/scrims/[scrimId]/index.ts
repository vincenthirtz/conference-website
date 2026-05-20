// pages/api/admin/scrims/[scrimId]/index.ts
// Admin: detail / mise a jour / suppression d'un scrim
// - GET    : details + equipes + nombre de matchs
// - PATCH  : modification des champs
// - DELETE : suppression (cascade: matches lies)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  emitScrimEvent,
  statusTransitionEvent,
} from '@/utils/scrimEvents';
import { logger } from '../../../../../utils/logger';

const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

const PATCHABLE_FIELDS = [
  'name',
  'slug',
  'game',
  'status',
  'team1_id',
  'team2_id',
  'scheduled_date',
  'timezone',
  'is_public',
  'logo_url',
  'banner_url',
  'description',
  'stream_url',
  'settings',
] as const;
type PatchField = (typeof PATCHABLE_FIELDS)[number];

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const rawId = req.query.scrimId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'scrimId invalide' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(res, id, ctx);
    case 'PATCH':
    case 'PUT':
      return handlePatch(req, res, id, ctx);
    case 'DELETE':
      return handleDelete(res, id, ctx);
    default:
      res.setHeader('Allow', 'GET,PATCH,PUT,DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(
  res: NextApiResponse,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin!
    .from('scrims')
    .select(
      `
      id, name, slug, game, status,
      team1_id, team2_id,
      scheduled_date, timezone,
      is_public, logo_url, banner_url, description, stream_url,
      source_demande_id, created_at, updated_at,
      team1:teams!scrims_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[admin/scrims/:id] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch scrim' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Scrim not found' });
  }

  const { count: matchesCount } = await supabaseAdmin!
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('scrim_id', id);

  return res.status(200).json({
    scrim: data,
    matches_count: matchesCount ?? 0,
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const updatePayload: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (body[field as string] !== undefined) {
      updatePayload[field] = body[field as string];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  if (
    updatePayload.status !== undefined &&
    !(VALID_STATUSES as readonly string[]).includes(updatePayload.status as string)
  ) {
    return res.status(400).json({
      error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    });
  }

  if (
    updatePayload.name !== undefined &&
    (typeof updatePayload.name !== 'string' ||
      (updatePayload.name as string).trim().length === 0)
  ) {
    return res.status(400).json({ error: 'Le nom ne peut pas etre vide.' });
  }

  for (const teamField of ['team1_id', 'team2_id'] as const) {
    const v = updatePayload[teamField];
    if (v !== undefined && v !== null && !isValidUUID(v as string)) {
      return res.status(400).json({ error: `${teamField} invalide` });
    }
  }

  if (
    updatePayload.scheduled_date !== undefined &&
    updatePayload.scheduled_date !== null &&
    Number.isNaN(Date.parse(updatePayload.scheduled_date as string))
  ) {
    return res.status(400).json({ error: 'scheduled_date invalide' });
  }

  // Slug unique si modifie
  if (typeof updatePayload.slug === 'string' && updatePayload.slug.trim()) {
    const slug = (updatePayload.slug as string).trim();
    updatePayload.slug = slug;
    const { data: dup } = await supabaseAdmin!
      .from('scrims')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('slug', slug)
      .neq('id', id)
      .maybeSingle();
    if (dup) {
      return res
        .status(409)
        .json({ error: `Un scrim avec le slug "${slug}" existe deja.` });
    }
  }

  const { data: before } = await supabaseAdmin!
    .from('scrims')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!before) return res.status(404).json({ error: 'Scrim not found' });

  // Verifier team1 != team2 sur l'etat resultant
  const effectiveTeam1 =
    (updatePayload.team1_id as string | null | undefined) !== undefined
      ? (updatePayload.team1_id as string | null)
      : (before.team1_id as string | null);
  const effectiveTeam2 =
    (updatePayload.team2_id as string | null | undefined) !== undefined
      ? (updatePayload.team2_id as string | null)
      : (before.team2_id as string | null);
  if (effectiveTeam1 && effectiveTeam2 && effectiveTeam1 === effectiveTeam2) {
    return res
      .status(400)
      .json({ error: 'team1_id et team2_id doivent etre distincts' });
  }

  const { data: after, error: updErr } = await supabaseAdmin!
    .from('scrims')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single();

  if (updErr || !after) {
    logger.error('[admin/scrims/:id] PATCH error:', updErr);
    return res.status(500).json({ error: 'Failed to update scrim' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'scrim',
        entity_id: id,
        tournament_id: null,
        payload: {
          subject: 'update_scrim',
          changes: updatePayload as Record<PatchField, unknown>,
        },
      });
    } catch (e) {
      logger.error('[admin/scrims/:id] log error:', e);
    }
  }

  // Émet un bot event sur transition de status. On utilise `after` (la row
  // post-update) pour avoir le slug + équipes à jour si elles ont changé
  // dans le même PATCH.
  const beforeStatus = (before.status as string) || 'draft';
  const afterStatus = (after.status as string) || beforeStatus;
  const transitionEvent = statusTransitionEvent(beforeStatus, afterStatus);
  if (transitionEvent) {
    void emitScrimEvent(transitionEvent, after, {
      previousStatus: beforeStatus,
    });
  }

  return res.status(200).json({ success: true, scrim: after });
}

async function handleDelete(
  res: NextApiResponse,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  // Snapshot complet AVANT delete : on en a besoin pour l'event scrim.deleted
  // (le bot peut vouloir cleaner un thread / annonce associé via les ids
  // team1/team2 ou le slug).
  const { data: before } = await supabaseAdmin!
    .from('scrims')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!before) return res.status(404).json({ error: 'Scrim not found' });

  // Soft-delete : conserve la row + ses matches liés pour restauration via
  // /admin/recycle-bin. Idempotent : delete une scrim déjà soft-deleted no-op.
  const { error } = await supabaseAdmin!
    .from('scrims')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) {
    logger.error('[admin/scrims/:id] DELETE error:', error);
    return res.status(500).json({ error: 'Failed to delete scrim' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'scrim',
        entity_id: id,
        tournament_id: null,
        payload: { subject: 'delete_scrim', name: before.name, slug: before.slug },
      });
    } catch (e) {
      logger.error('[admin/scrims/:id] log error:', e);
    }
  }

  void emitScrimEvent('scrim.deleted', before, {
    previousStatus: before.status,
  });

  return res.status(200).json({ success: true });
}
