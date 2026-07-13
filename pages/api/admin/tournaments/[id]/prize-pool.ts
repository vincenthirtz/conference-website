// pages/api/admin/tournaments/[id]/prize-pool.ts
//
// Gestion organisateur de la cagnotte (prize pool) d'un tournoi —
// « Profondeur de la monétisation », cash-prize crowdfundé.
//
//   GET       : config de la cagnotte + liste COMPLÈTE des contributions + compteurs.
//   PUT/POST  : crée ou met à jour la cagnotte (title, goal_amount_cents,
//               base_amount_cents, is_open). Une cagnotte par tournoi.
//
// Auth : `manager` — aligné sur les endpoints d'administration de tournoi
// existants (pages/api/admin/tournaments/index.ts gate à 'manager'). La config
// de cagnotte est de l'ops tournoi, pas un acte owner-only comme la génération
// d'un lien plan (plan-checkout).
//
// Tables RLS service-role-only → supabaseAdmin, scopé strict par tenant_id.
// Voir database/migrations/create_prize_pool_tables.sql.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { formatZodError } from '@/utils/validation';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const upsertSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  goal_amount_cents: z.number().int().positive().nullable().optional(),
  base_amount_cents: z.number().int().min(0).optional(),
  is_open: z.boolean().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id.', code: 'INVALID_TOURNAMENT_ID' });
  }
  const tournamentId = id;
  const tenantId = ctx.tenantId;

  // Le tournoi doit exister dans le tenant courant (cohérence + FK).
  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (tErr) {
    logger.error(
      '[admin/tournaments/prize-pool] tournament lookup error',
      tErr
    );
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tournament) {
    return res
      .status(404)
      .json({ error: 'Tournament not found.', code: 'UNKNOWN_TOURNAMENT' });
  }

  if (req.method === 'GET') {
    return handleGet(res, tournamentId, tenantId);
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    return handleUpsert(req, res, ctx, tournamentId, tenantId);
  }

  res.setHeader('Allow', 'GET, PUT, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleGet(
  res: NextApiResponse,
  tournamentId: string,
  tenantId: string
) {
  const { data: pool, error: poolErr } = await supabaseAdmin
    .from('tournament_prize_pools')
    .select(
      'id, tournament_id, title, currency, goal_amount_cents, base_amount_cents, raised_amount_cents, is_open, created_at, updated_at'
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (poolErr) {
    logger.error('[admin/tournaments/prize-pool] pool lookup error', poolErr);
    return res.status(500).json({ error: 'Server error.' });
  }

  if (!pool) {
    return res
      .status(200)
      .json({ pool: null, contributions: [], contributorCount: 0 });
  }

  const { data: contributions, error: cErr } = await supabaseAdmin
    .from('prize_pool_contributions')
    .select(
      'id, helloasso_payment_id, checkout_intent_id, amount_cents, contributor_name, is_anonymous, message, created_at'
    )
    .eq('prize_pool_id', pool.id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (cErr) {
    logger.error('[admin/tournaments/prize-pool] contributions error', cErr);
    return res.status(500).json({ error: 'Server error.' });
  }

  const list = contributions || [];
  const base =
    typeof pool.base_amount_cents === 'number' ? pool.base_amount_cents : 0;
  const raised =
    typeof pool.raised_amount_cents === 'number' ? pool.raised_amount_cents : 0;

  return res.status(200).json({
    pool: { ...pool, total_cents: base + raised },
    contributions: list,
    contributorCount: list.length,
  });
}

async function handleUpsert(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  tournamentId: string,
  tenantId: string
) {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: formatZodError(parsed.error), code: 'INVALID_BODY' });
  }
  const body = parsed.data;

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('tournament_prize_pools')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (exErr) {
    logger.error('[admin/tournaments/prize-pool] existing lookup error', exErr);
    return res.status(500).json({ error: 'Server error.' });
  }

  const nowIso = new Date().toISOString();

  if (existing) {
    // Update : n'écrase que les champs fournis (denormalized raised_amount_cents
    // est géré exclusivement par le webhook — jamais touché ici).
    const updatePayload: Record<string, unknown> = { updated_at: nowIso };
    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.goal_amount_cents !== undefined)
      updatePayload.goal_amount_cents = body.goal_amount_cents;
    if (body.base_amount_cents !== undefined)
      updatePayload.base_amount_cents = body.base_amount_cents;
    if (body.is_open !== undefined) updatePayload.is_open = body.is_open;

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('tournament_prize_pools')
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
      .select('*')
      .maybeSingle();
    if (updErr) {
      logger.error('[admin/tournaments/prize-pool] update error', updErr);
      return res.status(500).json({ error: 'Failed to update prize pool.' });
    }

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      tenant_id: tenantId,
      payload: { action: 'update_prize_pool', changes: body },
    });

    return res.status(200).json({ pool: updated });
  }

  // Create
  const { data: created, error: insErr } = await supabaseAdmin
    .from('tournament_prize_pools')
    .insert({
      tournament_id: tournamentId,
      tenant_id: tenantId,
      title: body.title ?? null,
      goal_amount_cents: body.goal_amount_cents ?? null,
      base_amount_cents: body.base_amount_cents ?? 0,
      is_open: body.is_open ?? false,
    })
    .select('*')
    .maybeSingle();
  if (insErr || !created) {
    logger.error('[admin/tournaments/prize-pool] insert error', insErr);
    return res.status(500).json({ error: 'Failed to create prize pool.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'tournament',
    entity_id: tournamentId,
    tournament_id: tournamentId,
    tenant_id: tenantId,
    payload: { action: 'create_prize_pool', changes: body },
  });

  return res.status(201).json({ pool: created });
}

export default withStaffRoute(handler, 'manager');
