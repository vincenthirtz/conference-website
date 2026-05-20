// GET /api/bot/v1/players/by-discord/[discordUserId]/history
//
// Match history d'une joueuse. Inclut tous les matchs terminés (finished /
// walkover) ou une de ses teams (actuelle ou ancienne) a participe.
//
// Query :
//   - limit  : 1..50, defaut 10
//   - tournamentId : filtre optionnel sur un tournoi
//
// Auth : x-api-key + discordUserId dans l'URL (l'info est publique).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const player = await resolveActorPlayer(discordUserId);
  if (!player) {
    return res.status(404).json({ error: 'Compte Discord non lié au site.' });
  }

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const tournamentFilter =
    typeof req.query.tournamentId === 'string' &&
    req.query.tournamentId.trim()
      ? req.query.tournamentId.trim()
      : null;
  if (tournamentFilter && !isValidUUID(tournamentFilter)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  // 1) Teams ou la joueuse est ou a ete membre.
  const { data: memberships, error: mErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('user_id', player.authUserId);
  if (mErr) {
    logger.error('[bot/history] memberships error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement des équipes' });
  }
  const playerTeamIds = (memberships ?? []).map(
    (m) => (m as { team_id: string }).team_id
  );
  if (playerTeamIds.length === 0) {
    return res.status(200).json({
      player: { authUserId: player.authUserId, discordUserId },
      matches: [],
    });
  }

  // 2) Matchs termines ou une de ses teams participe.
  let q = supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, completed_at, status, is_bye,
       team1_id, team2_id, team1_score, team2_score, winner_team_id,
       round_name, round_number,
       team1:team1_id (id, name, short_name),
       team2:team2_id (id, name, short_name),
       tournament:tournament_id (id, name, slug)`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .in('status', ['finished', 'walkover'])
    .or(
      `team1_id.in.(${playerTeamIds.join(',')}),team2_id.in.(${playerTeamIds.join(',')})`
    )
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (tournamentFilter) q = q.eq('tournament_id', tournamentFilter);

  const { data: matches, error: matchErr } = await q;
  if (matchErr) {
    logger.error('[bot/history] matches error', matchErr);
    return res.status(500).json({ error: 'Erreur de chargement des matchs' });
  }

  const playerTeamSet = new Set(playerTeamIds);
  const items = (matches ?? []).map((row) => {
    const r = row as {
      id: string;
      completed_at: string | null;
      status: string;
      is_bye: boolean | null;
      team1_id: string | null;
      team2_id: string | null;
      team1_score: number | null;
      team2_score: number | null;
      winner_team_id: string | null;
      round_name: string | null;
      round_number: number | null;
      team1: unknown;
      team2: unknown;
      tournament: unknown;
    };
    const t1 = Array.isArray(r.team1) ? r.team1[0] : r.team1;
    const t2 = Array.isArray(r.team2) ? r.team2[0] : r.team2;
    const tour = Array.isArray(r.tournament)
      ? r.tournament[0]
      : r.tournament;
    const playerOnTeam1 = !!r.team1_id && playerTeamSet.has(r.team1_id);
    const myTeamRel = playerOnTeam1 ? t1 : t2;
    const oppTeamRel = playerOnTeam1 ? t2 : t1;
    const myScore = playerOnTeam1 ? r.team1_score : r.team2_score;
    const oppScore = playerOnTeam1 ? r.team2_score : r.team1_score;
    const myTeamId = playerOnTeam1 ? r.team1_id : r.team2_id;
    const won =
      r.winner_team_id != null && myTeamId != null
        ? r.winner_team_id === myTeamId
        : null;
    return {
      matchId: r.id,
      completedAt: r.completed_at,
      status: r.status,
      isBye: !!r.is_bye,
      round: r.round_name ?? null,
      roundNumber: r.round_number ?? null,
      myTeam: myTeamRel
        ? {
            id: (myTeamRel as { id: string }).id,
            name: (myTeamRel as { name: string | null }).name,
          }
        : null,
      opponentTeam: oppTeamRel
        ? {
            id: (oppTeamRel as { id: string }).id,
            name: (oppTeamRel as { name: string | null }).name,
          }
        : null,
      myScore: myScore ?? null,
      opponentScore: oppScore ?? null,
      won,
      tournament: tour
        ? {
            id: (tour as { id: string }).id,
            name: (tour as { name: string | null }).name,
            slug: (tour as { slug: string | null }).slug,
          }
        : null,
    };
  });

  const wins = items.filter((m) => m.won === true).length;
  const losses = items.filter((m) => m.won === false).length;

  return res.status(200).json({
    player: { authUserId: player.authUserId, discordUserId },
    matches: items,
    summary: { total: items.length, wins, losses },
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-history' },
});
