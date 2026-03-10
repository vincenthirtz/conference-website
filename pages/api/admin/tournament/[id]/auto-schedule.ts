// pages/api/admin/tournament/[id]/auto-schedule.ts
// Auto-scheduler admin pour les matchs d'un tournoi.
//
// POST : génère un planning pour les matchs non planifiés d’un tournoi
//        en utilisant lib/matches/autoScheduler.ts
//
// Body attendu (exemples) :
//
// 1) Configuration simple d’une journée :
// {
//   "startDay": "2025-02-01",
//   "daysCount": 1,
//   "startTime": "18:00",
//   "endTime": "23:00"
// }
//
// 2) Plusieurs fenêtres précises :
// {
//   "windows": [
//     { "start": "2025-02-01T18:00:00.000Z", "end": "2025-02-01T21:00:00.000Z" },
//     { "start": "2025-02-02T18:00:00.000Z", "end": "2025-02-02T23:00:00.000Z" }
//   ],
//   "resourceGapMinutes": 10,
//   "teamRestMinutes": 20,
//   "estimatedDurationsMinutes": { "bo1": 20, "bo3": 45 }
// }
//
// Comportement :
// - ne prend en compte que les matchs du tournoi avec scheduled_at IS NULL
//   et status != 'cancelled' et is_bye != true
// - écrit scheduled_at = startAt (ISO) sur les matchs planifiés
// - renvoie la liste des matchs planifiés + ceux non planifiés

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  autoScheduleMatches,
  makeMultiDayWindows,
} from '@/utils/matches/autoScheduler';
import type {
  MatchToSchedule,
  AutoSchedulerConfig,
  MatchFormat,
  MatchStatus,
} from '@/types/matches';

type DbMatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  match_format: string | null;
  round_number: number | null;
  group_key: string | null;
  bracket_side: string | null;
  team1_id: string | null;
  team2_id: string | null;
  scheduled_at: string | null;
};

type AutoScheduleBody = {
  windows?: { start: string; end: string }[];
  startDay?: string;
  daysCount?: number;
  startTime?: string;
  endTime?: string;
  estimatedDurationsMinutes?: Partial<Record<MatchFormat, number>>;
  resourceGapMinutes?: number;
  teamRestMinutes?: number;
  defaultResourceId?: string;
};

type AutoScheduleResponse = {
  tournamentId: string;
  scheduled: {
    matchId: string;
    resourceId: string;
    startAt: string;
    endAt: string;
    format: MatchFormat;
  }[];
  unscheduledMatchIds: string[];
};

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    AutoScheduleResponse | { error: string; detail?: string }
  >,
  ctx: any
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tournamentId = String(id);

  try {
    const body = (req.body || {}) as AutoScheduleBody;

    // 1) Construire les time windows
    const windows = buildWindowsFromBody(body);
    if (windows.length === 0) {
      return res.status(400).json({
        error:
          'No valid time windows provided. Provide either `windows` or (`startDay`, `daysCount`, `startTime`, `endTime`).',
      });
    }

    // 2) Récupérer les matchs non planifiés du tournoi
    const { data: matchesData, error: mErr } = await supabaseAdmin
      .from('matches')
      .select(
        `
          id,
          tournament_id,
          stage_id,
          status,
          is_bye,
          match_format,
          round_number,
          group_key,
          bracket_side,
          team1_id,
          team2_id,
          scheduled_at
        `
      )
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled');

    if (mErr) {
      console.error('auto-schedule: fetch matches error', mErr);
      return res.status(500).json({
        error: 'Failed to fetch matches',
      });
    }

    const allMatches = (matchesData || []) as DbMatchRow[];

    const toScheduleRows = allMatches.filter(
      (m) => !m.is_bye && !m.scheduled_at
    );

    if (toScheduleRows.length === 0) {
      return res.status(200).json({
        tournamentId,
        scheduled: [],
        unscheduledMatchIds: [],
      });
    }

    // 3) Transformer en MatchToSchedule pour l'algo
    const matchesToSchedule: MatchToSchedule[] = toScheduleRows.map((m) => ({
      id: m.id,
      tournamentId: m.tournament_id,
      stageId: m.stage_id,
      team1Id: m.team1_id,
      team2Id: m.team2_id,
      format: (m.match_format || 'bo3') as MatchFormat,
      resourceId: null, // on laisse la config définir defaultResourceId
      roundNumber: m.round_number ?? undefined,
      priority: m.round_number ?? undefined,
      pinnedStartAt: null,
      locked: false,
    }));

    // 4) Construire la config de scheduler
    const config: AutoSchedulerConfig = {
      windows,
      estimatedDurationsMinutes: body.estimatedDurationsMinutes ?? {},
      resourceGapMinutes:
        typeof body.resourceGapMinutes === 'number'
          ? body.resourceGapMinutes
          : 5,
      teamRestMinutes:
        typeof body.teamRestMinutes === 'number' ? body.teamRestMinutes : 15,
      defaultResourceId: body.defaultResourceId ?? 'default',
    };

    // 5) Appeler l'autoscheduler
    const result = autoScheduleMatches(matchesToSchedule, config);

    // 6) Appliquer les mises à jour de scheduled_at
    const updates = result.scheduled.map((s) =>
      supabaseAdmin
        .from('matches')
        .update({
          scheduled_at: s.startAt,
        })
        .eq('id', s.matchId)
    );

    if (updates.length > 0) {
      const updateResults = await Promise.all(updates);
      updateResults.forEach((r, idx) => {
        if (r.error) {
          console.error(
            'auto-schedule: update match scheduled_at error',
            result.scheduled[idx].matchId,
            r.error
          );
        }
      });
    }

    // 7) Log staff
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'staff_batch_action',
          entity_type: 'match_auto_schedule',
          entity_id: null,
          tournament_id: tournamentId,
          payload: {
            scheduled_count: result.scheduled.length,
            unscheduled_count: result.unscheduledMatchIds.length,
            scheduled_match_ids: result.scheduled.map((s) => s.matchId),
            unscheduled_match_ids: result.unscheduledMatchIds,
          },
        });
      } catch (e) {
        console.error('auto-schedule: logStaffAction error', e);
      }
    }

    const response: AutoScheduleResponse = {
      tournamentId,
      scheduled: result.scheduled,
      unscheduledMatchIds: result.unscheduledMatchIds,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/auto-schedule] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function buildWindowsFromBody(body: AutoScheduleBody) {
  // 1) Cas où l'on fournit directement des windows ISO
  if (Array.isArray(body.windows) && body.windows.length > 0) {
    return body.windows
      .map((w) => {
        try {
          const start = new Date(w.start);
          const end = new Date(w.end);
          if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
            return null;
          }
          return { start, end };
        } catch {
          return null;
        }
      })
      .filter((x): x is { start: Date; end: Date } => x !== null);
  }

  // 2) Sinon, on essaie de construire à partir de startDay + daysCount + startTime + endTime
  if (body.startDay && body.startTime && body.endTime) {
    const days =
      typeof body.daysCount === 'number' && body.daysCount > 0
        ? body.daysCount
        : 1;

    return makeMultiDayWindows(
      body.startDay,
      days,
      body.startTime,
      body.endTime
    );
  }

  // 3) Fallback : aucune fenêtre valide
  return [];
}
