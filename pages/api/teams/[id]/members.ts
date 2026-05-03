// pages/api/teams/[teamId]/members.ts
// DELETE : un capitaine ou manager retire un membre de son équipe (route publique, auth Bearer)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';

import { logger } from '../../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'teams-remove-member'
    )
  )
    return;

  const { id: teamId } = req.query;
  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  const userId = user.id;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  // Vérifier que l'utilisateur gère cette équipe (capitaine ou manager)
  const access = await getManagedTeam(userId);
  if (!access || access.teamId !== teamId) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { memberId } = req.body || {};
  if (!memberId || typeof memberId !== 'string' || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'memberId (UUID) requis.' });
  }

  // Récupérer le membre
  const { data: member, error: fetchErr } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (fetchErr || !member) {
    return res
      .status(404)
      .json({ error: 'Membre introuvable dans cette équipe.' });
  }

  // Le capitaine ne peut pas se retirer lui-même via cet endpoint
  if (member.user_id === team.captain_id) {
    return res.status(400).json({
      error:
        "Le capitaine ne peut pas être retiré. Transfère le capitanat d'abord.",
    });
  }

  // Anti-escalation : un manager ne peut pas retirer un autre manager
  if (member.role === 'manager' && !access.isCaptain) {
    return res.status(403).json({
      error: 'Seul le capitaine peut retirer un autre manager.',
    });
  }

  // Un manager ne peut pas se retirer lui-même via cet endpoint (cohérence avec leave.ts)
  if (member.user_id === userId) {
    return res.status(400).json({
      error: "Utilise le bouton 'Quitter l'équipe' pour partir.",
    });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', teamId);

  if (deleteErr) {
    logger.error('[teams/[teamId]/members] delete error:', deleteErr);
    return res
      .status(500)
      .json({ error: 'Échec de la suppression du membre.' });
  }

  return res.status(200).json({
    success: true,
    info: "Membre retiré de l'équipe.",
  });
});
