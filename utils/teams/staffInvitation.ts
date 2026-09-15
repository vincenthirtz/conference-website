// utils/teams/staffInvitation.ts
//
// Ajout d'un membre par le STAFF : invitation par défaut, ajout direct sur motif.
//
// Les deux routes staff (`/api/admin/teams/add-member` et
// `/api/admin/teams/[teamId]/members`) inséraient directement le compte au
// roster, sans l'accord de la personne. Elles créent désormais une invitation
// en attente (le même objet que celle d'une capitaine : `demandes`
// type='invite'), que la personne accepte ou refuse depuis son espace, le lien
// privé reçu par email, ou le bot (`/actions`). C'est l'acceptation qui pose
// `team_members.accepted_at` (RPC accept_invitation).
//
// L'ajout direct reste possible pour les corrections légitimes (roster
// d'inscription à régulariser, personne sans accès à ses emails…) : il exige un
// MOTIF, journalisé, et la personne est prévenue quand même. Il laisse
// `accepted_at` à NULL, donc aucun rattachement TCG à l'espace (cf.
// utils/tcg/tenantAttachment.ts).
//
// Un membre du staff qui s'ajoute LUI-MÊME consent par définition : ajout
// direct, sans motif, avec `accepted_at`.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { sendTeamInviteLinkEmail } from '../email';
import { createInvitation } from './invitations';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from './inviteLinks';

export {
  parseStaffAddMode,
  STAFF_DIRECT_ADD_REASON_MAX,
  STAFF_DIRECT_ADD_REASON_MIN,
  type ParsedStaffAddMode,
  type StaffAddMode,
} from './staffAddMode';

/** Email du compte : celui saisi s'il y en a un, sinon celui du compte auth. */
export async function resolveMemberEmail(
  userId: string,
  typedEmail: unknown
): Promise<string | null> {
  if (typeof typedEmail === 'string' && typedEmail.includes('@')) {
    return typedEmail.trim().toLowerCase();
  }
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data?.user?.email?.toLowerCase() ?? null;
  } catch (err) {
    logger.error('[staffInvitation] email lookup failed', err);
    return null;
  }
}

export type StaffInviteInput = {
  tenantId: string;
  teamId: string;
  teamName: string;
  /** L'équipe a-t-elle déjà une capitaine ? (garde `setCaptain`). */
  teamHasCaptain: boolean;
  staffUserId: string;
  inviteeUserId: string;
  inviteeEmail: string | null;
  role: string;
  isSubstitute: boolean;
  battleTag: string | null;
  setCaptain: boolean;
};

export type StaffInviteResult =
  | {
      ok: true;
      invitationId: string;
      /** Rôle tel qu'il sera posé à l'acceptation. */
      desiredRole: string;
      expiresAt: string | null;
      /** Lien privé, rendu UNE fois (stocké hashé seulement). */
      inviteUrl: string;
      emailSent: boolean;
    }
  | { ok: false; status: number; error: string; code: string };

export async function createStaffInvitation(
  input: StaffInviteInput
): Promise<StaffInviteResult> {
  // Le capitanat d'une invitation ne s'applique qu'à une équipe SANS capitaine
  // (acceptInvitation ne vole jamais le rôle). Plutôt que d'envoyer une
  // invitation qui promet un capitanat qu'elle ne donnera pas, on refuse.
  if (input.setCaptain && input.teamHasCaptain) {
    return {
      ok: false,
      status: 409,
      error:
        "Cette équipe a déjà une capitaine : une invitation ne peut pas la remplacer. Invite sans capitanat, ou utilise l'ajout direct avec un motif.",
      code: 'CAPTAIN_ALREADY_SET',
    };
  }
  if (input.setCaptain && input.role === 'coach') {
    return {
      ok: false,
      status: 400,
      error: 'Un coach ne peut pas être capitaine.',
      code: 'CAPTAIN_ROLE_INVALID',
    };
  }

  // Le formulaire staff porte « remplaçante » en case à cocher ; l'invitation,
  // elle, le porte dans le rôle (accept_invitation en déduit is_substitute).
  const desiredRole =
    input.isSubstitute && input.role === 'player' ? 'substitute' : input.role;

  const token = generateInviteToken();
  const invite = await createInvitation(input.tenantId, {
    teamId: input.teamId,
    captainAuthUserId: input.staffUserId,
    inviteeAuthUserId: input.inviteeUserId,
    role: desiredRole,
    battleTag: input.battleTag,
    setCaptain: input.setCaptain,
    inviteTokenHash: hashInviteToken(token),
    inviteEmail: input.inviteeEmail,
    source: 'staff',
  });
  if (!invite.ok) {
    return {
      ok: false,
      status: invite.status,
      error: invite.error,
      code: 'INVITE_FAILED',
    };
  }

  const inviteUrl = buildInviteUrl(token);
  let emailSent = false;
  if (input.inviteeEmail) {
    try {
      const sent = await sendTeamInviteLinkEmail({
        tenantId: input.tenantId,
        to: input.inviteeEmail,
        teamName: input.teamName,
        role: desiredRole,
        asCaptain: input.setCaptain,
        inviteUrl,
      });
      emailSent = !!sent?.success;
    } catch (err) {
      logger.error('[staffInvitation] invite email failed', err);
    }
  }

  return {
    ok: true,
    invitationId: invite.data.id,
    desiredRole,
    expiresAt: invite.data.payload?.expires_at ?? null,
    inviteUrl,
    emailSent,
  };
}
