// GET /api/bot/v1/players/by-discord/[discordUserId]/reminders
//
// Liste de lecture pure (sans side-effect) des prochaines echeances pour
// une joueuse capitaine :
//   - match_checkin : matchs pending dont elle est capitaine, dans les 48h
//   - tournament_j1 : tournois ou son equipe est inscrite, demarrage dans
//                     les 7 prochains jours
//
// Different de GET /api/bot/v1/reminders qui est un endpoint de polling
// pour le bot et marque les rappels comme envoyes : ici on relit
// uniquement, c'est destine a une commande Discord a la demande (/rappels).
//
// Auth : x-api-key (BOT_API_KEY).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const MATCH_LOOKAHEAD_MS = 48 * 60 * 60 * 1000; // 48h
const TOURNAMENT_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

type MatchReminder = {
  kind: 'match_checkin';
  matchId: string;
  scheduledAt: string;
  teamId: string;
  teamName: string;
  opponentTeamId: string | null;
  opponentTeamName: string | null;
  isCheckedIn: boolean;
  tournamentId: string | null;
  tournamentName: string | null;
};

type TournamentReminder = {
  kind: 'tournament_j1';
  tournamentId: string;
  tournamentName: string;
  startDate: string;
  teamId: string;
  teamName: string;
};

type Reminder = MatchReminder | TournamentReminder;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const player = await resolveActorPlayer(discordUserId);
  if (!player) {
    return res
      .status(404)
      .json({ error: 'Compte Discord non lié au site.' });
  }

  // Les rappels concernent les matchs ou la joueuse est capitaine. On part
  // donc des teams qu'elle capitaine plutot que de ses memberships.
  const { data: captainedTeams, error: teamsErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('captain_id', player.authUserId);
  if (teamsErr) {
    logger.error('[bot/player/reminders] teams error', teamsErr);
    return res.status(500).json({ error: 'Erreur de chargement des équipes' });
  }

  const captainedTeamIds = (captainedTeams ?? []).map((t) => t.id);
  const captainedTeamNameById = new Map<string, string>(
    (captainedTeams ?? []).map((t) => [t.id, t.name ?? ''])
  );

  const reminders: Reminder[] = [];

  // --- Match check-ins (48h) ----------------------------------------------
  if (captainedTeamIds.length > 0) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + MATCH_LOOKAHEAD_MS);

    const { data: matches, error: mErr } = await supabaseAdmin
      .from('matches')
      .select(
        `id, scheduled_at, status, is_bye, team1_id, team2_id,
         team1_checked_in_at, team2_checked_in_at,
         team1:team1_id (id, name),
         team2:team2_id (id, name),
         tournament:tournament_id (id, name)`
      )
      .eq('tenant_id', req.botContext!.tenantId)
      .or(
        `team1_id.in.(${captainedTeamIds.join(',')}),team2_id.in.(${captainedTeamIds.join(',')})`
      )
      .eq('status', 'pending')
      .neq('is_bye', true)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', windowEnd.toISOString())
      .order('scheduled_at', { ascending: true });
    if (mErr) {
      logger.error('[bot/player/reminders] matches error', mErr);
      return res.status(500).json({ error: 'Erreur de chargement des matchs' });
    }

    for (const m of matches ?? []) {
      const captainSide: 1 | 2 = captainedTeamIds.includes((m as any).team1_id)
        ? 1
        : 2;
      const myTeamRel =
        captainSide === 1 ? (m as any).team1 : (m as any).team2;
      const oppTeamRel =
        captainSide === 1 ? (m as any).team2 : (m as any).team1;
      const myTeam = Array.isArray(myTeamRel) ? myTeamRel[0] : myTeamRel;
      const oppTeam = Array.isArray(oppTeamRel) ? oppTeamRel[0] : oppTeamRel;
      const tournamentRel = (m as any).tournament;
      const tournament = Array.isArray(tournamentRel)
        ? tournamentRel[0]
        : tournamentRel;
      const isCheckedIn =
        captainSide === 1
          ? !!(m as any).team1_checked_in_at
          : !!(m as any).team2_checked_in_at;

      reminders.push({
        kind: 'match_checkin',
        matchId: (m as any).id,
        scheduledAt: (m as any).scheduled_at,
        teamId: myTeam?.id ?? '',
        teamName:
          myTeam?.name ??
          captainedTeamNameById.get(
            captainSide === 1 ? (m as any).team1_id : (m as any).team2_id
          ) ??
          '',
        opponentTeamId: oppTeam?.id ?? null,
        opponentTeamName: oppTeam?.name ?? null,
        isCheckedIn,
        tournamentId: tournament?.id ?? null,
        tournamentName: tournament?.name ?? null,
      });
    }
  }

  // --- Tournament J-1..J-7 ------------------------------------------------
  if (captainedTeamIds.length > 0) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + TOURNAMENT_LOOKAHEAD_MS);

    const { data: stageRows, error: srErr } = await supabaseAdmin
      .from('stage_teams')
      .select(
        `team_id,
         tournament_stages!inner(
           tournament_id,
           tournament:tournament_id (id, name, start_date, status)
         )`
      )
      .eq('tenant_id', req.botContext!.tenantId)
      .in('team_id', captainedTeamIds);
    if (srErr) {
      logger.error('[bot/player/reminders] stage_teams error', srErr);
    } else {
      // Dedup by (tournamentId, teamId)
      const seen = new Set<string>();
      for (const r of stageRows ?? []) {
        const stageRel = Array.isArray((r as any).tournament_stages)
          ? (r as any).tournament_stages[0]
          : (r as any).tournament_stages;
        const tournamentRel = stageRel?.tournament;
        const tournament = Array.isArray(tournamentRel)
          ? tournamentRel[0]
          : tournamentRel;
        if (!tournament?.id || !tournament.start_date) continue;
        const startMs = Date.parse(tournament.start_date);
        if (!Number.isFinite(startMs)) continue;
        if (startMs < now.getTime() || startMs > windowEnd.getTime()) continue;
        if (tournament.status === 'archived' || tournament.status === 'cancelled')
          continue;

        const teamId = (r as any).team_id;
        const dedupKey = `${tournament.id}:${teamId}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        reminders.push({
          kind: 'tournament_j1',
          tournamentId: tournament.id,
          tournamentName: tournament.name ?? '',
          startDate: tournament.start_date,
          teamId,
          teamName: captainedTeamNameById.get(teamId) ?? '',
        });
      }
    }
  }

  // Tri global par echeance (matches d'abord, par scheduled_at ; puis
  // tournaments par start_date).
  reminders.sort((a, b) => {
    const ka = a.kind === 'match_checkin' ? a.scheduledAt : a.startDate;
    const kb = b.kind === 'match_checkin' ? b.scheduledAt : b.startDate;
    return ka.localeCompare(kb);
  });

  return res.status(200).json({
    player: {
      authUserId: player.authUserId,
      discordUserId,
    },
    upcoming: reminders,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-player-reminders' },
});
