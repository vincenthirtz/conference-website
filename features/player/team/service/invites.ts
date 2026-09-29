// features/player/team/service/invites.ts — recrutement par l'équipe gérée
// (lot P10, même contrat) :
//   * invitations nominatives par e-mail (`/api/teams/invitations`,
//     `/api/teams/invitations/{id}`) — lister, créer, relancer, annuler ;
//   * lien d'équipe (`/api/teams/invite-links`) — lire, (re)générer, révoquer.
// `manage_roster` est exigé par la route (`team: { permission }`, refus au
// code historique `FORBIDDEN`). L'acceptation par jeton est hors de ce module
// (P11 : /invitation/[token], /rejoindre/[token]).
//
// Anti-escalade : seul la capitaine confie un rôle À PRIVILÈGES, par
// invitation comme par lien — un manager ne s'auto-clone pas. Une manager
// désigne la capitaine seulement tant que l'équipe n'en a pas (sinon c'est un
// transfert, réservé à la capitaine en poste) : capitanat voulu, S4.
//
// Le lien privé n'authentifie pas (cf. utils/teams/inviteLinks.ts) ; le
// jeton en clair n'est rendu QU'UNE fois, à l'émettrice.

import { findOrCreateUserByEmail } from '@/utils/find-or-create-user';
import { sendTeamInviteLinkEmail } from '@/utils/email';
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
} from '@/utils/teamRoles';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import {
  createInvitation,
  listPendingInvitationsForTeam,
  refreshInvitationToken,
} from '@/utils/teams/invitations';
import {
  buildInviteUrl,
  buildJoinUrl,
  generateInviteToken,
  hashInviteToken,
  joinLinkExpiryFromNow,
  readJoinLinkState,
  JOIN_LINK_DEFAULT_TTL_DAYS,
} from '@/utils/teams/inviteLinks';
import {
  cancelPendingInvitation,
  insertInviteLink,
  readActiveInviteLink,
  revokeActiveInviteLinks,
  type ManagedInviteLinkRow,
} from '../repository/invites';
import { readTeamHead } from '../repository/roster';
import { InviteByEmailBody, InviteLinkBody } from '../inviteSchemas';
import { fail, type ManagedTeamContext } from './context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertRosterOpen(ctx: ManagedTeamContext, teamId: string) {
  const lock = await isTeamRosterLocked(ctx.tenantId, teamId);
  if (lock.locked) {
    throw fail(409, rosterLockErrorMessage(lock), 'ROSTER_LOCKED');
  }
}

async function isPrivilegedRole(ctx: ManagedTeamContext, role: string) {
  const roles = await loadTeamRolesFromSupabase(ctx.db, ctx.tenantId);
  return roleHasAnyPermission(roles, role);
}

/** Invitations EN ATTENTE de l'équipe (lecture de la file, pas de relance). */
async function pendingInvitations(ctx: ManagedTeamContext) {
  const listed = await listPendingInvitationsForTeam(
    ctx.tenantId,
    ctx.team.teamId
  );
  if (!listed.ok) throw fail(listed.status, listed.error, 'LIST_FAILED');
  return listed.data;
}

/* ------------------------------------------------------------------------
 * Invitations nominatives
 * ---------------------------------------------------------------------- */

/**
 * GET — le jeton n'est jamais renvoyé (stocké haché) ; `has_invite_link` dit
 * seulement si une relance par lien est possible.
 */
export async function listSentInvitations(ctx: ManagedTeamContext) {
  const rows = await pendingInvitations(ctx);
  return {
    invitations: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      email: row.payload?.invite_email ?? null,
      role: row.payload?.desired_role ?? null,
      battle_tag: row.payload?.battle_tag ?? null,
      specialty: row.payload?.specialty ?? null,
      set_captain: row.payload?.set_captain ?? false,
      created_at: row.created_at,
      expires_at: row.payload?.expires_at ?? null,
      expired: row.expired,
      has_invite_link: Boolean(row.payload?.invite_token_hash),
      source: row.source,
    })),
  };
}

/** Envoi best-effort : le lien est de toute façon rendu à l'émettrice. */
async function sendInviteEmail(
  ctx: ManagedTeamContext,
  args: Parameters<typeof sendTeamInviteLinkEmail>[0],
  logTag: string
) {
  try {
    const sent = await sendTeamInviteLinkEmail(args);
    return !!sent?.success;
  } catch (err) {
    ctx.logger.error(logTag, err);
    return false;
  }
}

