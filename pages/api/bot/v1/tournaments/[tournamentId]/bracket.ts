// GET /api/bot/v1/tournaments/[tournamentId]/bracket
//
// Vue agregée des phases + matchs d'un tournoi pour la commande Discord
// /bracket. Pour chaque stage, renvoie ses matchs ordonnés par round + ses
// standings calcules a la volee si stage_type='swiss' ou 'round_robin'.
//
// Filtre optionnel ?stageId=<uuid> pour ne renvoyer qu'une seule phase
// (utile si le tournoi a beaucoup de phases : evite de saturer le payload
// Discord embed).
//
// Auth : x-api-key (BOT_API_KEY).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  computeSwissStandings,
  rankSwissStandings,
} from '@/utils/swiss/standings';
import type { SwissMatchResult } from '@/types/swiss';
import { logger } from '@/utils/logger';

type TeamLite = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
};

type MatchOut = {
  id: string;
  status: string;
  isBye: boolean;
  roundNumber: number | null;
  roundName: string | null;
  bracketSide: string | null;
  groupKey: string | null;
  scheduledAt: string | null;
  team1: TeamLite | null;
  team2: TeamLite | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
};

type StandingOut = {
  rank: number;
  teamId: string;
  teamName: string;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  buchholz: number;
};

type StageOut = {
  id: string;
  name: string;
  slug: string | null;
  stageType: string;
  orderIndex: number;
  startDate: string | null;
  endDate: string | null;
  matches: MatchOut[];
  standings: StandingOut[] | null;
};

function asTeam(rel: unknown): TeamLite | null {
  if (!rel) return null;
  const t = Array.isArray(rel) ? rel[0] : rel;
  if (!t?.id) return null;
  return {
    id: t.id,
    name: t.name ?? '',
    shortName: t.short_name ?? null,
    logoUrl: t.logo_url ?? null,
  };
}

