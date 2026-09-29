// features/player/onboarding/service/seating.ts — étape 5 : l'équipe naît,
// la créatrice (ou le manager) y siège, le reste du roster est INVITÉ.
//
// Modèle invite-accept (« existence ≠ consentement ») : seule la personne qui
// crée est insérée ; chaque autre membre reçoit une invitation pending (lien
// privé par e-mail). Une invitation qui échoue ne fait pas échouer l'équipe ;
// un siège direct qui échoue la fait retirer (retour arrière).

import { sendTeamInviteLinkEmail } from '@/utils/email';
import { createInvitation } from '@/utils/teams/invitations';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from '@/utils/teams/inviteLinks';
import type { CreatedMember, InvitedMember } from '../schemas';
import {
  deleteTeamAndMembers,
  insertTeam,
  insertTeamMember,
  setTeamCaptain,
  type CreatedTeamRow,
} from '../repository/teamCreation';
import { createTeamError, type OnboardingCtx } from './context';
import type { ResolvedAccounts } from './accounts';

const isDuplicate = (message: string | undefined) => {
  const m = message?.toLowerCase() || '';
  return m.includes('duplicate') || m.includes('unique');
};

export async function createTeamRow(
  ctx: OnboardingCtx,
  row: Record<string, unknown>
): Promise<CreatedTeamRow> {
  const { team, error } = await insertTeam(ctx.db, {
    ...row,
    tenant_id: ctx.tenantId,
  });
  if (error || !team) {
    ctx.logger.error('[/api/teams/create-with-member] create error:', error);
    if (isDuplicate(error?.message)) {
      throw createTeamError(
        409,
        'SLUG_CONFLICT',
        'Une équipe avec ce nom existe déjà. Choisis un autre nom.'
      );
    }
    throw createTeamError(
      500,
      'SERVER_ERROR',
      error?.message || 'Failed to create team. Try again with another name.'
    );
  }
  return team;
}

/**
 * Retire une équipe orpheline (roster + équipe). Un retrait qui échoue est
 * journalisé NEEDS_REVIEW : un admin doit pouvoir la retrouver.
 */
async function rollback(ctx: OnboardingCtx, teamId: string, reason: string) {
  const { membersError, teamError } = await deleteTeamAndMembers(
    ctx.db,
    teamId
  );
  if (membersError || teamError) {
    ctx.logger.error(
      '[create-with-member] NEEDS_REVIEW orphan-team cleanup failed',
      {
        teamId,
        reason,
        delMembersErr: membersError?.message ?? null,
        delTeamErr: teamError?.message ?? null,
      }
    );
  }
}

export type Seating = {
  inserted: CreatedMember[];
  invited: InvitedMember[];
};