/** POST — invitation PENDING au nom de la capitaine (sujet), compte créé au besoin. */
export async function inviteByEmail(ctx: ManagedTeamContext, rawBody: unknown) {
  const parsed = InviteByEmailBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw fail(
      400,
      'Requête invalide : email valide et rôle connu attendus.',
      'INVALID_BODY'
    );
  }
  const body = parsed.data;
  const { tenantId } = ctx;
  const userId = ctx.subject.userId;

  const { team } = await readTeamHead(ctx.db, tenantId, ctx.team.teamId);
  if (!team) throw fail(404, 'Équipe introuvable.', 'TEAM_NOT_FOUND');
  // Roster verrouillé : l'acceptation échouerait de toute façon.
  await assertRosterOpen(ctx, team.id);

  if ((await isPrivilegedRole(ctx, body.role)) && !ctx.team.isCaptain) {
    throw fail(
      403,
      "Seule la capitaine peut confier un rôle de gestion (manager) à quelqu'un.",
      'ROLE_ESCALATION'
    );
  }
  if (body.set_captain) {
    if (team.captain_id) {
      throw fail(
        409,
        'Cette équipe a déjà une capitaine. Seule la capitaine peut transmettre son rôle.',
        'CAPTAIN_ALREADY_SET'
      );
    }
    // Invariant partagé avec les RPC transfer_captain / designate_captain.
    if (body.role === 'coach') {
      throw fail(
        400,
        'Un coach ne peut pas être capitaine.',
        'CAPTAIN_ROLE_INVALID'
      );
    }
  }

  let inviteeUserId: string;
  try {
    inviteeUserId = (await findOrCreateUserByEmail(body.email, body.role))
      .userId;
  } catch (err) {
    ctx.logger.error('[teams/invitations] user resolution failed', err);
    throw fail(
      500,
      'Impossible de résoudre le compte associé à cet email.',
      'SERVER_ERROR'
    );
  }
  if (inviteeUserId === userId) {
    throw fail(400, 'Tu ne peux pas t’inviter toi-même.', 'SELF_INVITE');
  }

  const token = generateInviteToken();
  const invite = await createInvitation(tenantId, {
    teamId: team.id,
    captainAuthUserId: userId,
    inviteeAuthUserId: inviteeUserId,
    role: body.role,
    battleTag: body.battle_tag ?? null,
    specialty: body.specialty ?? null,
    setCaptain: body.set_captain,
    inviteTokenHash: hashInviteToken(token),
    inviteEmail: body.email,
    comment: body.comment ?? null,
    source: 'website',
  });
  if (!invite.ok) throw fail(invite.status, invite.error, 'INVITE_FAILED');

  const inviteUrl = buildInviteUrl(token);
  const emailSent = await sendInviteEmail(
    ctx,
    {
      tenantId,
      to: body.email,
      teamName: team.name,
      role: body.role,
      asCaptain: body.set_captain,
      inviteUrl,
    },
    '[teams/invitations] invite email failed'
  );

  return {
    invitation: {
      id: invite.data.id,
      team_id: team.id,
      user_id: inviteeUserId,
      role: body.role,
      set_captain: body.set_captain,
      expires_at: invite.data.payload?.expires_at ?? null,
    },
    invite_url: inviteUrl,
    email_sent: emailSent,
  };
}

/**
 * L'invitation DOIT appartenir à l'équipe gérée : cherchée dans SA file, un
 * `team_id` étranger est un 404 indistinguable d'un id inexistant.
 */
async function requireOwnInvitation(
  ctx: ManagedTeamContext,
  invitationId: string
) {
  const rows = await pendingInvitations(ctx);
  const invitation = rows.find((row) => row.id === invitationId);
  if (!invitation) {
    throw fail(
      404,
      "Cette invitation n'existe plus ou a déjà été traitée.",
      'INVITATION_NOT_FOUND'
    );
  }
  return invitation;
}

export function assertInvitationId(raw: unknown): string {
  const id = String(raw ?? '');
  if (!UUID_RE.test(id)) {
    throw fail(400, 'Invitation invalide.', 'INVALID_ID');
  }
  return id;
}

/** DELETE — annuler. */
export async function cancelSentInvitation(
  ctx: ManagedTeamContext,
  invitationId: string
) {
  const invitation = await requireOwnInvitation(ctx, invitationId);
  const { error } = await cancelPendingInvitation(
    ctx.db,
    ctx.tenantId,
    invitation.id
  );
  if (error) {
    ctx.logger.error('[teams/invitations/:id] cancel error', error);
    throw fail(500, "Échec de l'annulation.", 'CANCEL_FAILED');
  }
  return { status: 'cancelled', id: invitation.id };
}

/**
 * POST — relancer : nouveau lien + expiration repoussée, e-mail s'il y a une
 * adresse. SANS adresse on relance quand même (invitations du bot ou de
 * `invite-free-player`) : le lien est rendu à l'appelante.
 */