function tournamentPointsFromMatch(
  team1Score: number | null,
  team2Score: number | null
): { p1: number; p2: number } | null {
  // Swiss/round_robin standings use 1/0.5/0 points. Maps-only matches use
  // team1_score / team2_score (number of maps won). We convert into
  // tournament points so the standings util can score the season.
  if (team1Score == null || team2Score == null) return null;
  if (team1Score > team2Score) return { p1: 1, p2: 0 };
  if (team1Score < team2Score) return { p1: 0, p2: 1 };
  return { p1: 0.5, p2: 0.5 };
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const rawT = req.query.tournamentId;
  const tournamentId = Array.isArray(rawT) ? rawT[0] : rawT;
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const rawStage = req.query.stageId;
  const stageFilter =
    typeof rawStage === 'string' && rawStage ? rawStage.trim() : null;
  if (stageFilter && !isValidUUID(stageFilter)) {
    return res.status(400).json({ error: 'stageId invalide' });
  }

  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, slug, status, start_date, end_date')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) {
    logger.error('[bot/bracket] tournament error', tErr);
    return res.status(500).json({ error: 'Erreur de chargement du tournoi' });
  }
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }

  let stagesQuery = supabaseAdmin
    .from('tournament_stages')
    .select('id, name, slug, stage_type, order_index, start_date, end_date')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true });
  if (stageFilter) stagesQuery = stagesQuery.eq('id', stageFilter);
  const { data: stages, error: stagesErr } = await stagesQuery;
  if (stagesErr) {
    logger.error('[bot/bracket] stages error', stagesErr);
    return res.status(500).json({ error: 'Erreur de chargement des phases' });
  }
  if (!stages || stages.length === 0) {
    return res.status(200).json({ tournament, stages: [] });
  }

  const stageIds = stages.map((s) => s.id);

  const { data: matches, error: matchesErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, stage_id, status, is_bye, round_number, round_name, bracket_side,
       group_key, scheduled_at, team1_score, team2_score, winner_team_id,
       team1:team1_id (id, name, short_name, logo_url),
       team2:team2_id (id, name, short_name, logo_url)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .in('stage_id', stageIds)
    .order('round_number', { ascending: true, nullsFirst: false });
  if (matchesErr) {
    logger.error('[bot/bracket] matches error', matchesErr);
    return res.status(500).json({ error: 'Erreur de chargement des matchs' });
  }

  const matchesByStage = new Map<string, MatchOut[]>();
  for (const m of matches ?? []) {
    const out: MatchOut = {
      id: (m as any).id,
      status: (m as any).status,
      isBye: !!(m as any).is_bye,
      roundNumber: (m as any).round_number ?? null,
      roundName: (m as any).round_name ?? null,
      bracketSide: (m as any).bracket_side ?? null,
      groupKey: (m as any).group_key ?? null,
      scheduledAt: (m as any).scheduled_at ?? null,
      team1: asTeam((m as any).team1),
      team2: asTeam((m as any).team2),
      team1Score: (m as any).team1_score ?? null,
      team2Score: (m as any).team2_score ?? null,
      winnerTeamId: (m as any).winner_team_id ?? null,
    };
    const arr = matchesByStage.get((m as any).stage_id) ?? [];
    arr.push(out);
    matchesByStage.set((m as any).stage_id, arr);
  }

  // For swiss/round_robin stages, also pull stage_teams so the standings
  // include teams that have not played yet.
  const SWISS_LIKE = new Set(['swiss', 'round_robin']);
  const swissStageIds = stages
    .filter((s) => SWISS_LIKE.has(s.stage_type))
    .map((s) => s.id);

  const stageTeamsByStage = new Map<string, TeamLite[]>();
  if (swissStageIds.length > 0) {
    const { data: stageTeams, error: stErr } = await supabaseAdmin
      .from('stage_teams')
      .select('stage_id, team:team_id (id, name, short_name, logo_url)')
      .eq('tenant_id', req.botContext.tenantId)
      .in('stage_id', swissStageIds);
    if (stErr) {
      logger.error('[bot/bracket] stage_teams error', stErr);
    } else {
      for (const r of stageTeams ?? []) {
        const t = asTeam((r as any).team);
        if (!t) continue;
        const arr = stageTeamsByStage.get((r as any).stage_id) ?? [];
        arr.push(t);
        stageTeamsByStage.set((r as any).stage_id, arr);
      }
    }
  }

  const stageOut: StageOut[] = stages.map((s) => {
    const stageMatches = matchesByStage.get(s.id) ?? [];
    let standings: StandingOut[] | null = null;

    if (SWISS_LIKE.has(s.stage_type)) {
      const teamLites = stageTeamsByStage.get(s.id) ?? [];
      const participants = teamLites.map((t) => ({ id: t.id, name: t.name }));

      const swissResults: SwissMatchResult[] = [];
      for (const m of stageMatches) {
        if (m.status !== 'finished' && m.status !== 'walkover') continue;
        if (!m.team1?.id) continue;
        if (m.isBye) {
          swissResults.push({
            round: m.roundNumber ?? 0,
            player1Id: m.team1.id,
            player2Id: null,
            player1Score: 1,
            player2Score: 0,
          });
          continue;
        }
        if (!m.team2?.id) continue;
        const pts = tournamentPointsFromMatch(m.team1Score, m.team2Score);
        if (!pts) continue;
        swissResults.push({
          round: m.roundNumber ?? 0,
          player1Id: m.team1.id,
          player2Id: m.team2.id,
          player1Score: pts.p1,
          player2Score: pts.p2,
        });
      }

      const ranked = rankSwissStandings(
        computeSwissStandings({ participants, results: swissResults })
      );
      standings = ranked.map((r) => ({
        rank: r.rank,
        teamId: r.id,
        teamName: r.name ?? '',
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        score: r.score,
        buchholz: r.buchholz,
      }));
    }

    return {
      id: s.id,
      name: s.name,
      slug: s.slug ?? null,
      stageType: s.stage_type,
      orderIndex: s.order_index ?? 0,
      startDate: s.start_date ?? null,
      endDate: s.end_date ?? null,
      matches: stageMatches,
      standings,
    };
  });

  return res.status(200).json({ tournament, stages: stageOut });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-tournament-bracket' },
});
