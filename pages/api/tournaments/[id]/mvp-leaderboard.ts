// pages/api/tournaments/[id]/mvp-leaderboard.ts
// Endpoint public : agrege les MVP gagnants des matchs termines d'un tournoi
// pour produire un classement (nb de MVP par joueur).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';

import { logger } from '../../../../utils/logger';
type LeaderboardEntry = {
  memberId: string | null;
  battleTag: string | null;
  teamId: string | null;
  teamName: string | null;
  mvpCount: number;
  matchIds: string[];
};

type ApiResponse =
  | {
      tournamentId: string;
      tournamentName: string | null;
      totalMvpAwards: number;
      totalFinishedMatches: number;
      leaderboard: LeaderboardEntry[];
      perMatch: Array<{
        matchId: string;
        roundName: string | null;
        completedAt: string | null;
        memberId: string | null;
        battleTag: string | null;
        teamId: string | null;
        teamName: string | null;
      }>;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const tournamentId = String(id);
  const tenantId = resolveTenantIdForPublicRequest(req);

  try {
    // Charger le tournoi (juste pour le nom + verifier qu'il est public)
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, is_public')
      .eq('id', tournamentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tErr || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (!tournament.is_public) {
      return res
        .status(404)
        .json({ error: 'Tournament not found or not public' });
    }

    // Charger les matchs termines du tournoi avec leurs MVP polls (winner_member_id non null)
    const { data: matches } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id,
        round_name,
        completed_at,
        team1_id,
        team2_id,
        status,
        mvp:match_mvp_polls(winner_member_id, winner_battle_tag)
        `
      )
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', tenantId)
      .eq('status', 'finished')
      .order('completed_at', { ascending: false });

    const finishedMatches = matches || [];

    // Collecter les member ids pour fetch leurs teams
    type RawPoll = {
      winner_member_id: string | null;
      winner_battle_tag: string | null;
    };
    const enriched = finishedMatches.map((m: any) => {
      const poll: RawPoll | null = Array.isArray(m.mvp)
        ? (m.mvp[0] ?? null)
        : (m.mvp ?? null);
      return {
        matchId: m.id as string,
        roundName: (m.round_name ?? null) as string | null,
        completedAt: (m.completed_at ?? null) as string | null,
        team1Id: (m.team1_id ?? null) as string | null,
        team2Id: (m.team2_id ?? null) as string | null,
        memberId: poll?.winner_member_id ?? null,
        battleTag: poll?.winner_battle_tag ?? null,
      };
    });

    const memberIds = Array.from(
      new Set(enriched.map((e) => e.memberId).filter((x): x is string => !!x))
    );

    // Fetch team_members pour resoudre team_id par memberId
    let memberToTeam = new Map<string, string>();
    if (memberIds.length > 0) {
      const { data: members } = await supabaseAdmin
        .from('team_members')
        .select('id, team_id, battle_tag')
        .eq('tenant_id', tenantId)
        .in('id', memberIds);
      for (const m of members || []) {
        memberToTeam.set(m.id, m.team_id);
      }
    }

    // Fetch noms d'equipes
    const allTeamIds = Array.from(
      new Set(
        [
          ...Array.from(memberToTeam.values()),
          ...enriched.flatMap((e) =>
            [e.team1Id, e.team2Id].filter((x): x is string => !!x)
          ),
        ].filter(Boolean)
      )
    );

    let teamNameMap = new Map<string, string>();
    if (allTeamIds.length > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('id', allTeamIds);
      for (const t of teams || []) teamNameMap.set(t.id, t.name);
    }

    // Construire perMatch (un par match termine, MVP eventuellement null)
    const perMatch = enriched.map((e) => {
      const teamId = e.memberId ? (memberToTeam.get(e.memberId) ?? null) : null;
      return {
        matchId: e.matchId,
        roundName: e.roundName,
        completedAt: e.completedAt,
        memberId: e.memberId,
        battleTag: e.battleTag,
        teamId,
        teamName: teamId ? (teamNameMap.get(teamId) ?? null) : null,
      };
    });

    // Construire le leaderboard : agreger par memberId (fallback battleTag pour
    // les cas ou le membre a ete supprime mais le snapshot battle_tag existe).
    type LbAcc = {
      memberId: string | null;
      battleTag: string | null;
      teamId: string | null;
      teamName: string | null;
      mvpCount: number;
      matchIds: string[];
    };
    const lbMap = new Map<string, LbAcc>();

    for (const e of perMatch) {
      if (!e.memberId && !e.battleTag) continue; // pas de MVP saisi
      const key = e.memberId || `bt:${e.battleTag}`;
      const cur = lbMap.get(key);
      if (cur) {
        cur.mvpCount += 1;
        cur.matchIds.push(e.matchId);
      } else {
        lbMap.set(key, {
          memberId: e.memberId,
          battleTag: e.battleTag,
          teamId: e.teamId,
          teamName: e.teamName,
          mvpCount: 1,
          matchIds: [e.matchId],
        });
      }
    }

    const leaderboard: LeaderboardEntry[] = Array.from(lbMap.values()).sort(
      (a, b) => {
        if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
        return (a.battleTag || '').localeCompare(b.battleTag || '');
      }
    );

    return res.status(200).json({
      tournamentId,
      tournamentName: tournament.name,
      totalMvpAwards: leaderboard.reduce((sum, l) => sum + l.mvpCount, 0),
      totalFinishedMatches: finishedMatches.length,
      leaderboard,
      perMatch,
    });
  } catch (err: unknown) {
    logger.error('[/api/tournaments/[id]/mvp-leaderboard] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
