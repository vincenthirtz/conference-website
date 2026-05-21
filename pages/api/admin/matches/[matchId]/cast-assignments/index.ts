// pages/api/admin/matches/[matchId]/cast-assignments/index.ts
// Admin: list + create cast assignments for a match.
// GET  → liste les assignments du match (avec cast_member joint)
// POST → ajoute un assignment { castMemberId, briefingAt }

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
      .eq('tenant_id', ctx.tenantId)
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
    // Un briefing dans le passé n'a pas de sens (le bot doit pouvoir DM en
    // amont). On garde 1 minute de tolérance pour les requêtes lentes /
    // décalages d'horloge entre le client admin et le serveur.
    if (briefingDate.getTime() < Date.now() - 60_000) {
      return res
        .status(400)
        .json({ error: 'briefingAt doit être dans le futur.' });
    }

    // Vérifie que le cast_member existe et est actif. Sans ce check on peut
    // assigner un caster désactivé, qui ne recevra pas son rappel.
    const { data: castMember, error: castMemberErr } = await supabaseAdmin
      .from('cast_members')
      .select('id, is_active')
      .eq('id', castMemberId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (castMemberErr) {
      logger.error('[admin/cast-assignments] cast_member lookup error', castMemberErr);
      return res.status(500).json({ error: 'Échec de la vérification' });
    }
    if (!castMember) {
      return res.status(404).json({ error: 'Caster introuvable.' });
    }
    if (castMember.is_active === false) {
      return res
        .status(409)
        .json({ error: 'Ce caster est désactivé.' });
    }

    const { data, error } = await supabaseAdmin
      .from('cast_assignments')
      .insert({
        tenant_id: ctx.tenantId,
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

    void emitCastEvent(
      'cast.assigned',
      {
        assignmentId: data.id,
        matchId,
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
