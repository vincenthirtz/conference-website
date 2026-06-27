// pages/api/teams/update-member.ts
// PATCH : le capitaine / manager met a jour un membre de l'equipe qu'il gere.
//   - battle_tag : correction du BattleTag (format Name#0000)
//   - is_substitute : marquer / demarquer un membre comme remplacant
//   - role : changement de role (player <-> substitute, coach, etc.)
//
// Cette route complete update-member-role.ts (qui ne gere que le role) en
// permettant la correction inline du BattleTag et la gestion remplacant depuis
// l'ecran self-service capitaine (/admin/teams/my).
//
// Acces : getManagedTeam (capitaine OU role privilegie). Le caller doit gerer
// l'equipe du membre cible (verifie via team_id + tenant).
//
// Audit :
//   - update_player_battle_tag : quand battle_tag change
//   - manage_substitute        : quand is_substitute change

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateRole } from '@/utils/apiHelpers';
import { withAuthRoute, getStaffByUserId } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
} from '@/utils/teamRoles';
import {
  validateBattleTag,
  BATTLE_TAG_FORMAT_HINT,
} from '@/utils/teams/addMember';
import { logStaffAction } from '@/utils/staffLogs';
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

  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'update-member'))
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  // Acces : capitaine ou manager d'une equipe
  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { memberId } = req.body || {};
  if (!memberId || typeof memberId !== 'string' || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'memberId invalide.' });
  }

  const hasRole = 'role' in (req.body || {}) && req.body.role != null;
  const hasBattleTag = 'battle_tag' in (req.body || {});
  const hasIsSubstitute =
    'is_substitute' in (req.body || {}) && req.body.is_substitute != null;

  if (!hasRole && !hasBattleTag && !hasIsSubstitute) {
    return res
      .status(400)
      .json({
        error: 'Aucun champ a mettre a jour (role/battle_tag/is_substitute).',
      });
  }

  // Charger le membre cible et verifier qu'il appartient a l'equipe geree
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id, role, battle_tag, is_substitute')
    .eq('id', memberId)
    .eq('team_id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (memberErr || !member) {
    return res
      .status(404)
      .json({ error: 'Membre introuvable dans ton equipe.' });
  }

  const updatePayload: Record<string, unknown> = {};

  // --- BattleTag -----------------------------------------------------------
  let battleTagChanged = false;
  let newBattleTag: string | null = member.battle_tag;
  if (hasBattleTag) {
    const raw = req.body.battle_tag;
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
      return res.status(400).json({ error: BATTLE_TAG_FORMAT_HINT });
    }
    try {
      newBattleTag = validateBattleTag(String(raw));
    } catch {
      return res.status(400).json({ error: BATTLE_TAG_FORMAT_HINT });
    }
    if (newBattleTag !== member.battle_tag) {
      updatePayload.battle_tag = newBattleTag;
      battleTagChanged = true;
    }
  }

  // --- Role / substitute ---------------------------------------------------
  // is_substitute peut etre pilote soit explicitement, soit derive du role.
  let newRole: string | null = member.role;
  let newIsSubstitute: boolean = member.is_substitute ?? false;

  if (hasRole) {
    if (typeof req.body.role !== 'string') {
      return res.status(400).json({ error: 'role invalide.' });
    }
    newRole = validateRole(req.body.role);
    const teamRoles = await loadTeamRolesFromSupabase(supabaseAdmin);

    // Anti-escalation : accorder/modifier un role privilegie => capitaine only.
    if (
      (roleHasAnyPermission(teamRoles, newRole) ||
        roleHasAnyPermission(teamRoles, member.role)) &&
      !access.isCaptain
    ) {
      return res.status(403).json({
        error: 'Seul le capitaine peut modifier un rôle privilégié.',
      });
    }
    if (member.user_id === userId && newRole !== member.role) {
      return res
        .status(400)
        .json({ error: 'Tu ne peux pas changer ton propre role.' });
    }
    updatePayload.role = newRole;
    // Le role substitute force is_substitute=true, et inversement on remet a
    // false si on quitte ce role (sauf override explicite plus bas).
    newIsSubstitute = newRole === 'substitute';
    updatePayload.is_substitute = newIsSubstitute;
  }

  let substituteChanged = false;
  if (hasIsSubstitute) {
    const desired = req.body.is_substitute === true;
    if (desired !== (member.is_substitute ?? false)) {
      newIsSubstitute = desired;
      updatePayload.is_substitute = desired;
      substituteChanged = true;
    }
  } else if (hasRole && newIsSubstitute !== (member.is_substitute ?? false)) {
    // Le changement de role a (de)marque le membre comme remplacant.
    substituteChanged = true;
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(200).json({
      success: true,
      memberId,
      battle_tag: newBattleTag,
      is_substitute: newIsSubstitute,
      role: newRole,
      message: 'Aucune modification.',
    });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('team_members')
    .update(updatePayload)
    .eq('id', memberId)
    .eq('team_id', access.teamId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[update-member] error:', updateErr);
    const errMsg = updateErr.message?.toLowerCase() || '';
    if (updateErr.code === '23514' || errMsg.includes('max_players')) {
      return res.status(400).json({
        error:
          "L'equipe a atteint la limite de joueur(s) imposee par un tournoi : modification refusee.",
      });
    }
    return res
      .status(500)
      .json({ error: 'Echec de la mise a jour du membre.' });
  }

  // --- Audit ---------------------------------------------------------------
  // staff_id = la row staff du caller (la page exige un role staff minimal).
  const staff = await getStaffByUserId(userId);
  if (staff?.id) {
    if (battleTagChanged) {
      await logStaffAction({
        staff_id: staff.id,
        action: 'update_player_battle_tag',
        entity_type: 'team_member',
        entity_id: memberId,
        tenant_id: tenantId,
        payload: {
          team_id: access.teamId,
          previous: member.battle_tag,
          next: newBattleTag,
        },
      });
    }
    if (substituteChanged) {
      await logStaffAction({
        staff_id: staff.id,
        action: 'manage_substitute',
        entity_type: 'team_member',
        entity_id: memberId,
        tenant_id: tenantId,
        payload: {
          team_id: access.teamId,
          is_substitute: newIsSubstitute,
        },
      });
    }
  }

  return res.status(200).json({
    success: true,
    memberId,
    battle_tag: newBattleTag,
    is_substitute: newIsSubstitute,
    role: newRole,
    message: 'Membre mis a jour.',
  });
});
