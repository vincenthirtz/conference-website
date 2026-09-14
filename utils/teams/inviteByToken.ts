// utils/teams/inviteByToken.ts
//
// Ce que dit, et ce que fait, une invitation d'ÉQUIPE présentée par son jeton.
//
// WHY: cette logique vivait dans le corps de `pages/api/teams/invitations/
// by-token.ts`, donc dans UNE route. Quand la page publique a changé de route
// (cf. utils/invitations/resolveToken.ts), la logique est partie avec elle :
// route orpheline d'un côté, page qui ne sait plus lire les invitations
// d'équipe de l'autre. Une logique métier attachée à une URL ne survit pas au
// déplacement de l'URL.
//
// Elle est donc ici, et les routes ne sont plus que des façades :
//   - `/api/invitations/[token]`            — la page publique unifiée ;
//   - `/api/teams/invitations/by-token`     — l'ancienne route, conservée.
//
// Les fonctions renvoient `{ status, body }` plutôt que d'écrire dans la
// réponse : c'est ce qui permet à deux routes de les servir sans dupliquer une
// ligne de règle, et à un test de les exercer sans simuler de HTTP.

import { supabaseAdmin } from '@/utils/supabase';
import {
  acceptInvitation,
  rejectInvitation,
  findInvitationByTokenHash,
  type InvitationRow,
} from '@/utils/teams/invitations';
import { hashInviteToken, isValidInviteToken } from '@/utils/teams/inviteLinks';
import { logger } from '@/utils/logger';

export type TeamInviteAction = 'accept' | 'reject';

export type ApiOutcome = {
  status: number;
  body: Record<string, unknown>;
};

/** "alice@domain.com" -> "a***@domain.com". Même masque des deux côtés. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

/**
 * Résout le jeton → invitation `pending` et non expirée.
 *
 * Renvoie un `ApiOutcome` d'erreur plutôt que l'invitation quand il n'y a rien
 * d'exploitable : 404 inconnue, 409 déjà traitée, 410 expirée. La distinction
 * compte — « déjà acceptée » et « introuvable » n'appellent pas la même
 * réaction chez la personne qui lit l'écran.
 */
type ResolvedInvitation = InvitationRow & { tenant_id: string };

type Resolved =
  | { ok: false; error: ApiOutcome }
  | { ok: true; invitation: ResolvedInvitation };

async function resolve(rawToken: unknown): Promise<Resolved> {
  if (!isValidInviteToken(rawToken)) {
    return {
      ok: false,
      error: { status: 404, body: { error: 'Invitation introuvable.' } },
    };
  }
  const found = await findInvitationByTokenHash(hashInviteToken(rawToken));
  if (!found.ok) {
    return {
      ok: false,
      error: { status: found.status, body: { error: found.error } },
    };
  }
  return { ok: true, invitation: found.data };
}

/**
 * Métadonnées PUBLIQUES : de quoi décrire l'offre à quelqu'un qui n'est pas
 * encore connecté. Ni id de demande, ni email en clair, ni identité de
 * l'inviteuse.
 */
export async function getTeamInvitationView(
  rawToken: unknown
): Promise<ApiOutcome> {
  const resolved = await resolve(rawToken);
  if (!resolved.ok) return resolved.error;
  const invitation = resolved.invitation;

  const { data: team } = await supabaseAdmin!
    .from('teams')
    .select('id, name, slug, logo_url')
    .eq('id', invitation.team_id)
    .maybeSingle();

  return {
    status: 200,
    body: {
      invitation: {
        team_name: team?.name ?? null,
        team_slug: team?.slug ?? null,
        team_logo_url: team?.logo_url ?? null,
        role: invitation.payload?.desired_role ?? 'player',
        as_captain: !!invitation.payload?.set_captain,
        battle_tag: invitation.payload?.battle_tag ?? null,
        specialty: invitation.payload?.specialty ?? null,
        invited_email: invitation.payload?.invite_email
          ? maskEmail(invitation.payload.invite_email)
          : null,
        expires_at: invitation.payload?.expires_at ?? null,
      },
    },
  };
}

/**
 * Accepte ou refuse, pour l'utilisateur DÉJÀ authentifié passé en argument.
 * L'authentification est la responsabilité de l'appelant : le jeton d'invitation
 * n'authentifie jamais (ce n'est pas un magic-link).
 */
export async function actOnTeamInvitation(
  rawToken: unknown,
  action: TeamInviteAction,
  user: { id: string; email?: string | null }
): Promise<ApiOutcome> {
  const resolved = await resolve(rawToken);
  if (!resolved.ok) return resolved.error;
  const invitation = resolved.invitation;

  // L'appelante est-elle bien la destinataire ? Le lien seul ne suffit jamais.
  const sameUser = invitation.user_id === user.id;
  const invitedEmail = invitation.payload?.invite_email?.toLowerCase() ?? null;
  const sessionEmail = user.email?.toLowerCase() ?? null;
  const sameEmail =
    !!invitedEmail && !!sessionEmail && invitedEmail === sessionEmail;

  if (!sameUser && !sameEmail) {
    // Cas de loin le plus fréquent : connexion avec un AUTRE compte que celui
    // invité — typiquement « Continuer avec Discord », dont l'adresse diffère
    // de celle saisie par la capitaine. Le message NOMME les deux adresses,
    // sinon la personne relit son propre mail et conclut que le site se trompe.
    const invitedMask = invitedEmail ? maskEmail(invitedEmail) : null;
    return {
      status: 403,
      body: {
        error: invitedMask
          ? `Cette invitation vise ${invitedMask}, mais tu es connecté(e) avec ${sessionEmail ?? 'un autre compte'}. Reconnecte-toi avec l’adresse invitée, ou demande à ta capitaine de te réinviter sur celle-ci.`
          : 'Cette invitation ne t’est pas destinée.',
        code: 'NOT_INVITEE',
        // Consommé par la page pour recomposer le message traduit.
        invited_email: invitedMask,
        session_email: sessionEmail,
      },
    };
  }

  // Correspondance par email mais sur un AUTRE compte auth : on ne bascule pas
  // l'invitation en douce vers ce compte — anomalie à trancher humainement
  // (comptes dupliqués sur la même adresse).
  if (!sameUser) {
    logger.error('[invite-by-token] email match on a different auth user', {
      invitationUserId: invitation.user_id,
      sessionUserId: user.id,
    });
    return {
      status: 409,
      body: {
        error:
          'Cette invitation vise un autre compte lié à la même adresse. Contacte l’équipe qui t’a invitée.',
        code: 'ACCOUNT_MISMATCH',
      },
    };
  }

  const tenantId = invitation.tenant_id;

  if (action === 'reject') {
    const result = await rejectInvitation(tenantId, invitation.id, user.id);
    if (!result.ok) {
      return { status: result.status, body: { error: result.error } };
    }
    return { status: 200, body: { success: true, action: 'reject' } };
  }

  const result = await acceptInvitation(tenantId, invitation.id, user.id);
  if (!result.ok) {
    // Même convention que /api/player/invitations/[demandeId] : le conflit
    // « déjà dans une équipe » est un 409 sur la surface web.
    const status =
      result.status === 400 && /déjà partie d'une équipe/i.test(result.error)
        ? 409
        : result.status;
    return { status, body: { error: result.error } };
  }

  return {
    status: 200,
    body: {
      success: true,
      action: 'accept',
      teamId: result.data.teamId,
      promotedToCaptain: !!result.data.promotedToCaptain,
    },
  };
}
