// features/player/invitations/service/joinLink.ts — le « lien d'équipe »
// côté visiteur (/api/teams/invite-links/by-token, lot P11 ; déplacé de la
// route, mêmes règles et messages).
//
// Le lien n'authentifie jamais : il ne remplace pas une connexion, ne crée
// pas de compte. Un lien qui fuite ne fait entrer que des gens déjà
// connectés, dans une seule équipe, avec un rôle décidé d'avance.
//
// L'inscription réutilise le chemin d'invitation : on crée l'invitation puis
// on l'accepte aussitôt — acceptation ATOMIQUE côté base (RPC
// `accept_invitation` : verrou + `max_players`) et même trace dans `demandes`
// qu'un recrutement classique.

import { hashInviteToken, readJoinLinkState } from '@/utils/teams/inviteLinks';
import { acceptInvitation, createInvitation } from '@/utils/teams/invitations';
import { findExclusiveMembership } from '@/utils/teams/memberships';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { roleRequiresBattleTag } from '@/utils/teams/roleKind';
import {
  claimJoinLinkSeat,
  isTeamMember,
  readJoinLinkByHash,
  readJoinLinkTeam,
  releaseJoinLinkSeat,
  type JoinLinkRow,
} from '../repository/joinLinks';
import { JoinLinkBody } from '../schemas';
import type { TokenCtx, TokenReply, TokenUserCtx } from './context';

const DEAD = 'Ce lien est invalide ou expiré.';

function reply(status: number, body: Record<string, unknown>): TokenReply {
  return { status, body };
}

/**
 * Jeton → lien exploitable, ou la réponse à rendre. Le message reste le MÊME
 * pour « inconnu », « révoqué », « expiré » et « épuisé » : un lien mort ne
 * doit pas devenir un oracle qui confirme l'existence d'une équipe.
 */
async function resolveLink(
  ctx: TokenCtx
): Promise<{ link: JoinLinkRow } | { reply: TokenReply }> {
  const { link, error } = await readJoinLinkByHash(
    ctx.db,
    hashInviteToken(ctx.token)
  );
  if (error) {
    ctx.logger.error('[invite-links/by-token] load error', error);
    return { reply: reply(500, { error: 'Erreur de chargement du lien.' }) };
  }
  if (!link) return { reply: reply(404, { error: DEAD }) };
  const state = readJoinLinkState(link);
  if (!state.usable) {
    return {
      reply: reply(410, {
        error: DEAD,
        code: state.reason?.toUpperCase() ?? 'UNUSABLE',
      }),
    };
  }
  return { link };
}

/**
 * GET : métadonnées PUBLIQUES minimales (équipe, rôle proposé, expiration).
 * Ni l'id du lien, ni qui l'a créé, ni le roster.
 */
export async function viewJoinLink(ctx: TokenCtx): Promise<TokenReply> {
  const resolved = await resolveLink(ctx);
  if ('reply' in resolved) return resolved.reply;
  const { link } = resolved;

  const team = await readJoinLinkTeam(
    ctx.db,
    link,
    'name, short_name, logo_url, slug'
  );
  if (!team) return reply(404, { error: DEAD });

  const state = readJoinLinkState(link);
  return reply(200, {
    team: {
      name: team.name,
      short_name: team.short_name ?? null,
      logo_url: team.logo_url ?? null,
      slug: team.slug ?? null,
    },
    role: link.role,
    battle_tag_required: roleRequiresBattleTag(link.role),
    expires_at: link.expires_at,
    remaining_uses: state.remainingUses,
  });
}

/** POST : inscription effective de la personne CONNECTÉE. */
export async function joinByLink(
  ctx: TokenUserCtx,
  rawBody: unknown
): Promise<TokenReply> {
  const parsed = JoinLinkBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return reply(400, { error: 'Requête invalide.', code: 'INVALID_BODY' });
  }
  const body = parsed.data;
  const { db, user } = ctx;

  const resolved = await resolveLink(ctx);
  if ('reply' in resolved) return resolved.reply;
  const { link } = resolved;
  const tenantId = link.tenant_id;

  const team = await readJoinLinkTeam(db, link, 'id, name, slug, captain_id');
  if (!team) return reply(404, { error: DEAD });

  // Déjà dans CETTE équipe : double-clic ou lien rouvert. On le dit sans
  // consommer d'entrée.
  if (await isTeamMember(db, tenantId, team.id, user.id)) {
    return reply(200, {
      joined: false,
      already_member: true,
      team: { name: team.name, slug: team.slug ?? null },
    });
  }

  // « Une seule équipe » — même règle que l'acceptation d'invitation et que
  // /api/demandes/join (un siège de manager ne prend pas le compte).
  if (await findExclusiveMembership(user.id, tenantId)) {
    return reply(400, {
      error:
        "Tu fais déjà partie d'une équipe. Quitte-la d'abord depuis ton espace joueuse.",
      code: 'ALREADY_IN_TEAM',
    });
  }

  const lockStatus = await isTeamRosterLocked(tenantId, team.id);
  if (lockStatus.locked) {
    return reply(409, {
      error: rosterLockErrorMessage(lockStatus),
      code: 'ROSTER_LOCKED',
    });
  }

  if (roleRequiresBattleTag(link.role) && !body.battle_tag?.trim()) {
    return reply(400, {
      error: 'Ton BattleTag est nécessaire pour rejoindre le roster.',
      code: 'BATTLE_TAG_REQUIRED',
    });
  }

  const claim = await claimJoinLinkSeat(db, link);
  if (claim.error) {
    ctx.logger.error('[invite-links/by-token] claim error', claim.error);
  }
  if (!claim.claimed) {
    return reply(409, {
      error:
        'Ce lien vient d’être utilisé. Demande-en un nouveau à ton équipe.',
      code: 'LINK_EXHAUSTED',
    });
  }

  const release = async () => {
    const { error } = await releaseJoinLinkSeat(db, link);
    // Sans conséquence sur l'inscription (qui a échoué) : au pire le lien a
    // consommé une entrée de trop, ce qui se corrige en le régénérant.
    if (error) ctx.logger.error('[invite-links/by-token] release error', error);
  };

  // Auteur de l'invitation technique : la créatrice du lien, à défaut la
  // capitaine (`createInvitation` refuse invitant == invité, cas écarté plus
  // haut : elle serait membre).
  const inviterId = link.created_by ?? team.captain_id ?? null;
  if (!inviterId) {
    await release();
    return reply(409, {
      error: 'Ce lien n’est plus rattaché à personne.',
      code: 'LINK_ORPHAN',
    });
  }

  const invite = await createInvitation(tenantId, {
    teamId: team.id,
    captainAuthUserId: inviterId,
    inviteeAuthUserId: user.id,
    role: link.role,
    battleTag: body.battle_tag ?? null,
    specialty: body.specialty ?? null,
    source: 'website',
    inviteTokenHash: hashInviteToken(ctx.token),
  });
  if (!invite.ok) {
    await release();
    return reply(invite.status, { error: invite.error });
  }

  const accepted = await acceptInvitation(tenantId, invite.data.id, user.id);
  if (!accepted.ok) {
    await release();
    // L'invitation reste `pending` : visible dans « invitations en attente »
    // de l'équipe, acceptable depuis l'espace joueuse — rien n'est perdu.
    return reply(accepted.status, { error: accepted.error });
  }

  return reply(200, {
    joined: true,
    already_member: false,
    role: link.role,
    team: { name: team.name, slug: team.slug ?? null },
  });
}
