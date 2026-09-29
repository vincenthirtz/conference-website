// features/player/team/service/roster.ts — gestes de roster de l'équipe gérée
// (lot P10) : rôle, poste, fiche (BattleTag, SR, remplaçante), retrait.
// Ex-pages/api/teams/{update-member-role,update-member-specialty,
// update-member,[teamId]/members} — même contrat.
//
// `manage_roster` est exigé en amont (route `team: { permission }`, ou
// `resolveRemovalAccess` pour le retrait). Règles tenues ici :
//   * « capitaine toujours tout » : la ligne de la capitaine n'est modifiable
//     que par elle, un membre privilégié n'est dégradé / retiré que par elle
//     (capitanat voulu, S4 — un conflit entre pairs n'est pas une délégation) ;
//   * on ne change pas son propre rôle, on ne se retire pas soi-même ici.

import {
  ALLOWED_SPECIALTIES,
  isValidUUID,
  validateRole,
  validateSpecialty,
} from '@/utils/apiHelpers';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
  TEAM_ROLE_VALUES,
} from '@/utils/teamRoles';
import {
  BATTLE_TAG_FORMAT_HINT,
  isNonPlayingTeamRole,
  roleRequiresBattleTag,
  validateBattleTag,
} from '@/utils/teams/addMember';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';
import { getStaffByUserId } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  deleteRosterMember,
  readRosterMember,
  readTeamHead,
  updateRosterMember,
} from '../repository/roster';
import type {
  RemoveTeamMemberInput,
  UpdateMemberInput,
  UpdateMemberRoleInput,
  UpdateMemberSpecialtyInput,
} from '../schemas';
import {
  fail,
  type ManagedTeamContext,
  type TeamSubjectContext,
} from './context';

const MEMBER_NOT_FOUND = 'Membre introuvable dans ton equipe.';
const CAPTAIN_ROW_ONLY =
  'Seul le capitaine peut modifier sa propre ligne de membre.';
const PRIVILEGED_ROLE_ONLY =
  "Seul le capitaine peut modifier le rôle d'un membre privilégié.";
const OWN_ROLE = 'Tu ne peux pas changer ton propre role.';

/** Violation de `max_players` (trigger PG) → message métier. */
function isMaxPlayersViolation(err: { code?: string; message?: string }) {
  const msg = err.message?.toLowerCase() || '';
  return err.code === '23514' || msg.includes('max_players');
}

async function requireTeamHead(ctx: ManagedTeamContext) {
  const { team, error } = await readTeamHead(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error || !team) throw fail(404, 'Team introuvable.');
  return team;
}

/* ------------------------------------------------------------------------
 * PATCH /api/teams/update-member-role
 * ---------------------------------------------------------------------- */

// Rôles acceptés : une valeur inconnue est REJETÉE (400) plutôt que corrigée
// vers 'player' — une faute de frappe ne rétrograde pas un membre.
const ALLOWED_ROLES: ReadonlySet<string> = new Set(TEAM_ROLE_VALUES);

export async function updateMemberRole(
  ctx: ManagedTeamContext,
  body: UpdateMemberRoleInput
) {
  const { db, tenantId } = ctx;
  const team = await requireTeamHead(ctx);
  const { memberId, role } = body;

  const newRole = role.trim().toLowerCase();
  if (!ALLOWED_ROLES.has(newRole)) {
    throw fail(
      400,
      'role invalide. Attendu : player | coach | substitute | manager.'
    );
  }

  const teamRoles = await loadTeamRolesFromSupabase(db, tenantId);

  // ACCORDER un rôle privilégié suit `manage_roster` (décision du
  // 2026-08-20 : une équipe créée par un manager n'a pas encore de
  // capitaine). DÉGRADER un pair privilégié reste réservé à la capitaine.
  // `captain` n'est pas accordable ici : il passe par transfer-captain.
  const { member, error } = await readRosterMember(
    db,
    tenantId,
    team.id,
    memberId
  );
  if (error || !member) throw fail(404, MEMBER_NOT_FOUND);

  if (member.user_id === ctx.subject.userId) throw fail(400, OWN_ROLE);
  if (member.user_id === team.captain_id && !ctx.team.isCaptain) {
    throw fail(403, CAPTAIN_ROW_ONLY);
  }
  if (roleHasAnyPermission(teamRoles, member.role) && !ctx.team.isCaptain) {
    throw fail(403, PRIVILEGED_ROLE_ONLY);
  }

  const isSubstitute = newRole === 'substitute';
  const { error: updateErr } = await updateRosterMember(
    db,
    tenantId,
    team.id,
    memberId,
    { role: newRole, is_substitute: isSubstitute }
  );
  if (updateErr) {
    ctx.logger.error('[update-member-role] error:', updateErr);
    if (isMaxPlayersViolation(updateErr)) {
      throw fail(
        400,
        "L'equipe a atteint la limite de joueur(s) imposee par un tournoi : impossible de basculer ce coach en role joueur."
      );
    }
    throw fail(500, 'Echec de la mise a jour du role.');
  }

  return {
    success: true,
    memberId,
    newRole,
    isSubstitute,
    message: `Role mis a jour vers "${newRole}".`,
  };
}

