// pages/api/teams/update-member-role.ts
// PATCH : le capitaine peut changer le role d'un membre de son equipe
// - player <-> substitute : sans limite
// - coach : groupe separe, pas de limite de nombre

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateRole } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'update-member-role'
    )
  )
    return;

  const userId = user.id;

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeam(userId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', access.teamId)
    .maybeSingle();

  if (teamErr || !captainTeam) {
    return res.status(404).json({ error: 'Team introuvable.' });
  }

  const { memberId, role } = req.body || {};

  if (!memberId || typeof memberId !== 'string' || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'memberId invalide.' });
  }

  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'role requis.' });
  }

  const newRole = validateRole(role);

  // Anti-escalation : seul le capitaine peut promouvoir un membre au role 'manager'.
  if (newRole === 'manager' && !access.isCaptain) {
    return res.status(403).json({
      error: "Seul le capitaine peut promouvoir un membre au role 'manager'.",
    });
  }

  // Fetch the member to verify they belong to this team
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, role, is_substitute')
    .eq('id', memberId)
    .eq('team_id', captainTeam.id)
    .maybeSingle();

  if (memberErr || !member) {
    return res
      .status(404)
      .json({ error: 'Membre introuvable dans ton equipe.' });
  }

  // Captain cannot change their own role
  if (member.user_id === userId) {
    return res
      .status(400)
      .json({ error: 'Tu ne peux pas changer ton propre role.' });
  }

  // Anti-escalation : un manager ne peut pas degrader un autre manager.
  if (member.role === 'manager' && !access.isCaptain) {
    return res.status(403).json({
      error: "Seul le capitaine peut modifier le role d'un autre manager.",
    });
  }

  // Update role and is_substitute flag accordingly
  const isSubstitute = newRole === 'substitute';

  const { error: updateErr } = await supabaseAdmin
    .from('team_members')
    .update({ role: newRole, is_substitute: isSubstitute })
    .eq('id', memberId)
    .eq('team_id', captainTeam.id);

  if (updateErr) {
    logger.error('[update-member-role] error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour du role.' });
  }

  return res.status(200).json({
    success: true,
    memberId,
    newRole,
    isSubstitute,
    message: `Role mis a jour vers "${newRole}".`,
  });
});
