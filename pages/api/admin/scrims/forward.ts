// pages/api/admin/scrims/forward.ts
// Admin: forward a public (external) scrim request to a different team.
// Useful when the requester picked the wrong team or the original target
// declined and the staff wants to relay the offer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../utils/logger';
type ForwardBody = {
  demandeId?: string;
  targetTeamId?: string;
};

export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { demandeId, targetTeamId } = (req.body || {}) as ForwardBody;

  if (!demandeId || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId invalide.' });
  }
  if (!targetTeamId || !isValidUUID(targetTeamId)) {
    return res.status(400).json({ error: 'targetTeamId invalide.' });
  }

  const { data: source, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('id', demandeId)
    .eq('type', 'scrim')
    .maybeSingle();

  if (fetchErr || !source) {
    return res.status(404).json({ error: 'Demande introuvable.' });
  }

  if (source.source !== 'public') {
    return res.status(400).json({
      error: 'Seules les demandes externes peuvent être transférées.',
    });
  }

  if (source.team_id === targetTeamId) {
    return res.status(400).json({
      error: 'La demande est déjà destinée à cette équipe.',
    });
  }

  const { data: targetTeam } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', targetTeamId)
    .eq('is_active', true)
    .maybeSingle();

  if (!targetTeam) {
    return res
      .status(400)
      .json({ error: "L'équipe cible n'existe pas ou n'est pas active." });
  }

  // Avoid double-forwarding to the same team if a pending one already exists.
  const sourcePayload = (source.payload as Record<string, any> | null) || {};
  const requesterEmail = sourcePayload.requester_email;
  if (requesterEmail) {
    const { data: dup } = await supabaseAdmin
      .from('demandes')
      .select('id')
      .eq('team_id', targetTeamId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .filter('payload->>requester_email', 'eq', requesterEmail)
      .limit(1)
      .maybeSingle();
    if (dup) {
      return res.status(409).json({
        error:
          'Une demande de scrim de ce contact vers cette équipe est déjà en attente.',
      });
    }
  }

  const newPayload: Record<string, unknown> = {
    ...sourcePayload,
    target_team_name: targetTeam.name,
    forwarded_from: {
      demande_id: source.id,
      original_team_id: source.team_id,
      forwarded_at: new Date().toISOString(),
    },
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('demandes')
    .insert({
      user_id: null,
      team_id: targetTeamId,
      type: 'scrim',
      status: 'pending',
      comment: source.comment,
      source: 'public',
      payload: newPayload,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    logger.error('[admin/scrims/forward] insert error:', insertErr);
    return res.status(500).json({ error: 'Échec du transfert.' });
  }

  // Annotate the original demande so admins can trace the relay.
  const existingNote = (source.staff_note || '').toString();
  const newNote = [
    existingNote,
    `Transférée vers ${targetTeam.name} (${targetTeam.id})`,
  ]
    .filter(Boolean)
    .join('\n');
  await supabaseAdmin
    .from('demandes')
    .update({ staff_note: newNote })
    .eq('id', source.id);

  const staffId: string | null = ctx.staff?.id ?? null;
  if (staffId) {
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'other',
        entity_type: 'demande',
        entity_id: source.id,
        tournament_id: null,
        payload: {
          subject: 'scrim_forward',
          source_demande_id: source.id,
          new_demande_id: inserted.id,
          original_team_id: source.team_id,
          target_team_id: targetTeamId,
          target_team_name: targetTeam.name,
        },
      });
    } catch (e) {
      logger.error('[admin/scrims/forward] log error:', e);
    }
  }

  return res.status(201).json({
    success: true,
    newDemandeId: inserted.id,
    targetTeam: { id: targetTeam.id, name: targetTeam.name },
  });
}