/* ------------------------------------------------------------------------
 * PATCH /api/teams/update-member-specialty — cosmétique, pas d'anti-escalade
 * ---------------------------------------------------------------------- */

export async function updateMemberSpecialty(
  ctx: ManagedTeamContext,
  body: UpdateMemberSpecialtyInput
) {
  const { db, tenantId } = ctx;
  const team = await requireTeamHead(ctx);
  const { memberId, specialty: raw } = body;

  // Valeur de l'enum ou null (effacer) ; le reste est rejeté, pas corrigé.
  let specialty: string | null;
  if (raw === null || raw === undefined) {
    specialty = null;
  } else if (ALLOWED_SPECIALTIES.has(raw.trim().toLowerCase())) {
    specialty = validateSpecialty(raw);
  } else {
    throw fail(
      400,
      'specialty invalide. Attendu : tank | dps | support | flex | null.'
    );
  }

  const { member, error } = await readRosterMember(
    db,
    tenantId,
    team.id,
    memberId
  );
  if (error || !member) throw fail(404, MEMBER_NOT_FOUND);
  if (member.user_id === team.captain_id && !ctx.team.isCaptain) {
    throw fail(403, CAPTAIN_ROW_ONLY);
  }

  const { error: updateErr } = await updateRosterMember(
    db,
    tenantId,
    team.id,
    memberId,
    { specialty }
  );
  if (updateErr) {
    ctx.logger.error('[update-member-specialty] error:', updateErr);
    throw fail(500, 'Echec de la mise a jour de la specialite.');
  }

  return {
    success: true,
    memberId,
    specialty,
    message: specialty
      ? `Specialite mise a jour vers "${specialty}".`
      : 'Specialite effacee.',
  };
}

/* ------------------------------------------------------------------------
 * PATCH /api/teams/update-member — BattleTag, SR, rôle / remplaçante
 * ---------------------------------------------------------------------- */

type MemberFieldsResult = {
  patch: Record<string, unknown>;
  battleTag: { changed: boolean; next: string | null };
  skillRating: { changed: boolean; next: number | null };
  role: string | null;
  isSubstitute: boolean;
  substituteChanged: boolean;
};

