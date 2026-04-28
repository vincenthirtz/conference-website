// pages/api/admin/tournament/[id]/conflicts.ts
// Détecte les conflits de planning dans un tournoi :
// - Une équipe qui joue deux matchs au même moment (chevauchement)
// GET : retourne la liste des conflits détectés

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import type { MatchFormat } from '@/types/matches';

type ScheduledMatch = {
  id: string;
  stage_id: string | null;
  stage_name: string | null;
  round_number: number | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_name: string | null;
  team2_name: string | null;
  scheduled_at: string;
  estimated_end: string;
};

type Conflict = {
  type: 'team_overlap';
  team_id: string;
  team_name: string;
  match_a: {
    id: string;
    scheduled_at: string;
    estimated_end: string;
    stage_name: string | null;
    round_number: number | null;
  };
  match_b: {
    id: string;
    scheduled_at: string;
    estimated_end: string;
    stage_name: string | null;
    round_number: number | null;
  };
  overlap_minutes: number;
};

type ApiResponse =
  | { conflicts: Conflict[]; total: number; checked_matches: number }
  | { error: string };

const DURATION_DEFAULTS: Record<string, number> = {
  bo1: 20,
  bo2: 30,
  bo3: 45,
  bo5: 70,
  bo7: 95,
};

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  _ctx: any
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
    // Fetch all scheduled, non-cancelled, non-bye matches with team names
    const { data: matchesData, error: mErr } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id,
        stage_id,
        round_number,
        match_format,
        team1_id,
        team2_id,
        scheduled_at,
        is_bye,
        status,
        team1:teams!matches_team1_id_fkey(name),
        team2:teams!matches_team2_id_fkey(name)
      `
      )
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled')
      .not('scheduled_at', 'is', null);

    if (mErr) {
      console.error('conflicts: fetch matches error', mErr);
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }

    // Fetch stage names for display
    const { data: stagesData } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, name')
      .eq('tournament_id', tournamentId);

    const stageMap = new Map<string, string>();
    if (stagesData) {
      for (const s of stagesData) {
        stageMap.set(s.id, s.name);
      }
    }

    const matches: ScheduledMatch[] = (matchesData || [])
      .filter((m: any) => !m.is_bye && m.scheduled_at)
      .map((m: any) => {
        const format = (m.match_format || 'bo3') as MatchFormat;
        const durationMin = DURATION_DEFAULTS[format] ?? 45;
        const start = new Date(m.scheduled_at);
        const end = new Date(start.getTime() + durationMin * 60_000);

        return {
          id: m.id,
          stage_id: m.stage_id,
          stage_name: m.stage_id ? (stageMap.get(m.stage_id) ?? null) : null,
          round_number: m.round_number,
          match_format: m.match_format,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
          team1_name: m.team1?.name ?? null,
          team2_name: m.team2?.name ?? null,
          scheduled_at: m.scheduled_at,
          estimated_end: end.toISOString(),
        };
      });

    // Build team -> matches index
    const teamMatches = new Map<string, ScheduledMatch[]>();
    for (const m of matches) {
      if (m.team1_id) {
        if (!teamMatches.has(m.team1_id)) teamMatches.set(m.team1_id, []);
        teamMatches.get(m.team1_id)!.push(m);
      }
      if (m.team2_id) {
        if (!teamMatches.has(m.team2_id)) teamMatches.set(m.team2_id, []);
        teamMatches.get(m.team2_id)!.push(m);
      }
    }

    // Detect overlaps per team
    const conflicts: Conflict[] = [];
    const seenPairs = new Set<string>();

    for (const [teamId, tMatches] of teamMatches) {
      if (tMatches.length < 2) continue;

      // Sort by scheduled_at
      tMatches.sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
      );

      for (let i = 0; i < tMatches.length; i++) {
        for (let j = i + 1; j < tMatches.length; j++) {
          const a = tMatches[i];
          const b = tMatches[j];

          const aEnd = new Date(a.estimated_end).getTime();
          const bStart = new Date(b.scheduled_at).getTime();

          if (bStart < aEnd) {
            // Overlap detected - deduplicate by match pair
            const pairKey = [a.id, b.id].sort().join(':');
            const conflictKey = `${teamId}:${pairKey}`;
            if (seenPairs.has(conflictKey)) continue;
            seenPairs.add(conflictKey);

            const overlapMs = aEnd - bStart;
            const teamName =
              a.team1_id === teamId
                ? (a.team1_name ?? teamId)
                : (a.team2_name ?? teamId);

            conflicts.push({
              type: 'team_overlap',
              team_id: teamId,
              team_name: teamName,
              match_a: {
                id: a.id,
                scheduled_at: a.scheduled_at,
                estimated_end: a.estimated_end,
                stage_name: a.stage_name,
                round_number: a.round_number,
              },
              match_b: {
                id: b.id,
                scheduled_at: b.scheduled_at,
                estimated_end: b.estimated_end,
                stage_name: b.stage_name,
                round_number: b.round_number,
              },
              overlap_minutes: Math.ceil(overlapMs / 60_000),
            });
          } else {
            // Since sorted, no further overlaps for match a
            break;
          }
        }
      }
    }

    // Sort conflicts by first match start time
    conflicts.sort(
      (a, b) =>
        new Date(a.match_a.scheduled_at).getTime() -
        new Date(b.match_a.scheduled_at).getTime()
    );

    return res.status(200).json({
      conflicts,
      total: conflicts.length,
      checked_matches: matches.length,
    });
  } catch (err: unknown) {
    console.error('[/api/admin/tournament/[id]/conflicts] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
