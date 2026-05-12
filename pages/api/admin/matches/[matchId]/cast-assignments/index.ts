// pages/api/admin/matches/[matchId]/cast-assignments/index.ts
// Admin: list + create cast assignments for a match.
// GET  → liste les assignments du match (avec cast_member joint)
// POST → ajoute un assignment { castMemberId, briefingAt }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../../utils/logger';

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('cast_assignments')
      .select(
        `id, match_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
         created_at, updated_at,
         cast_member:cast_member_id (id, name, auth_user_id, image_url)`
      )
      .eq('match_id', matchId)
      .order('briefing_at', { ascending: true });

    if (error) {
      logger.error('[admin/cast-assignments] list error', error);
      return res.status(500).json({ error: 'Échec du chargement' });
    }
    return res.status(200).json({ assignments: data ?? [] });
  }

  if (req.method === 'POST') {
    const { castMemberId, briefingAt } = req.body || {};

    if (
      typeof castMemberId !== 'string' ||
      !isValidUUID(castMemberId)
    ) {
      return res.status(400).json({ error: 'castMemberId invalide' });
    }
    if (typeof briefingAt !== 'string') {
      return res.status(400).json({ error: 'briefingAt requis' });
    }
    const briefingDate = new Date(briefingAt);
    if (Number.isNaN(briefingDate.getTime())) {
      return res.status(400).json({ error: 'briefingAt invalide' });
    }

    const { data, error } = await supabaseAdmin
      .from('cast_assignments')
      .insert({
        match_id: matchId,
        cast_member_id: castMemberId,
        briefing_at: briefingDate.toISOString(),
      })
      .select(
        `id, match_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
         created_at, updated_at,
         cast_member:cast_member_id (id, name, auth_user_id, image_url)`
      )
      .single();

    if (error) {
      // UNIQUE (match_id, cast_member_id) clash
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Ce caster est déjà assigné à ce match.',
        });
      }
      logger.error('[admin/cast-assignments] create error', error);
      return res.status(500).json({ error: 'Échec de la création' });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_cast_assignment',
        entity_type: 'cast_assignment',
        entity_id: data.id,
        tournament_id: null,
        payload: { match_id: matchId, cast_member_id: castMemberId },
      });
    }

    return res.status(201).json({ assignment: data });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
