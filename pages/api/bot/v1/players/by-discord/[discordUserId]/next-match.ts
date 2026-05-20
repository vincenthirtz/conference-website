// GET /api/bot/v1/players/by-discord/[discordUserId]/next-match
//
// Renvoie le prochain match (ou en cours) de la joueuse, vu cote bot Discord.
// Logique alignee sur /api/player/next-match : "next" = nearest scheduled_at
// >= now - 1h, ongoing inclus, decoupe team1/team2 cote serveur.
//
// Auth : x-api-key (BOT_API_KEY).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_username')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();

  if (linkErr) {
    logger.error('[bot/player/next-match] link lookup error', linkErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (!link) {
    return res.status(404).json({
      error: 'Aucun joueur lie a ce compte Discord.',
      code: 'NOT_LINKED',
    });
  }

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('user_id', link.auth_user_id)
    .maybeSingle();

  const teamId = membership?.team_id;
  if (!teamId) {
    return res.status(200).json({
      authUserId: link.auth_user_id,
      discordUserId,
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
    });
  }

  const cutoffISO = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data: matches, error } = await supabaseAdmin
    .from('matches')
    .select(
      `id, status, scheduled_at, match_format, round_name, stream_url, lobby_code,
       team1_id, team2_id,
       team1_checkin_token, team2_checkin_token,
       team1_checked_in_at, team2_checked_in_at,
       team1:team1_id(id, name),
       team2:team2_id(id, name),
       tournament:tournament_id(id, name, slug)`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .in('status', ['pending', 'ongoing'])
    .gte('scheduled_at', cutoffISO)
    .order('scheduled_at', { ascending: true })
    .limit(1);

  if (error) {
    logger.error('[bot/player/next-match] match lookup error', error);
    return res.status(500).json({ error: 'Erreur de lecture match' });
  }

  const match = matches?.[0];
  if (!match) {
    return res.status(200).json({
      authUserId: link.auth_user_id,
      discordUserId,
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
    });
  }

  const isTeam1 = match.team1_id === teamId;
  const slot: 1 | 2 = isTeam1 ? 1 : 2;
  const myTeamRel = isTeam1 ? match.team1 : match.team2;
  const oppRel = isTeam1 ? match.team2 : match.team1;
  const myTeam = Array.isArray(myTeamRel) ? myTeamRel[0] : myTeamRel;
  const opponent = Array.isArray(oppRel) ? oppRel[0] : oppRel;
  const tn = Array.isArray(match.tournament)
    ? match.tournament[0]
    : match.tournament;

  const token = isTeam1 ? match.team1_checkin_token : match.team2_checkin_token;
  const checkedInAt = isTeam1
    ? match.team1_checked_in_at
    : match.team2_checked_in_at;

  const scheduledAt = match.scheduled_at as string | null;
  const opensAt = scheduledAt
    ? new Date(
        new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
      ).toISOString()
    : null;
  const closesAt = scheduledAt;

  const now = Date.now();
  const isOpen =
    !!opensAt &&
    !!closesAt &&
    now >= new Date(opensAt).getTime() &&
    now <= new Date(closesAt).getTime();
  const isPassed = !!closesAt && now > new Date(closesAt).getTime();

  const formatStr = (match.match_format as string | null) ?? null;
  const bestOf = formatStr
    ? Number.parseInt(formatStr.replace(/[^\d]/g, ''), 10) || null
    : null;

  return res.status(200).json({
    authUserId: link.auth_user_id,
    discordUserId,
    match: {
      id: match.id,
      scheduledAt,
      status: match.status,
      format: formatStr,
      bestOf,
      roundName: (match.round_name as string | null) ?? null,
      streamUrl: (match.stream_url as string | null) ?? null,
      lobbyCode: (match.lobby_code as string | null) ?? null,
    },
    team: myTeam ? { id: myTeam.id, name: myTeam.name, slot } : null,
    opponent: opponent ? { id: opponent.id, name: opponent.name } : null,
    tournament: tn ? { id: tn.id, name: tn.name, slug: tn.slug ?? null } : null,
    checkin: {
      // Note : on expose le token uniquement pour le capitaine. Pour les
      // autres membres, on cache le token mais on garde le statut visible.
      tokenAvailable: !!token,
      alreadyCheckedIn: !!checkedInAt,
      checkedInAt: (checkedInAt as string | null) ?? null,
      opensAt,
      closesAt,
      isOpen,
      isPassed,
    },
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-next-match' },
});
