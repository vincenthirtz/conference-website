// features/player/demandes/service/join.ts — demande pour REJOINDRE une
// équipe (sans en être capitaine). Déplacé de pages/api/demandes/join (lot
// P11) : mêmes règles, mêmes messages, même payload.

import { LegacyAdminError } from '@/utils/admin/errors';
import { findExclusiveMembership } from '@/utils/teams/memberships';
import {
  BATTLE_TAG_REGEX,
  roleRequiresBattleTag,
} from '@/utils/teams/roleKind';
import { notifyJoinRequest } from '@/utils/joinRequestNotify';
import {
  findPendingDemande,
  insertDemande,
  listMyDemandes,
} from '../repository/demandes';
import { readTeam } from '../repository/teams';
import type { JoinDemandeInput } from '../schemas';
import {
  displayNameOf,
  messageOf,
  normalizeDesiredRole,
  type DemandesCtx,
} from './context';

export async function listJoinDemandes(ctx: DemandesCtx) {
  const { demandes, error } = await listMyDemandes(
    ctx.db,
    ctx.tenantId,
    ctx.userId,
    'join',
    { withTeam: true }
  );
  if (error) {
    ctx.logger.error('[demandes/join] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load requests.');
  }
  return { demandes };
}

export async function submitJoinDemande(
  ctx: DemandesCtx,
  body: JoinDemandeInput
) {
  const { db, tenantId, userId, user } = ctx;
  const teamId = body.teamId;
  const message = messageOf(body.message);

  const { team, error: teamErr } = await readTeam(
    db,
    tenantId,
    teamId,
    'id, name, is_joinable',
    { activeOnly: true }
  );
  if (teamErr || !team) {
    throw new LegacyAdminError(400, "L'equipe selectionnee n'existe pas.");
  }
  if (!team.is_joinable) {
    throw new LegacyAdminError(
      400,
      "Cette equipe n'accepte pas les demandes pour le moment."
    );
  }

  // « Membre » au sens de la base : un siège de MANAGER ne compte pas —
  // l'index unique partiel l'autorise à rejoindre une équipe comme joueuse.
  if (await findExclusiveMembership(userId, tenantId)) {
    throw new LegacyAdminError(
      400,
      "Tu es deja membre d'une equipe. Quitte-la d'abord pour en rejoindre une autre."
    );
  }

  const { pending, error: existingErr } = await findPendingDemande(
    db,
    tenantId,
    { userId, types: ['join'] }
  );
  if (existingErr) {
    ctx.logger.error('[demandes/join] check existing error:', existingErr);
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (pending) {
    throw new LegacyAdminError(
      400,
      pending.team_id === teamId
        ? 'Tu as deja une demande en attente pour cette equipe.'
        : "Tu as deja une demande en attente pour une autre equipe. Annule-la d'abord.",
      { extra: { existingDemandeId: pending.id } }
    );
  }

  const desiredRole = normalizeDesiredRole(body.desiredRole);

  // BattleTag : sans lui, la ligne de roster créée à l'approbation naît vide
  // (payload.user_battle_tag → team_members.battle_tag). Rejoindre un roster
  // est le dernier moment où on peut l'exiger — même règle que le lien
  // d'auto-inscription (api/teams/invite-links/by-token.ts).
  const metaBattleTag =
    (typeof user.user_metadata?.battle_tag === 'string'
      ? user.user_metadata.battle_tag
      : ''
    ).trim() || null;
  const submittedBattleTag = (body.battleTag ?? '').trim() || null;
  const battleTag = submittedBattleTag || metaBattleTag;

  if (battleTag && !BATTLE_TAG_REGEX.test(battleTag)) {
    throw new LegacyAdminError(
      400,
      'Format BattleTag invalide (ex: Pseudo#1234).',
      { code: 'BATTLE_TAG_INVALID' }
    );
  }
  if (!battleTag && roleRequiresBattleTag(desiredRole)) {
    throw new LegacyAdminError(
      400,
      'Ton BattleTag est necessaire pour rejoindre un roster.',
      { code: 'BATTLE_TAG_REQUIRED' }
    );
  }

  const payload: Record<string, unknown> = {
    user_email: user.email,
    user_display_name: displayNameOf(user),
    user_battle_tag: battleTag,
    team_name: team.name,
    desired_role: desiredRole,
  };

  const { demande, error: insertErr } = await insertDemande(db, tenantId, {
    user_id: userId,
    team_id: teamId,
    type: 'join',
    comment: message,
    payload,
  });
  if (insertErr) {
    ctx.logger.error('[demandes/join] insert error:', insertErr);
    throw new LegacyAdminError(500, 'Failed to create request.');
  }

  // Prévenir la capitaine — fire-and-forget APRÈS l'insert : une
  // notification qui échoue ne change jamais la réponse 201.
  void notifyJoinRequest({
    tenantId,
    teamId,
    playerName: (payload.user_display_name as string | null) ?? null,
    battleTag,
    desiredRole,
    message,
  }).catch((e) => {
    ctx.logger.error('[demandes/join] notify error:', e);
  });

  // Le tag donné ici devient celui du profil. Best effort.
  if (battleTag && battleTag !== metaBattleTag) {
    const { error: metaErr } = await db.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), battle_tag: battleTag },
    });
    if (metaErr) {
      ctx.logger.warn('[demandes/join] battle_tag metadata update:', metaErr);
    }
  }

  return {
    success: true,
    demande,
    message: `Ta demande pour rejoindre "${team.name}" a ete envoyee. Le capitaine de l'equipe la validera.`,
  };
}
