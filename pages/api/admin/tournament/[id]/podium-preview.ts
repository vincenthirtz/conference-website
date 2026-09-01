// pages/api/admin/tournament/[id]/podium-preview.ts
// GET : retourne les candidats au podium + une proposition de ranking
//       (best-effort, basée sur le dernier stage), et l'éventuel ranking
//       déjà figé en base. Utilisé par l'écran /admin/tournament/[id]/podium
//       pour pré-remplir le formulaire de clôture.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

type Candidate = {
  team_id: string;
  team_name: string;
  team_short_name: string | null;
  team_logo_url: string | null;
  proposed_rank: number | null;
  source: 'bracket_final' | 'bracket_semi' | 'manual' | null;
};

type ExistingRanking = {
  team_id: string;
  team_name: string;
  rank: number;
  prize: string | null;
  notes: string | null;
  frozen_at: string;
};

type ApiResponse =
  | {
      tournament: { id: string; name: string; status: string };
      candidates: Candidate[];
      existing: ExistingRanking[];
      last_stage_type: string | null;
    }
  | { error: string };

export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const tournamentId = String(id);

  try {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const [ttRes, stagesRes, existingRes] = await Promise.all([
      supabaseAdmin
        .from('tournament_teams')
        .select('team_id')
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', ctx.tenantId),
      supabaseAdmin
        .from('tournament_stages')
        .select('id, stage_type, order_index')
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', ctx.tenantId)
        .order('order_index', { ascending: false })
        .limit(1),
      supabaseAdmin
        .from('final_rankings')
        .select(
          'team_id, rank, prize, notes, frozen_at, teams:teams!inner(name)'
        )
        .eq('tournament_id', tournamentId)
        .order('rank', { ascending: true }),
    ]);

    type TeamEmbed = {
      id: string;
      name: string;
      short_name: string | null;
      logo_url: string | null;
    };
    const teamIds = (ttRes.data ?? []).map((r: any) => r.team_id as string);
    const teamsById = new Map<string, TeamEmbed>();
    if (teamIds.length > 0) {
      const { data: teamRows } = await supabaseAdmin
        .from('teams')
        .select('id, name, short_name, logo_url')
        .in('id', teamIds)
        .eq('tenant_id', ctx.tenantId);
      for (const t of (teamRows ?? []) as any[]) {
        teamsById.set(t.id, {
          id: t.id,
          name: t.name,
          short_name: t.short_name ?? null,
          logo_url: t.logo_url ?? null,
        });
      }
    }

    const candidates = new Map<string, Candidate>();
    for (const tid of teamIds) {
      const team = teamsById.get(tid);
      candidates.set(tid, {
        team_id: tid,
        team_name: team?.name ?? 'Équipe inconnue',
        team_short_name: team?.short_name ?? null,
        team_logo_url: team?.logo_url ?? null,
        proposed_rank: null,
        source: null,
      });
    }

    const lastStage = (stagesRes.data ?? [])[0] ?? null;
    const lastStageType = lastStage?.stage_type ?? null;

    // Best-effort suggestion : on déduit 1er/2e (et 3e/4e si possible) à
    // partir du dernier bracket. Pour les autres types de stage (swiss,
    // round_robin, group), pas de suggestion auto en V1 — l'admin remplit.
    if (lastStage && lastStage.stage_type === 'bracket') {
      const { data: bracketMatches } = await supabaseAdmin
        .from('matches')
        .select(
          'id, round_number, round_name, bracket_side, team1_id, team2_id, winner_team_id, status'
        )
        .eq('stage_id', lastStage.id)
        .eq('tenant_id', ctx.tenantId)
        .eq('status', 'finished');

      if (bracketMatches && bracketMatches.length > 0) {
        // La grande finale = match au plus haut round_number, side != 'lower'
        const finalCandidates = bracketMatches.filter(
          (m) => m.bracket_side !== 'lower' && m.winner_team_id
        );
        finalCandidates.sort(
          (a, b) => (b.round_number ?? 0) - (a.round_number ?? 0)
        );
        const grandFinal = finalCandidates[0];

        if (grandFinal && grandFinal.winner_team_id) {
          const winnerId = grandFinal.winner_team_id;
          const loserId =
            grandFinal.team1_id === winnerId
              ? grandFinal.team2_id
              : grandFinal.team1_id;

          const winner = candidates.get(winnerId);
          if (winner) {
            winner.proposed_rank = 1;
            winner.source = 'bracket_final';
          }
          if (loserId) {
            const loser = candidates.get(loserId);
            if (loser) {
              loser.proposed_rank = 2;
              loser.source = 'bracket_final';
            }
          }

          // Semi-finalistes : round_number = grandFinal.round_number - 1
          const semiRound = (grandFinal.round_number ?? 0) - 1;
          if (semiRound > 0) {
            const semis = bracketMatches.filter(
              (m) =>
                m.bracket_side !== 'lower' &&
                m.round_number === semiRound &&
                m.winner_team_id
            );
            const semiLosers = semis
              .map((m) =>
                m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id
              )
              .filter((id): id is string => Boolean(id))
              .filter((id) => id !== winnerId && id !== loserId);

            // V1 : on propose rank 3 et 4 (ex-aequo non géré, l'admin ajuste).
            let nextRank = 3;
            for (const sid of semiLosers) {
              const t = candidates.get(sid);
              if (t && t.proposed_rank === null) {
                t.proposed_rank = nextRank++;
                t.source = 'bracket_semi';
              }
            }
          }
        }
      }
    }

    type ExistingRow = {
      team_id: string;
      rank: number;
      prize: string | null;
      notes: string | null;
      frozen_at: string;
      teams: { name: string } | { name: string }[] | null;
    };
    const existingRows = (existingRes.data ?? []) as ExistingRow[];

    const existing: ExistingRanking[] = existingRows.map((r) => {
      const teamObj = Array.isArray(r.teams) ? r.teams[0] : r.teams;
      return {
        team_id: r.team_id,
        team_name: teamObj?.name ?? 'Équipe inconnue',
        rank: r.rank,
        prize: r.prize,
        notes: r.notes,
        frozen_at: r.frozen_at,
      };
    });

    return res.status(200).json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status ?? 'draft',
      },
      candidates: Array.from(candidates.values()).sort((a, b) => {
        if (a.proposed_rank === null && b.proposed_rank === null) {
          return a.team_name.localeCompare(b.team_name);
        }
        if (a.proposed_rank === null) return 1;
        if (b.proposed_rank === null) return -1;
        return a.proposed_rank - b.proposed_rank;
      }),
      existing,
      last_stage_type: lastStageType,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/podium-preview] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
