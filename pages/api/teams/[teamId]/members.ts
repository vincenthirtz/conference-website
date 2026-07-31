// pages/api/teams/[teamId]/members.ts
// DELETE : un capitaine ou manager retire un membre de son équipe (route publique, auth Bearer)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
} from '@/utils/teamRoles';

import { logger } from '../../../../utils/logger';
export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
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

    const { teamId } = req.query;
    if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
      return res.status(400).json({ error: 'Invalid teamId' });
    }

    // Sujet = l'appelant, ou la capitaine dépannée en act-as (`?as=…&act=1`) :
    // le retrait porte alors sur SON équipe.
    const { userId, tenantId } = subject;

    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('id, captain_id')
      .eq('id', teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!team) {
      return res.status(404).json({ error: 'Équipe introuvable.' });
    }

    // Vérifier que l'utilisateur gère cette équipe (capitaine ou manager)
    const access = await getManagedTeam(userId, tenantId);
    if (!access || access.teamId !== teamId) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }

    // Permission fine (R2) : le rôle doit couvrir `manage_roster`.
    const denied = assertTeamPermission(access, 'manage_roster');
    if (denied) return res.status(denied.status).json({ error: denied.error });

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
      .eq('tenant_id', tenantId)
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

    // Anti-escalation : un membre privilegie (role accordant des permissions)
    // ne peut etre retire que par le capitaine.
    const teamRoles = await loadTeamRolesFromSupabase(supabaseAdmin);
    if (roleHasAnyPermission(teamRoles, member.role) && !access.isCaptain) {
      return res.status(403).json({
        error: 'Seul le capitaine peut retirer un autre membre privilégié.',
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
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId);

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
  },
  { allowActAs: true }
);
