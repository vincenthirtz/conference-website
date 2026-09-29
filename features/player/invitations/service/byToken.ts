// features/player/invitations/service/byToken.ts — LA lecture / réponse d'un
// jeton d'invitation, quelle que soit sa famille (lot P11 ; déplacé de
// pages/api/invitations/[token]).
//
// Aiguillage : trois familles de jetons coexistent (cf.
// utils/invitations/resolveToken.ts) et deux produisent la même URL publique
// `/invitation/<token>`. On résout d'abord la FAMILLE, puis on applique ses
// règles. Un lien d'équipe partageable (`join-link`) est renvoyé vers la page
// qui sait le servir : un lien collé dans la mauvaise barre doit atterrir.

import {
  hashInvitationToken,
  redirectPathForKind,
  resolveInvitationToken,
} from '@/utils/invitations/resolveToken';
import {
  actOnTeamInvitation,
  getTeamInvitationView,
} from '@/utils/teams/inviteByToken';
import {
  insertStaffForInvitation,
  markTenantInvitationAccepted,
  readStaffIdByUser,
  readTenantInvitationByHash,
  readTenantName,
  upsertTenantStaff,
  type TenantInvitationRow,
} from '../repository/tenantInvitations';
import { parseBody } from '@/utils/player/errors';
import { TeamInvitationActionBody } from '../schemas';
import type { TokenCtx, TokenReply } from './context';
import type { User } from '@supabase/supabase-js';

const UNKNOWN: TokenReply = {
  status: 404,
  body: { error: 'Invitation introuvable.', code: 'UNKNOWN_INVITATION' },
};
const AUTH_REQUIRED: TokenReply = {
  status: 401,
  body: { error: 'Connexion requise.', code: 'AUTH_REQUIRED' },
};

/** Un seul vocabulaire d'état pour l'invitation d'espace. */
function statusOf(inv: TenantInvitationRow, nowMs: number) {
  if (inv.accepted_at) return 'accepted' as const;
  if (inv.revoked_at) return 'revoked' as const;
  if (Date.parse(inv.expires_at) <= nowMs) return 'expired' as const;
  return 'pending' as const;
}

type Resolved =
  | { reply: TokenReply }
  | { kind: 'team' }
  | { kind: 'tenant'; inv: TenantInvitationRow; tenantName: string };

/** Famille du jeton ; réponse directe pour « inconnu » et « lien d'équipe ». */
async function resolveFamily(ctx: TokenCtx): Promise<Resolved> {
  const resolved = await resolveInvitationToken(ctx.token);
  // Inconnu des trois familles : 404 sec (distinguer aiderait à balayer).
  if (!resolved) return { reply: UNKNOWN };
  if (resolved.kind === 'join-link') {
    return {
      reply: {
        status: 200,
        body: {
          kind: 'join-link',
          redirectTo: redirectPathForKind('join-link', ctx.token),
        },
      },
    };
  }
  if (resolved.kind === 'team') return { kind: 'team' };

  const { invitation, error } = await readTenantInvitationByHash(
    ctx.db,
    hashInvitationToken(ctx.token)
  );
  if (error) {
    ctx.logger.error('[invitations] lookup error', error);
    return { reply: { status: 500, body: { error: 'Server error.' } } };
  }
  // Vue par le résolveur à l'instant : disparue = suppression concurrente.
  if (!invitation) return { reply: UNKNOWN };
  const tenantName = await readTenantName(ctx.db, invitation.tenant_id);
  return { kind: 'tenant', inv: invitation, tenantName };
}