/** Champs PRÉSENTS validés contre le membre visé (règles et messages historiques). */
async function resolveMemberFields(
  ctx: ManagedTeamContext,
  body: UpdateMemberInput,
  member: {
    user_id: string;
    role: string;
    battle_tag: string | null;
    is_substitute: boolean;
    skill_rating: number | null;
  }
): Promise<MemberFieldsResult> {
  const hasRole = 'role' in body && body.role != null;
  const hasBattleTag = 'battle_tag' in body;
  const hasIsSubstitute = 'is_substitute' in body && body.is_substitute != null;
  const hasSkillRating = 'skill_rating' in body;
  const patch: Record<string, unknown> = {};

  // BattleTag : le vider n'est légitime que pour l'encadrement, y compris
  // quand le rôle change au même appel.
  let newBattleTag: string | null = member.battle_tag;
  let battleTagChanged = false;
  if (hasBattleTag) {
    const raw = body.battle_tag;
    const prospectiveRole =
      hasRole && typeof body.role === 'string' ? body.role : member.role;
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
      if (roleRequiresBattleTag(prospectiveRole)) {
        throw fail(400, BATTLE_TAG_FORMAT_HINT);
      }
      newBattleTag = null;
    } else {
      try {
        newBattleTag = validateBattleTag(String(raw));
      } catch {
        throw fail(400, BATTLE_TAG_FORMAT_HINT);
      }
    }
    if (newBattleTag !== member.battle_tag) {
      patch.battle_tag = newBattleTag;
      battleTagChanged = true;
    }
  }

  // SR déclaré : `null` / `''` effacent, l'absence de clé ne touche à rien.
  let newSkillRating: number | null = member.skill_rating ?? null;
  let skillRatingChanged = false;
  if (hasSkillRating) {
    const raw = body.skill_rating;
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
      newSkillRating = null;
    } else {
      const parsed = typeof raw === 'string' ? Number(raw.trim()) : raw;
      if (!isValidSkillRating(parsed)) {
        throw fail(
          400,
          `Le SR doit etre un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}.`,
          'SKILL_RATING_INVALID'
        );
      }
      newSkillRating = parsed;
    }
    if (newSkillRating !== (member.skill_rating ?? null)) {
      patch.skill_rating = newSkillRating;
      skillRatingChanged = true;
    }
  }

  let newRole: string | null = member.role;
  let newIsSubstitute: boolean = member.is_substitute ?? false;
  if (hasRole) {
    if (typeof body.role !== 'string') throw fail(400, 'role invalide.');
    newRole = validateRole(body.role);
    const teamRoles = await loadTeamRolesFromSupabase(ctx.db, ctx.tenantId);
    // Même règle que update-member-role : dégrader un pair privilégié est
    // réservé à la capitaine.
    if (roleHasAnyPermission(teamRoles, member.role) && !ctx.team.isCaptain) {
      throw fail(403, PRIVILEGED_ROLE_ONLY);
    }
    if (member.user_id === ctx.subject.userId && newRole !== member.role) {
      throw fail(400, OWN_ROLE);
    }
    patch.role = newRole;
    newIsSubstitute = newRole === 'substitute';
    patch.is_substitute = newIsSubstitute;
  }

  // `is_substitute` n'est pas un état parallèle au rôle : le drapeau PILOTE
  // le rôle (contrainte `chk_team_members_substitute_matches_role`).
  let substituteChanged = false;
  if (hasIsSubstitute) {
    const desired = body.is_substitute === true;
    if (hasRole && desired !== (newRole === 'substitute')) {
      throw fail(
        400,
        'role et is_substitute se contredisent : « remplaçante » EST le rôle `substitute`, pas un drapeau à part.'
      );
    }
    if (desired && isNonPlayingTeamRole(newRole)) {
      throw fail(
        400,
        "Un rôle d'encadrement ne peut pas être marqué remplaçant — change d'abord son rôle."
      );
    }
    const targetRole = desired ? 'substitute' : 'player';
    if (targetRole !== member.role) {
      newRole = targetRole;
      newIsSubstitute = desired;
      patch.role = targetRole;
      patch.is_substitute = desired;
      substituteChanged = true;
    }
  } else if (hasRole && newIsSubstitute !== (member.is_substitute ?? false)) {
    substituteChanged = true;
  }

  return {
    patch,
    battleTag: { changed: battleTagChanged, next: newBattleTag },
    skillRating: { changed: skillRatingChanged, next: newSkillRating },
    role: newRole,
    isSubstitute: newIsSubstitute,
    substituteChanged,
  };
}

