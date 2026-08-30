// pages/api/teams/invite-links/by-token.ts
//
// Le « lien d'équipe » côté visiteur (cf. ./index.ts pour la création).
//
//   GET  ?token=… → métadonnées PUBLIQUES minimales (nom de l'équipe, logo,
//                   rôle proposé, expiration). Sert à afficher /rejoindre/[token]
//                   à quelqu'un qui n'est pas encore connecté. On n'expose ni
//                   l'id du lien, ni qui l'a créé, ni le roster.
//   POST { token } → INSCRIT l'appelante au roster. `withAuthRoute` : session
//                   OBLIGATOIRE. C'est le seul endroit où le lien agit.
//
// Le lien n'authentifie jamais : il ne remplace pas une connexion, il ne crée
// pas de compte. Un lien qui fuite ne fait entrer que des gens déjà connectés,
// dans une seule équipe, avec un rôle décidé d'avance.
//
// L'inscription réutilise le chemin d'invitation existant — on crée
// l'invitation puis on l'accepte immédiatement — plutôt que d'insérer dans
// `team_members` en direct. Deux raisons : l'acceptation est ATOMIQUE côté base
// (RPC `accept_invitation` : verrou + garde `max_players`), et l'entrée laisse
// la même trace dans `demandes` qu'un recrutement classique, donc les écrans
// d'historique n'ont rien à apprendre.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  hashInviteToken,
  isValidInviteToken,
  readJoinLinkState,
  type TeamInviteLinkRow,
} from '@/utils/teams/inviteLinks';
import { acceptInvitation, createInvitation } from '@/utils/teams/invitations';
import { findExclusiveMembership } from '@/utils/teams/memberships';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { roleRequiresBattleTag } from '@/utils/teams/roleKind';
import { logger } from '@/utils/logger';

const TABLE = 'team_invite_links';

const postSchema = z.object({
  token: z.string(),
  /**
   * BattleTag, exigé pour les rôles JOUANTS. L'invitation par email le fait
   * saisir par la capitaine ; ici la personne le saisit elle-même, puisque
   * personne d'autre ne le connaît.
   */
  battle_tag: z.string().trim().max(64).optional().nullable(),
  specialty: z.enum(['tank', 'dps', 'support', 'flex']).optional().nullable(),
});

type LinkRow = TeamInviteLinkRow & { created_by: string | null };

/** Compteur d'entrées, normalisé — cf. la même précaution dans inviteLinks.ts. */
function usedCount(link: Pick<LinkRow, 'uses_count'>): number {
  return Number(link.uses_count ?? 0) || 0;
}

/**
 * Jeton → lien. Répond directement (404/410) et renvoie `null` quand il n'y a
 * rien d'exploitable. Le message reste le MÊME pour « inconnu », « révoqué »,
 * « expiré » et « épuisé » côté GET : un lien mort ne doit pas devenir un
 * oracle qui confirme l'existence d'une équipe.
 */
