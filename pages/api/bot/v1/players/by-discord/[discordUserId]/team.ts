// GET /api/bot/v1/players/by-discord/[discordUserId]/team
//
// Retourne l'equipe actuelle de la joueuse + la liste de ses coequipieres.
// Resolution discord_user_id -> auth_user_id via user_discord_links.
//
// Auth : x-api-key (BOT_API_KEY).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
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
  if (!link) {
    return res.status(404).json({
      error: 'Aucun joueur lie a ce compte Discord.',
      code: 'NOT_LINKED',
    });
  }

  // 2) Current team membership
  const { data: membership, error: memErr } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id, role, battle_tag, is_substitute, created_at')
    .eq('user_id', link.auth_user_id)
    .maybeSingle();

  if (memErr) {
    logger.error('[bot/player/team] membership error', memErr);
    return res.status(500).json({ error: 'Erreur de lecture membership' });
  }

  if (!membership) {
    return res.status(200).json({
      authUserId: link.auth_user_id,
      discordUserId,
      discordUsername: link.discord_username,
      team: null,
      member: null,
      teammates: [],
    });
  }

  // 3) Team metadata + all members
  const [{ data: team, error: teamErr }, { data: teammates, error: tmErr }] =
    await Promise.all([
      supabaseAdmin
        .from('teams')
        .select(
          'id, name, slug, short_name, logo_url, banner_url, country, captain_id, is_joinable, discord, discord_role_id'
        )
        .eq('id', membership.team_id)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select('id, user_id, role, battle_tag, is_substitute, created_at')
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
    },
    teammates: (teammates ?? []).map((m: any) => ({
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
