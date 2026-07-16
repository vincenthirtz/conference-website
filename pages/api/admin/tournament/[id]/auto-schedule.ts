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
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';
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
  /**
   * Si le scheduler detecte des conflits (meme equipe sur 2 creneaux qui
   * se chevauchent), on refuse d'ecrire le planning sauf si l'admin a
   * confirme explicitement en renvoyant true.
   */
  acceptConflicts?: boolean;
};

type ScheduledEntry = {
  matchId: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  format: MatchFormat;
};

type ConflictEntry = {
  matchId1: string;
  matchId2: string;
  teamId: string;
  overlapStart: string;
  overlapEnd: string;
};

type AutoScheduleResponse = {
  tournamentId: string;
  scheduled: ScheduledEntry[];
  unscheduledMatchIds: string[];
  conflicts?: ConflictEntry[];
  warnings?: string[];
};

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tournament-auto-schedule' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | AutoScheduleResponse
    | { error: string; detail?: string; conflicts?: ConflictEntry[] }
  >,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
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
      .eq('tenant_id', ctx.tenantId)
      .neq('status', 'cancelled');

    if (mErr) {
      logger.error('auto-schedule: fetch matches error', mErr);
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

    // 3) Inclure les matchs déjà planifiés comme "locked" pour éviter
    //    le double-booking (une équipe programmée au même créneau)
    const alreadyScheduledRows = allMatches.filter(
      (m) => !m.is_bye && m.scheduled_at && m.status !== 'cancelled'
    );

    const lockedMatches: MatchToSchedule[] = alreadyScheduledRows.map((m) => ({
      id: m.id,
      tournamentId: m.tournament_id,
      stageId: m.stage_id,
      team1Id: m.team1_id,
      team2Id: m.team2_id,
      format: (m.match_format || 'bo3') as MatchFormat,
      resourceId: null,
      roundNumber: m.round_number ?? undefined,
      priority: m.round_number ?? undefined,
      pinnedStartAt: m.scheduled_at,
      locked: true,
    }));

    // Transformer les matchs à scheduler
    const matchesToSchedule: MatchToSchedule[] = [
      ...lockedMatches,
      ...toScheduleRows.map((m) => ({
        id: m.id,
        tournamentId: m.tournament_id,
        stageId: m.stage_id,
        team1Id: m.team1_id,
        team2Id: m.team2_id,
        format: (m.match_format || 'bo3') as MatchFormat,
        resourceId: null,
        roundNumber: m.round_number ?? undefined,
        priority: m.round_number ?? undefined,
        pinnedStartAt: null as string | null,
        locked: false,
      })),
    ];

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

    // 5b) Vérifier si les matchs planifiés tombent hors des dates du tournoi
    const warnings: string[] = [];
    {
      const { data: tournament } = await supabaseAdmin
        .from('tournaments')
        .select('start_date, end_date')
        .eq('id', tournamentId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();

      if (tournament) {
        const startLimit = tournament.start_date
          ? new Date(tournament.start_date).getTime()
          : null;
        const endLimit = tournament.end_date
          ? new Date(tournament.end_date).getTime()
          : null;
        let outOfRange = 0;

        for (const s of result.scheduled) {
          const t = new Date(s.startAt).getTime();
          if ((startLimit && t < startLimit) || (endLimit && t > endLimit)) {
            outOfRange++;
          }
        }

        if (outOfRange > 0) {
          warnings.push(
            `${outOfRange} match(s) planifié(s) en dehors des dates du tournoi (${tournament.start_date ?? '?'} — ${tournament.end_date ?? '?'})`
          );
        }
      }
    }

    // 6a) Garde-fou : ne PAS ecrire si le scheduler a produit des conflits
    //     (meme equipe bookee sur deux creneaux qui se chevauchent), sauf
    //     si l'admin l'a explicitement accepte. On retourne quand meme le
    //     planning calcule + les conflits pour que l'UI puisse demander
    //     confirmation et renvoyer acceptConflicts=true.
    if (result.conflicts.length > 0 && body.acceptConflicts !== true) {
      return res.status(409).json({
        error: `${result.conflicts.length} conflit(s) horaire(s) detecte(s) — confirme l’application en renvoyant acceptConflicts=true.`,
        detail: 'SCHEDULE_CONFLICTS_REQUIRE_CONFIRMATION',
        conflicts: result.conflicts,
      });
    }

    // 6b) Appliquer les mises à jour de scheduled_at
    const updates = result.scheduled.map((s) =>
      supabaseAdmin
        .from('matches')
        .update({
          scheduled_at: s.startAt,
        })
        .eq('id', s.matchId)
        .eq('tenant_id', ctx.tenantId)
    );

    if (updates.length > 0) {
      const updateResults = await Promise.all(updates);
      updateResults.forEach((r, idx) => {
        if (r.error) {
          logger.error(
            'auto-schedule: update match scheduled_at error',
            result.scheduled[idx].matchId,
            r.error
          );
        }
      });
    }

    // 7) Log staff (incluant la decision sur les conflits pour audit)
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
            conflicts_count: result.conflicts.length,
            scheduled_match_ids: result.scheduled.map((s) => s.matchId),
            unscheduled_match_ids: result.unscheduledMatchIds,
            ...(result.conflicts.length > 0
              ? { accepted_with_conflicts: true }
              : {}),
          },
        });
      } catch (e) {
        logger.error('auto-schedule: logStaffAction error', e);
      }
    }

    const response: AutoScheduleResponse = {
      tournamentId,
      scheduled: result.scheduled,
      unscheduledMatchIds: result.unscheduledMatchIds,
      ...(result.conflicts.length > 0 ? { conflicts: result.conflicts } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    return res.status(200).json(response);
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/auto-schedule] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
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