async function resolveLink(
  res: NextApiResponse,
  rawToken: unknown
): Promise<LinkRow | null> {
  if (!isValidInviteToken(rawToken)) {
    res.status(404).json({ error: 'Ce lien est invalide ou expiré.' });
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      'id, team_id, tenant_id, role, expires_at, max_uses, uses_count, revoked_at, created_by'
    )
    .eq('token_hash', hashInviteToken(rawToken as string))
    .maybeSingle();

  if (error) {
    logger.error('[invite-links/by-token] load error', error);
    res.status(500).json({ error: 'Erreur de chargement du lien.' });
    return null;
  }
  if (!data) {
    res.status(404).json({ error: 'Ce lien est invalide ou expiré.' });
    return null;
  }

  const link = data as unknown as LinkRow;
  const state = readJoinLinkState(link);
  if (!state.usable) {
    res.status(410).json({
      error: 'Ce lien est invalide ou expiré.',
      code: state.reason?.toUpperCase() ?? 'UNUSABLE',
    });
    return null;
  }
  return link;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const rawToken = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;

  const link = await resolveLink(res, rawToken);
  if (!link) return;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('name, short_name, logo_url, slug')
    .eq('id', link.team_id)
    .eq('tenant_id', link.tenant_id)
    .maybeSingle();

  if (!team) {
    return res.status(404).json({ error: 'Ce lien est invalide ou expiré.' });
  }

  const state = readJoinLinkState(link);
  return res.status(200).json({
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

/**
 * Réserve une entrée sur le lien. UPDATE conditionnel : c'est lui, et non une
 * lecture préalable, qui rend un lien à usage unique réellement unique quand
 * deux personnes cliquent en même temps.
 */
async function claimSeat(link: LinkRow): Promise<boolean> {
  const current = usedCount(link);
  const query = supabaseAdmin
    .from(TABLE)
    .update({
      uses_count: current + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', link.id)
    // Le compteur lu doit être celui qu'on met à jour : sinon quelqu'un est
    // passé entre-temps et cette tentative doit repartir de zéro.
    .eq('uses_count', current)
    .is('revoked_at', null);

  const { data, error } = await query.select('id').maybeSingle();
  if (error) {
    logger.error('[invite-links/by-token] claim error', error);
    return false;
  }
  return Boolean(data);
}

/** Rend l'entrée réservée quand l'inscription échoue après coup. */
async function releaseSeat(link: LinkRow): Promise<void> {
  const current = usedCount(link);
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({ uses_count: current })
    .eq('id', link.id)
    .eq('uses_count', current + 1);
  if (error) {
    // Sans conséquence sur l'inscription (qui a échoué) : au pire le lien a
    // consommé une entrée de trop, ce qui se corrige en le régénérant.
    logger.error('[invite-links/by-token] release error', error);
  }
}

/**
 * POST — inscription effective. Sous `withAuthRoute` : c'est ici, et seulement
 * ici, qu'une session est exigée. Le GET reste public pour que la page puisse
 * présenter l'équipe AVANT de demander à quelqu'un de se connecter.
 */
const handlePost = withAuthRoute(async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  const parsed = postSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Requête invalide.', code: 'INVALID_BODY' });
  }
  const body = parsed.data;

  const link = await resolveLink(res, body.token);
  if (!link) return;

  const tenantId = link.tenant_id;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, slug, captain_id')
    .eq('id', link.team_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!team) {
    return res.status(404).json({ error: 'Ce lien est invalide ou expiré.' });
  }

  // Déjà dans CETTE équipe : ce n'est pas une erreur de sa part, c'est un
  // double-clic ou un lien rouvert. On le dit sans consommer d'entrée.
  const { data: alreadyMember } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('team_id', team.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (alreadyMember) {
    return res.status(200).json({
      joined: false,
      already_member: true,
      team: { name: team.name, slug: team.slug ?? null },
    });
  }

  // « Une seule équipe » — même règle que l'acceptation d'invitation et que
  // /api/demandes/join (un siège de manager ne prend pas le compte).
  const currentMembership = await findExclusiveMembership(user.id, tenantId);
  if (currentMembership) {
    return res.status(400).json({
      error:
        "Tu fais déjà partie d'une équipe. Quitte-la d'abord depuis ton espace joueuse.",
      code: 'ALREADY_IN_TEAM',
    });
  }

  const lockStatus = await isTeamRosterLocked(tenantId, team.id);
  if (lockStatus.locked) {
    return res
      .status(409)
      .json({
        error: rosterLockErrorMessage(lockStatus),
        code: 'ROSTER_LOCKED',
      });
  }

  if (roleRequiresBattleTag(link.role) && !body.battle_tag?.trim()) {
    return res.status(400).json({
      error: 'Ton BattleTag est nécessaire pour rejoindre le roster.',
      code: 'BATTLE_TAG_REQUIRED',
    });
  }

  if (!(await claimSeat(link))) {
    return res.status(409).json({
      error:
        'Ce lien vient d’être utilisé. Demande-en un nouveau à ton équipe.',
      code: 'LINK_EXHAUSTED',
    });
  }

  // L'auteur de l'invitation technique : la personne qui a créé le lien, à
  // défaut la capitaine. `createInvitation` refuse invitant == invité, cas déjà
  // écarté plus haut (elle serait membre).
  const inviterId = link.created_by ?? team.captain_id ?? null;
  if (!inviterId) {
    await releaseSeat(link);
    return res
      .status(409)
      .json({
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
    inviteTokenHash: hashInviteToken(body.token),
  });

  if (!invite.ok) {
    await releaseSeat(link);
    return res.status(invite.status).json({ error: invite.error });
  }

  const accepted = await acceptInvitation(tenantId, invite.data.id, user.id);
  if (!accepted.ok) {
    await releaseSeat(link);
    // L'invitation reste `pending` : elle apparaîtra dans « invitations en
    // attente » de l'équipe, donc rien n'est perdu — la personne peut aussi
    // l'accepter depuis son espace.
    return res.status(accepted.status).json({ error: accepted.error });
  }

  return res.status(200).json({
    joined: true,
    already_member: false,
    role: link.role,
    team: { name: team.name, slug: team.slug ?? null },
  });
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const isGet = req.method === 'GET';
  const isPost = req.method === 'POST';
  if (!isGet && !isPost) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Le jeton fait 32 octets aléatoires : le brute-forcer est hors de portée.
  // On plafonne quand même les sondages venus d'une même IP.
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'join-link-token')
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  if (isGet) return handleGet(req, res);
  return handlePost(req, res);
}
