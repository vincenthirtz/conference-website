// pages/api/teams/invitations/index.ts
//
// POST — la capitaine (ou un membre au rôle de gestion) invite quelqu'un dans
// son équipe par EMAIL, et récupère en retour un LIEN PRIVÉ partageable.
//
// Deux usages symétriques, tous deux couverts ici :
//   - une CAPITAINE désigne un MANAGER (`role: 'manager'`) pour l'épauler ;
//   - un MANAGER désigne la CAPITAINE (`set_captain: true`) — uniquement tant
//     que l'équipe n'en a pas (sinon c'est un transfert de capitanat, réservé à
//     la capitaine en poste via PATCH /api/teams/transfer-captain).
//
// Rien n'est imposé à l'invitée : on crée une invitation PENDING (demandes
// type='invite'), elle rejoint l'équipe — et prend le capitanat le cas échéant
// — seulement quand elle accepte. Le compte auth est créé à la volée si l'email
// est inconnu, comme à la création d'équipe.
//
// Anti-escalade : accorder un rôle À PRIVILÈGES (manager & co, cf.
// utils/teamRoles.ts) est réservé à la CAPITAINE — un manager ne peut pas
// s'auto-cloner. Même règle que PATCH /api/teams/update-member-role.
//
// Le lien privé n'authentifie pas : voir utils/teams/inviteLinks.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { findOrCreateUserByEmail } from '@/utils/find-or-create-user';
import { sendTeamInviteLinkEmail } from '@/utils/email';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
} from '@/utils/teamRoles';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { createInvitation } from '@/utils/teams/invitations';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from '@/utils/teams/inviteLinks';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';

const ALLOWED_ROLES = ['player', 'substitute', 'coach', 'manager'] as const;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(ALLOWED_ROLES).default('player'),
  battle_tag: z.string().trim().max(64).optional().nullable(),
  specialty: z.enum(['tank', 'dps', 'support', 'flex']).optional().nullable(),
  /** Inviter comme capitaine (équipe sans capitaine uniquement). */
  set_captain: z.boolean().optional().default(false),
  comment: z.string().trim().max(500).optional().nullable(),
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ce endpoint peut créer des comptes auth et envoyer des emails : plafond
  // serré, aligné sur /api/teams/add-member.
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 10 * 60 * 1000 },
      'team-invite'
    )
  ) {
    return;
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Requête invalide : email valide et rôle connu attendus.',
      code: 'INVALID_BODY',
    });
  }
  const body = parsed.data;

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res
      .status(403)
      .json({ error: TEAM_MANAGEMENT_FORBIDDEN, code: 'FORBIDDEN' });
  }

  // Permission fine (R2) : inviter, c'est modifier le roster.
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) {
    return res
      .status(denied.status)
      .json({ error: denied.error, code: 'FORBIDDEN' });
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, captain_id')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!team) {
    return res
      .status(404)
      .json({ error: 'Équipe introuvable.', code: 'TEAM_NOT_FOUND' });
  }

  // Roster verrouillé par un tournoi en cours : on n'ajoute plus personne, donc
  // on n'invite plus non plus (l'acceptation échouerait de toute façon).
  const lockStatus = await isTeamRosterLocked(tenantId, team.id);
  if (lockStatus.locked) {
    return res.status(409).json({
      error: rosterLockErrorMessage(lockStatus),
      code: 'ROSTER_LOCKED',
    });
  }

  const roles = await loadTeamRolesFromSupabase(supabaseAdmin);

  // Anti-escalade : seul le capitaine accorde un rôle à privilèges.
  if (roleHasAnyPermission(roles, body.role) && !access.isCaptain) {
    return res.status(403).json({
      error:
        "Seule la capitaine peut confier un rôle de gestion (manager) à quelqu'un.",
      code: 'ROLE_ESCALATION',
    });
  }

  // Le pendant : un manager peut désigner la capitaine, mais uniquement tant
  // que l'équipe n'en a pas. Sinon → transfert de capitanat (capitaine seule).
  if (body.set_captain) {
    if (team.captain_id) {
      return res.status(409).json({
        error:
          'Cette équipe a déjà une capitaine. Seule la capitaine peut transmettre son rôle.',
        code: 'CAPTAIN_ALREADY_SET',
      });
    }
    // Le droit de désigner découle de `manage_roster`, déjà exigé plus haut
    // pour toute la route — pas de re-lecture du membership ici.
    // Un coach ne peut pas être capitaine (invariant partagé avec les RPC
    // transfer_captain / designate_captain).
    if (body.role === 'coach') {
      return res.status(400).json({
        error: 'Un coach ne peut pas être capitaine.',
        code: 'CAPTAIN_ROLE_INVALID',
      });
    }
  }

  // Compte auth : résolu, ou créé à la volée (l'invitée n'a pas forcément de
  // compte — c'est justement le cas d'usage « j'invite un manager externe »).
  let inviteeUserId: string;
  try {
    const found = await findOrCreateUserByEmail(body.email, body.role);
    inviteeUserId = found.userId;
  } catch (err) {
    logger.error('[teams/invitations] user resolution failed', err);
    return res.status(500).json({
      error: 'Impossible de résoudre le compte associé à cet email.',
      code: 'SERVER_ERROR',
    });
  }

  if (inviteeUserId === userId) {
    return res.status(400).json({
      error: 'Tu ne peux pas t’inviter toi-même.',
      code: 'SELF_INVITE',
    });
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

  if (!invite.ok) {
    return res
      .status(invite.status)
      .json({ error: invite.error, code: 'INVITE_FAILED' });
  }

  const inviteUrl = buildInviteUrl(token);

  // Email best-effort : le lien privé est de toute façon renvoyé à l'appelante,
  // qui peut le transmettre elle-même (Discord, SMS…). Un échec Brevo ne doit
  // pas faire échouer l'invitation déjà créée.
  let emailSent = false;
  try {
    const sendResult = await sendTeamInviteLinkEmail({
      to: body.email,
      teamName: team.name,
      role: body.role,
      asCaptain: body.set_captain,
      inviteUrl,
    });
    emailSent = !!sendResult?.success;
  } catch (err) {
    logger.error('[teams/invitations] invite email failed', err);
  }

  return res.status(201).json({
    invitation: {
      id: invite.data.id,
      team_id: team.id,
      user_id: inviteeUserId,
      role: body.role,
      set_captain: body.set_captain,
      expires_at: invite.data.payload?.expires_at ?? null,
    },
    // Jeton en clair renvoyé UNE SEULE FOIS, à l'inviteuse : il n'est stocké
    // que hashé, il n'est donc plus jamais récupérable ensuite.
    invite_url: inviteUrl,
    email_sent: emailSent,
  });
});
