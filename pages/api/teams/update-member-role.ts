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
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
} from '@/utils/teamRoles';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';

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
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
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
  const teamRoles = await loadTeamRolesFromSupabase(supabaseAdmin);

  // Anti-escalation : seul le capitaine peut accorder un role privilegie
  // (role qui ouvre >=1 permission de gestion).
  if (roleHasAnyPermission(teamRoles, newRole) && !access.isCaptain) {
    return res.status(403).json({
      error: 'Seul le capitaine peut accorder un rôle privilégié.',
    });
  }

  // Fetch the member to verify they belong to this team
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, role, is_substitute')
    .eq('id', memberId)
    .eq('team_id', captainTeam.id)
    .eq('tenant_id', tenantId)
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

  // Anti-escalation : un membre privilegie ne peut etre degrade que par le
  // capitaine.
  if (
    roleHasAnyPermission(teamRoles, member.role) &&
    !access.isCaptain
  ) {
    return res.status(403).json({
      error: "Seul le capitaine peut modifier le rôle d'un membre privilégié.",
    });
  }

  // Update role and is_substitute flag accordingly
  const isSubstitute = newRole === 'substitute';

  const { error: updateErr } = await supabaseAdmin
    .from('team_members')
    .update({ role: newRole, is_substitute: isSubstitute })
    .eq('id', memberId)
    .eq('team_id', captainTeam.id)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[update-member-role] error:', updateErr);
    // Trigger PG enforce_team_max_players : passer un coach en non-coach peut
    // depasser max_players. On renvoie un message metier clair.
    const errMsg = updateErr.message?.toLowerCase() || '';
    if (updateErr.code === '23514' || errMsg.includes('max_players')) {
      return res.status(400).json({
        error:
          "L'equipe a atteint la limite de joueur(s) imposee par un tournoi : impossible de basculer ce coach en role joueur.",
      });
    }
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
