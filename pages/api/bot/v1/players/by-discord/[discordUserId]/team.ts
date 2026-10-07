// GET /api/bot/v1/players/by-discord/[discordUserId]/team
//
// Retourne l'equipe actuelle de la joueuse + la liste de ses coequipieres.
// Resolution discord_user_id -> auth_user_id via user_discord_links.
//
// Auth : x-api-key (BOT_API_KEY).
//
// RAFALES. Le scan blacklist du bot appelle cette route pour chaque membre de
// chaque serveur, à la suite. Au-delà de quelques appels rapprochés du même
// tenant, la réponse est calculée sur un instantané de 30 s (cf.
// utils/botPlayerTeamSnapshot.ts) au lieu de 4 requêtes par membre. Un appel
// isolé garde le chemin direct. La forme de réponse est identique.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { listMemberships, pickMembership } from '@/utils/teams/memberships';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import {
  getPlayerTeamSnapshot,
  registerPlayerTeamCall,
  SNAPSHOT_TEAM_COLUMNS,
  type SnapshotTeam,
} from '@/utils/botPlayerTeamSnapshot';

/** La forme des coéquipières, telle que le `.select()` la demande. */
type TeammateRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  is_substitute: boolean | null;
  created_at: string;
};

type MembershipRow = {
  id: string;
  team_id: string;
  role: string | null;
  battle_tag: string | null;
  is_substitute: boolean | null;
  created_at: string | null;
};

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

/** Ce qu'il faut pour répondre, quelle que soit la source. */
type Resolved =
  | { kind: 'not_linked' }
  | {
      kind: 'no_team';
      link: { auth_user_id: string; discord_username: string | null };
    }
  | {
      kind: 'team';
      link: { auth_user_id: string; discord_username: string | null };
      membership: MembershipRow;
      team: SnapshotTeam;
      teammates: TeammateRow[];
    };

/**
 * Résolution depuis l'instantané de rafale. `null` = l'instantané ne sait pas
 * répondre avec certitude (indisponible, équipe absente) → chemin direct.
 */
async function resolveFromSnapshot(
  tenantId: string,
  discordUserId: string
): Promise<Resolved | null> {
  const snap = await getPlayerTeamSnapshot(tenantId);
  if (!snap) return null;
  const link = snap.linksByDiscordId.get(discordUserId);
  if (!link) return { kind: 'not_linked' };
  const membership = pickMembership(
    snap.membershipsByUser.get(link.auth_user_id) ?? []
  );
  if (!membership) return { kind: 'no_team', link };
  const team = snap.teamsById.get(membership.team_id);
  // Équipe introuvable : le chemin direct sait rendre la 500 historique.
  if (!team) return null;
  return {
    kind: 'team',
    link,
    membership,
    team,
    teammates: snap.membersByTeam.get(membership.team_id) ?? [],
  };
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const tenantId = req.botContext.tenantId;
  if (registerPlayerTeamCall(tenantId)) {
    const resolved = await resolveFromSnapshot(tenantId, discordUserId);
    if (resolved) return respond(res, discordUserId, resolved);
  }

  // 1) Resolve link
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_username')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();

  if (linkErr) {
    logger.error('[bot/player/team] link lookup error', linkErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (!link) return respond(res, discordUserId, { kind: 'not_linked' });

  // 2) Current team membership. Une seule est renvoyée (contrat bot
  // inchangé) : celle qui « prend » le compte, à défaut la plus ancienne — un
  // manager peut en encadrer plusieurs depuis 2026-08-20.
  const membershipRows = await listMemberships<MembershipRow>(
    link.auth_user_id,
    req.botContext.tenantId,
    'id, team_id, role, battle_tag, is_substitute, created_at'
  );
  const membership = pickMembership(membershipRows);

  if (!membership)
    return respond(res, discordUserId, { kind: 'no_team', link });

  // 3) Team metadata + all members
  const [{ data: team, error: teamErr }, { data: teammates, error: tmErr }] =
    await Promise.all([
      supabaseAdmin
        .from('teams')
        .select(SNAPSHOT_TEAM_COLUMNS)
        .eq('tenant_id', req.botContext.tenantId)
        .eq('id', membership.team_id)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select('id, user_id, role, battle_tag, is_substitute, created_at')
        .eq('tenant_id', req.botContext.tenantId)
        .eq('team_id', membership.team_id)
        .order('is_substitute', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

  if (teamErr || !team) {
    logger.error('[bot/player/team] team fetch error', teamErr);
    return res.status(500).json({ error: 'Erreur de lecture equipe' });
  }
  if (tmErr) {
    logger.error('[bot/player/team] teammates error', tmErr);
    return res.status(500).json({ error: 'Erreur de lecture coequipieres' });
  }

  return respond(res, discordUserId, {
    kind: 'team',
    link,
    membership,
    team: team as SnapshotTeam,
    teammates: (teammates ?? []) as TeammateRow[],
  });
}

/** Forme de réponse unique — chemin direct ou instantané. */
function respond(res: NextApiResponse, discordUserId: string, r: Resolved) {
  if (r.kind === 'not_linked') {
    return res.status(404).json({
      error: 'Aucun joueur lie a ce compte Discord.',
      code: 'NOT_LINKED',
    });
  }
  const { link } = r;
  if (r.kind === 'no_team') {
    return res.status(200).json({
      authUserId: link.auth_user_id,
      discordUserId,
      discordUsername: link.discord_username,
      team: null,
      member: null,
      teammates: [],
    });
  }
  const { membership, team, teammates } = r;
  return res.status(200).json({
    authUserId: link.auth_user_id,
    discordUserId,
    discordUsername: link.discord_username,
    member: {
      id: membership.id,
      role: membership.role,
      battleTag: membership.battle_tag,
      isSubstitute: membership.is_substitute,
      isCaptain: team.captain_id === link.auth_user_id,
      joinedAt: membership.created_at,
    },
    team: {
      id: team.id,
      name: team.name,
      slug: team.slug,
      shortName: team.short_name,
      logoUrl: team.logo_url,
      bannerUrl: team.banner_url,
      country: team.country,
      isJoinable: team.is_joinable,
      discord: team.discord,
      discordRoleId: team.discord_role_id,
      description: team.description,
      website: team.website,
    },
    teammates: teammates.map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      battleTag: m.battle_tag,
      isSubstitute: m.is_substitute,
      isCaptain: team.captain_id === m.user_id,
      joinedAt: m.created_at,
    })),
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-team' },
});