export async function resendSentInvitation(
  ctx: ManagedTeamContext,
  invitationId: string
) {
  const invitation = await requireOwnInvitation(ctx, invitationId);
  const email = invitation.payload?.invite_email ?? null;

  const token = generateInviteToken();
  const refreshed = await refreshInvitationToken(
    ctx.tenantId,
    invitation.id,
    hashInviteToken(token)
  );
  if (!refreshed.ok) {
    throw fail(refreshed.status, refreshed.error, 'RESEND_FAILED');
  }

  const { team } = await readTeamHead(ctx.db, ctx.tenantId, ctx.team.teamId);
  const inviteUrl = buildInviteUrl(token);
  const emailSent = email
    ? await sendInviteEmail(
        ctx,
        {
          tenantId: ctx.tenantId,
          to: email,
          teamName: team?.name ?? 'ton équipe',
          role: invitation.payload?.desired_role ?? 'player',
          asCaptain: Boolean(invitation.payload?.set_captain),
          inviteUrl,
        },
        '[teams/invitations/:id] resend email failed'
      )
    : false;

  return {
    status: 'resent',
    id: invitation.id,
    email,
    invite_url: inviteUrl,
    email_sent: emailSent,
    expires_at: refreshed.data.payload?.expires_at ?? null,
  };
}

/* ------------------------------------------------------------------------
 * Lien d'équipe
 * ---------------------------------------------------------------------- */

/** Vue gestion d'un lien. Ne contient jamais le jeton. */
function toPublicLink(row: ManagedInviteLinkRow) {
  const state = readJoinLinkState(row);
  return {
    id: row.id,
    role: row.role,
    expires_at: row.expires_at,
    max_uses: row.max_uses,
    uses_count: row.uses_count,
    remaining_uses: state.remainingUses,
    usable: state.usable,
    unusable_reason: state.reason ?? null,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at ?? null,
  };
}

export async function getInviteLink(ctx: ManagedTeamContext) {
  const { link, error } = await readActiveInviteLink(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error) ctx.logger.error('[teams/invite-links] load error', error);
  return { link: link && !error ? toPublicLink(link) : null };
}

export async function revokeInviteLink(ctx: ManagedTeamContext) {
  const { error } = await revokeActiveInviteLinks(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error) {
    ctx.logger.error('[teams/invite-links] revoke error', error);
    throw fail(500, 'Le lien n’a pas pu être révoqué.', 'REVOKE_FAILED');
  }
  return { link: null, revoked: true };
}

/** POST — (re)génère : révoque le précédent, rend le jeton une fois. */
export async function rotateInviteLink(
  ctx: ManagedTeamContext,
  rawBody: unknown
) {
  const parsed = InviteLinkBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw fail(
      400,
      'Requête invalide : rôle connu, max_uses 1–50, ttl_days 1–30.',
      'INVALID_BODY'
    );
  }
  const body = parsed.data;
  const { db, tenantId } = ctx;
  const teamId = ctx.team.teamId;

  const { team } = await readTeamHead(db, tenantId, teamId);
  if (!team) throw fail(404, 'Équipe introuvable.', 'TEAM_NOT_FOUND');
  // Chaque usage serait refusé : inutile de distribuer le lien.
  await assertRosterOpen(ctx, teamId);

  if ((await isPrivilegedRole(ctx, body.role)) && !ctx.team.isCaptain) {
    throw fail(
      403,
      'Seule la capitaine peut créer un lien qui donne un rôle de gestion.',
      'ROLE_ESCALATION'
    );
  }

  // Un lien à la fois : régénérer EST la révocation du précédent.
  const { error: revokeErr } = await revokeActiveInviteLinks(
    db,
    tenantId,
    teamId
  );
  if (revokeErr) {
    ctx.logger.error('[teams/invite-links] rotate/revoke error', revokeErr);
    throw fail(500, 'Le lien n’a pas pu être régénéré.', 'ROTATE_FAILED');
  }

  const token = generateInviteToken();
  const { link, error: insertErr } = await insertInviteLink(db, {
    tenant_id: tenantId,
    team_id: teamId,
    token_hash: hashInviteToken(token),
    role: body.role,
    created_by: ctx.subject.userId,
    expires_at: joinLinkExpiryFromNow(
      body.ttl_days ?? JOIN_LINK_DEFAULT_TTL_DAYS
    ),
    max_uses: body.max_uses ?? null,
    // Explicite : relu tout de suite, base du CAS de réservation d'entrée.
    uses_count: 0,
  });
  if (insertErr || !link) {
    ctx.logger.error('[teams/invite-links] insert error', insertErr);
    throw fail(500, 'Le lien n’a pas pu être créé.', 'CREATE_FAILED');
  }

  return { link: toPublicLink(link), url: buildJoinUrl(token), token };
}