/** GET : ce que dit l'invitation, sans la consommer. */
export async function viewInvitation(ctx: TokenCtx): Promise<TokenReply> {
  const family = await resolveFamily(ctx);
  if ('reply' in family) return family.reply;
  if (family.kind === 'team') {
    const { status, body } = await getTeamInvitationView(ctx.token);
    return { status, body: { kind: 'team', ...body } };
  }
  const { inv, tenantName } = family;
  return {
    status: 200,
    body: {
      kind: 'tenant',
      status: statusOf(inv, Date.now()),
      tenantName,
      role: inv.role,
      // Adresse tronquée : comprendre « ce n'est pas mon compte » sans
      // exposer l'adresse complète à qui a le lien.
      emailHint: inv.email.replace(/^(.).*(@.*)$/, '$1***$2'),
      expiresAt: inv.expires_at,
    },
  };
}

/**
 * POST : accepte (ou refuse, invitation d'équipe) pour l'utilisateur
 * CONNECTÉ. La session est lue ici, après la famille : un jeton inconnu
 * répond 404 même sans session (contrat historique).
 */
export async function respondToInvitation(
  ctx: TokenCtx & { user: User | null },
  rawBody: unknown
): Promise<TokenReply> {
  const family = await resolveFamily(ctx);
  if ('reply' in family) return family.reply;

  if (family.kind === 'team') {
    if (!ctx.user) return AUTH_REQUIRED;
    const parsed = parseBody(TeamInvitationActionBody, rawBody);
    if (!parsed.ok) return { status: 400, body: parsed.body };
    const { status, body } = await actOnTeamInvitation(
      ctx.token,
      parsed.data.action,
      ctx.user
    );
    return { status, body: { kind: 'team', ...body } };
  }

  return acceptTenantInvitation(ctx, family.inv, family.tenantName);
}

async function acceptTenantInvitation(
  ctx: TokenCtx & { user: User | null },
  inv: TenantInvitationRow,
  tenantName: string
): Promise<TokenReply> {
  const status = statusOf(inv, Date.now());
  if (status !== 'pending') {
    return {
      status: 409,
      body: {
        error:
          status === 'accepted'
            ? 'Cette invitation a déjà été acceptée.'
            : status === 'revoked'
              ? 'Cette invitation a été annulée.'
              : 'Cette invitation a expiré.',
        code: status.toUpperCase(),
      },
    };
  }
  // C'est le compte connecté qui reçoit l'accès.
  const { user } = ctx;
  if (!user) return AUTH_REQUIRED;
  // Nominative : l'accepter avec un autre compte donnerait un accès à
  // quelqu'un que personne n'a invité.
  if ((user.email ?? '').toLowerCase() !== inv.email.toLowerCase()) {
    return {
      status: 403,
      body: {
        error:
          "Cette invitation a été envoyée à une autre adresse. Connectez-vous avec l'adresse invitée.",
        code: 'EMAIL_MISMATCH',
      },
    };
  }

  // Compte staff : réutilisé s'il existe, créé sinon.
  let staffId = await readStaffIdByUser(ctx.db, user.id);
  if (!staffId) {
    const created = await insertStaffForInvitation(ctx.db, user.id, inv.email);
    if (created.error || !created.staffId) {
      ctx.logger.error('[invitations] staff insert error', created.error);
      return {
        status: 500,
        body: { error: 'Impossible de créer le compte staff.' },
      };
    }
    staffId = created.staffId;
  }

  const { error: linkErr } = await upsertTenantStaff(
    ctx.db,
    inv.tenant_id,
    staffId,
    inv.role
  );
  if (linkErr) {
    ctx.logger.error('[invitations] tenant_staff upsert error', linkErr);
    return { status: 500, body: { error: 'Rattachement impossible.' } };
  }

  const { error: markErr } = await markTenantInvitationAccepted(
    ctx.db,
    inv.id,
    staffId
  );
  // Le rattachement est fait : une écriture d'état ratée ne se rejoue pas à
  // la figure de l'invité.
  if (markErr) ctx.logger.error('[invitations] mark accepted error', markErr);

  return {
    status: 200,
    body: { kind: 'tenant', status: 'accepted', tenantName, role: inv.role },
  };
}