export async function updateMember(
  ctx: ManagedTeamContext,
  body: UpdateMemberInput
) {
  const { db, tenantId } = ctx;
  const teamId = ctx.team.teamId;
  const { memberId } = body;

  const hasAny =
    ('role' in body && body.role != null) ||
    'battle_tag' in body ||
    ('is_substitute' in body && body.is_substitute != null) ||
    'skill_rating' in body;
  if (!hasAny) {
    throw fail(
      400,
      'Aucun champ a mettre a jour (role/battle_tag/is_substitute/skill_rating).'
    );
  }

  const { member, error } = await readRosterMember(
    db,
    tenantId,
    teamId,
    memberId
  );
  if (error || !member) throw fail(404, MEMBER_NOT_FOUND);

  const r = await resolveMemberFields(ctx, body, member);
  const view = {
    success: true,
    memberId,
    battle_tag: r.battleTag.next,
    is_substitute: r.isSubstitute,
    role: r.role,
    skill_rating: r.skillRating.next,
  };
  if (Object.keys(r.patch).length === 0) {
    return { ...view, message: 'Aucune modification.' };
  }

  const { error: updateErr } = await updateRosterMember(
    db,
    tenantId,
    teamId,
    memberId,
    r.patch
  );
  if (updateErr) {
    ctx.logger.error('[update-member] error:', updateErr);
    if (isMaxPlayersViolation(updateErr)) {
      throw fail(
        400,
        "L'equipe a atteint la limite de joueur(s) imposee par un tournoi : modification refusee."
      );
    }
    throw fail(500, 'Echec de la mise a jour du membre.');
  }

  // Journal sur la row staff de l'APPELANT (`callerId`) : en act-as, le
  // sujet n'en a pas, et on perdrait la trace de qui a agi.
  const staff = await getStaffByUserId(ctx.subject.callerId);
  if (staff?.id) {
    const base = {
      staff_id: staff.id,
      entity_type: 'team_member',
      entity_id: memberId,
      tenant_id: tenantId,
    };
    if (r.battleTag.changed) {
      await logStaffAction({
        ...base,
        action: 'update_player_battle_tag',
        payload: {
          team_id: teamId,
          previous: member.battle_tag,
          next: r.battleTag.next,
        },
      });
    }
    if (r.skillRating.changed) {
      await logStaffAction({
        ...base,
        action: 'update_player_skill_rating',
        payload: {
          team_id: teamId,
          previous: member.skill_rating ?? null,
          next: r.skillRating.next,
        },
      });
    }
    if (r.substituteChanged) {
      await logStaffAction({
        ...base,
        action: 'manage_substitute',
        payload: { team_id: teamId, is_substitute: r.isSubstitute },
      });
    }
  }

  return { ...view, message: 'Membre mis a jour.' };
}

/* ------------------------------------------------------------------------
 * DELETE /api/teams/{teamId}/members
 * ---------------------------------------------------------------------- */

/**
 * Retrait d'un membre de l'équipe du CHEMIN. Pas de `team: { permission }` :
 * l'ordre historique des refus (400 identifiant, 404 équipe du tenant, puis
 * 403) précède la résolution de l'accès — même garde (`getManagedTeam` +
 * `assertTeamPermission`), appelée ici.
 */
export async function removeMember(
  ctx: TeamSubjectContext,
  rawTeamId: unknown,
  body: RemoveTeamMemberInput
) {
  const { db, tenantId } = ctx;
  const teamId = Array.isArray(rawTeamId) ? undefined : rawTeamId;
  if (typeof teamId !== 'string' || !isValidUUID(teamId)) {
    throw fail(400, 'Invalid teamId');
  }
  const { team } = await readTeamHead(db, tenantId, teamId);
  if (!team) throw fail(404, 'Équipe introuvable.');

  const access = await getManagedTeam(ctx.subject.userId, tenantId, teamId);
  if (!access || access.teamId !== teamId) {
    throw fail(403, TEAM_MANAGEMENT_FORBIDDEN);
  }
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) throw fail(denied.status, denied.error);

  const { member, error } = await readRosterMember(
    db,
    tenantId,
    teamId,
    body.memberId
  );
  if (error || !member) {
    throw fail(404, 'Membre introuvable dans cette équipe.');
  }
  // La capitaine ne quitte le roster qu'après transfert (capitanat voulu).
  if (member.user_id === team.captain_id) {
    throw fail(
      400,
      "Le capitaine ne peut pas être retiré. Transfère le capitanat d'abord."
    );
  }
  const teamRoles = await loadTeamRolesFromSupabase(db, tenantId);
  if (roleHasAnyPermission(teamRoles, member.role) && !access.isCaptain) {
    throw fail(
      403,
      'Seul le capitaine peut retirer un autre membre privilégié.'
    );
  }
  if (member.user_id === ctx.subject.userId) {
    throw fail(400, "Utilise le bouton 'Quitter l'équipe' pour partir.");
  }

  const { error: deleteErr } = await deleteRosterMember(
    db,
    tenantId,
    teamId,
    body.memberId
  );
  if (deleteErr) {
    ctx.logger.error('[teams/[teamId]/members] delete error:', deleteErr);
    throw fail(500, 'Échec de la suppression du membre.');
  }
  return { success: true, info: "Membre retiré de l'équipe." };
}