export async function seatRoster(
  ctx: OnboardingCtx,
  team: CreatedTeamRow,
  accounts: ResolvedAccounts
): Promise<Seating> {
  const { records, managerUserId, creatorUserId } = accounts;
  const inserted: CreatedMember[] = [];
  const invited: InvitedMember[] = [];

  // Mode manager : il ne joue pas, il siège avec le rôle `manager` (rôle à
  // permissions, utils/teamRoles.ts) et invite tout le roster.
  if (managerUserId) {
    const { memberId, error } = await insertTeamMember(ctx.db, {
      team_id: team.id,
      user_id: managerUserId,
      role: 'manager',
      battle_tag: null,
      specialty: null,
      tenant_id: ctx.tenantId,
    });
    if (error) {
      ctx.logger.error(
        '[/api/teams/create-with-member] manager insert error:',
        error
      );
      await rollback(ctx, team.id, 'manager-insert-failed');
      // Un manager peut encadrer plusieurs équipes (index partiel) : une
      // 23505 ici veut dire « déjà dans CELLE-CI ».
      throw createTeamError(
        400,
        'MEMBER_INSERT_FAILED',
        isDuplicate(error.message)
          ? 'Ce manager est déjà membre de cette équipe.'
          : "Le manager n'a pas pu être ajouté. L'équipe n'a pas été enregistrée."
      );
    }
    inserted.push({
      id: memberId,
      user_id: managerUserId,
      role: 'manager',
      captain: false,
      battle_tag: null,
      specialty: null,
    });
  }

  for (const m of records) {
    const isCreator = creatorUserId !== null && m.user_id === creatorUserId;
    const summary = {
      user_id: m.user_id,
      role: m.role,
      battle_tag: m.battle_tag,
      specialty: m.specialty,
    };

    if (!isCreator) {
      if (creatorUserId === null) {
        invited.push({
          invitation_id: null,
          ...summary,
          skipped_reason: 'no_captain_to_invite',
        });
        continue;
      }
      // Lien privé : sans lui, l'invitation n'existe que derrière une
      // session que l'invitée n'a pas encore.
      const inviteToken = m.email ? generateInviteToken() : null;
      const asCaptain = Boolean(managerUserId && m.captain);
      const result = await createInvitation(ctx.tenantId, {
        teamId: team.id,
        inviteeAuthUserId: m.user_id,
        captainAuthUserId: creatorUserId,
        role: m.role,
        battleTag: m.battle_tag,
        specialty: m.specialty,
        // Mode manager : le capitanat est donné à l'acceptation.
        setCaptain: asCaptain,
        inviteTokenHash: inviteToken ? hashInviteToken(inviteToken) : null,
        inviteEmail: m.email,
        source: 'website',
      });
      if (result.ok) {
        // Best-effort : un échec d'envoi ne défait ni l'équipe ni l'invitation.
        if (inviteToken && m.email) {
          sendTeamInviteLinkEmail({
            tenantId: ctx.tenantId,
            to: m.email,
            teamName: team.name,
            role: m.role,
            asCaptain,
            inviteUrl: buildInviteUrl(inviteToken),
          }).catch((err) => {
            ctx.logger.error(
              '[/api/teams/create-with-member] invite email error:',
              err
            );
          });
        }
        invited.push({ invitation_id: result.data.id, ...summary });
      } else {
        ctx.logger.error(
          '[/api/teams/create-with-member] invite error (skipped):',
          result.error
        );
        invited.push({
          invitation_id: null,
          ...summary,
          skipped_reason: result.error,
        });
      }
      continue;
    }

    // La créatrice (capitaine) siège directement.
    const { memberId, error } = await insertTeamMember(ctx.db, {
      team_id: team.id,
      user_id: m.user_id,
      role: m.role,
      battle_tag: m.battle_tag,
      specialty: m.specialty,
      tenant_id: ctx.tenantId,
    });
    if (error) {
      ctx.logger.error(
        '[/api/teams/create-with-member] add-member error:',
        error
      );
      await rollback(ctx, team.id, 'member-insert-failed');
      throw createTeamError(
        400,
        'MEMBER_INSERT_FAILED',
        isDuplicate(error.message)
          ? 'One of the users already belongs to this team'
          : 'Member(s) could not be added. The team was not saved.'
      );
    }
    inserted.push({ id: memberId, ...summary, captain: m.captain });
  }

  return { inserted, invited };
}

/**
 * Capitanat : posé tout de suite dans le flux historique ; en mode manager,
 * `captain_id` reste NULL jusqu'à l'acceptation de la capitaine désignée.
 */
export async function assignCaptain(
  ctx: OnboardingCtx,
  teamId: string,
  accounts: ResolvedAccounts
): Promise<void> {
  if (!accounts.captainUserId || accounts.managerUserId) return;
  const { error } = await setTeamCaptain(
    ctx.db,
    teamId,
    accounts.captainUserId
  );
  if (!error) return;
  ctx.logger.error(
    '[/api/teams/create-with-member] captain update error:',
    error
  );
  // Sans capitaine, l'équipe est inutilisable (pas de droits de gestion).
  await rollback(ctx, teamId, 'captain-update-failed');
  throw createTeamError(
    500,
    'SERVER_ERROR',
    error.message || 'Failed to assign team captain. Team rolled back.'
  );
}
