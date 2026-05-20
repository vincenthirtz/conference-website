// GET /api/bot/v1/players/by-discord/[discordUserId]/stats
//
// Stats agregees pour une joueuse (commandes /stats cote bot) :
//   - stats d'equipe (somme des stats de SON equipe actuelle sur tous les
//     tournois) lues depuis team_stats_view
//   - nombre de MVP gagnes par la joueuse (au sens : winner_member_id d'un
//     match_mvp_polls correspond a un de ses team_members, historique inclus)
//
// Note : il n'y a pas de stats per-joueuse dans la DB (le jeu est suivi au
// niveau equipe). Pour le bot, "stats" = stats de l'equipe + compteur MVP
// personnel. C'est ce que les commandes /stats des bots Discord OW exposent
// en general.
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

  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_username')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (linkErr) {
    logger.error('[bot/player/stats] link lookup error', linkErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (!link) {
    return res.status(404).json({
      error: 'Aucun joueur lie a ce compte Discord.',
      code: 'NOT_LINKED',
    });
  }

  // 1) MVP count : toutes les team_members de cette joueuse, meme historiques.
  //    Hypothese : team_members a un FK on delete dans certaines migrations,
  //    donc on prend les rows EXISTANTES + on couvre les anciennes via
  //    match_mvp_polls.winner_member_id (qui est ON DELETE SET NULL — donc
  //    si le membre a ete supprime, on perd la trace, accepte).
  const { data: memberRows, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('user_id', link.auth_user_id);

  if (memberErr) {
    logger.error('[bot/player/stats] members fetch error', memberErr);
    return res.status(500).json({ error: 'Erreur de lecture membres' });
  }

  const memberIds = (memberRows ?? []).map((m) => m.id);
  let mvpCount = 0;
  if (memberIds.length > 0) {
    const { count: mvpCnt, error: mvpErr } = await supabaseAdmin
      .from('match_mvp_polls')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.botContext!.tenantId)
      .in('winner_member_id', memberIds);
    if (mvpErr) {
      logger.error('[bot/player/stats] mvp count error', mvpErr);
    } else {
      mvpCount = mvpCnt ?? 0;
    }
  }

  // 2) Equipe actuelle + stats agregees via team_stats_view.
  const currentMember = memberRows?.find((m) => m.team_id) ?? null; // au plus un (cf. next-match.ts)
  const currentTeamId = currentMember?.team_id ?? null;

  let teamMeta: { id: string; name: string; slug: string | null } | null = null;
  let aggregatedStats = {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    mapsWon: 0,
    mapsLost: 0,
    winrate: null as number | null,
    mapWinrate: null as number | null,
    lastMatchAt: null as string | null,
  };

  if (currentTeamId) {
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug')
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('id', currentTeamId)
      .maybeSingle();
    if (team) teamMeta = team;

    const { data: rows, error: statsErr } = await supabaseAdmin
      .from('team_stats_view')
      .select(
        'matches_played, wins, losses, draws, maps_won, maps_lost, last_match_at'
      )
      .eq('team_id', currentTeamId);

    if (statsErr) {
      logger.error('[bot/player/stats] stats fetch error', statsErr);
    } else {
      for (const r of rows ?? []) {
        aggregatedStats.matchesPlayed += r.matches_played ?? 0;
        aggregatedStats.wins += r.wins ?? 0;
        aggregatedStats.losses += r.losses ?? 0;
        aggregatedStats.draws += r.draws ?? 0;
        aggregatedStats.mapsWon += r.maps_won ?? 0;
        aggregatedStats.mapsLost += r.maps_lost ?? 0;
        if (
          r.last_match_at &&
          (!aggregatedStats.lastMatchAt ||
            r.last_match_at > aggregatedStats.lastMatchAt)
        ) {
          aggregatedStats.lastMatchAt = r.last_match_at;
        }
      }
      if (aggregatedStats.matchesPlayed > 0) {
        aggregatedStats.winrate =
          aggregatedStats.wins / aggregatedStats.matchesPlayed;
      }
      const totalMaps = aggregatedStats.mapsWon + aggregatedStats.mapsLost;
      if (totalMaps > 0) {
        aggregatedStats.mapWinrate = aggregatedStats.mapsWon / totalMaps;
      }
    }
  }

  return res.status(200).json({
    authUserId: link.auth_user_id,
    discordUserId,
    discordUsername: link.discord_username,
    team: teamMeta,
    stats: {
      ...aggregatedStats,
      mvpCount,
    },
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-stats' },
});
