// pages/api/admin/scrims/[scrimId]/cast-assignments/index.ts
//
// Lot 9 — Scrims ↔ Match-Day reuse.
// Admin endpoint pour assigner des casters à un SCRIM (parité avec la route
// matches/[matchId]/cast-assignments). Persistance dans cast_assignments
// (polymorphique : match_id OR scrim_id, jamais les deux).
//
// GET  → liste des assignments du scrim avec cast_member joint
// POST → créer un assignment { castMemberId, briefingAt }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitCastEvent } from '@/utils/castEvents';
import { logger } from '../../../../../../utils/logger';

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { scrimId } = req.query;
  if (!scrimId || Array.isArray(scrimId) || !isValidUUID(scrimId)) {
    return res.status(400).json({ error: 'scrimId invalide' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('cast_assignments')
      .select(
        `id, scrim_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
         acked_at, created_at, updated_at,
         cast_member:cast_member_id (id, name, auth_user_id, image_url)`
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('scrim_id', scrimId)
      .order('briefing_at', { ascending: true });

    if (error) {
      logger.error('[admin/scrims/cast-assignments] list error', error);
      return res.status(500).json({ error: 'Échec du chargement' });
    }
    return res.status(200).json({ assignments: data ?? [] });
  }

  if (req.method === 'POST') {
    const { castMemberId, briefingAt } = req.body || {};

    if (typeof castMemberId !== 'string' || !isValidUUID(castMemberId)) {
      return res.status(400).json({ error: 'castMemberId invalide' });
    }
    if (typeof briefingAt !== 'string') {
      return res.status(400).json({ error: 'briefingAt requis' });
    }
    const briefingDate = new Date(briefingAt);
    if (Number.isNaN(briefingDate.getTime())) {
      return res.status(400).json({ error: 'briefingAt invalide' });
    }
    if (briefingDate.getTime() < Date.now() - 60_000) {
      return res
        .status(400)
        .json({ error: 'briefingAt doit être dans le futur.' });
    }

    // Existence + actif du caster (parité avec matches/cast-assignments).
    const { data: castMember, error: castMemberErr } = await supabaseAdmin
      .from('cast_members')
      .select('id, is_active')
      .eq('id', castMemberId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (castMemberErr) {
      logger.error(
        '[admin/scrims/cast-assignments] cast_member lookup error',
        castMemberErr
      );
      return res.status(500).json({ error: 'Échec de la vérification' });
    }
    if (!castMember) {
      return res.status(404).json({ error: 'Caster introuvable.' });
    }
    if (castMember.is_active === false) {
      return res.status(409).json({ error: 'Ce caster est désactivé.' });
    }

    // Existence du scrim + tenant scope.
    const { data: scrim } = await supabaseAdmin
      .from('scrims')
      .select('id')
      .eq('id', scrimId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (!scrim) {
      return res.status(404).json({ error: 'Scrim introuvable.' });
    }

    const { data, error } = await supabaseAdmin
      .from('cast_assignments')
      .insert({
        tenant_id: ctx.tenantId,
        scrim_id: scrimId,
        // match_id volontairement NULL — la CHECK polymorphique
        // (chk_cast_assignments_entity_xor) impose match XOR scrim.
        match_id: null,
        cast_member_id: castMemberId,
        briefing_at: briefingDate.toISOString(),
      })
      .select(
        `id, scrim_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
         acked_at, created_at, updated_at,
         cast_member:cast_member_id (id, name, auth_user_id, image_url)`
      )
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Ce caster est déjà assigné à ce scrim.',
        });
      }
      logger.error('[admin/scrims/cast-assignments] create error', error);
      return res.status(500).json({ error: 'Échec de la création' });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_cast_assignment',
        entity_type: 'cast_assignment',
        entity_id: data.id,
        tournament_id: null,
        payload: { scrim_id: scrimId, cast_member_id: castMemberId },
      });
    }

    // Réutilise le même event payload que matches : le bot router consomme
    // `cast.assigned` indépendamment de l'entité, on précise juste
    // `scrimId` (vs `matchId`) pour qu'il puisse charger les bons infos.
    void emitCastEvent(
      'cast.assigned',
      {
        assignmentId: data.id,
        scrimId,
        castMemberId,
        briefingAt: data.briefing_at ?? briefingDate.toISOString(),
      },
      ctx.tenantId
    );

    return res.status(201).json({ assignment: data });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
