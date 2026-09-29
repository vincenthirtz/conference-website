// features/admin/tournaments/service/schedule.ts — planning d'un tournoi :
// auto-scheduler, déplacement avec aperçu d'impact, diagnostic, contraintes
// de disponibilité, conflits d'équipe.
//
// Le calcul reste dans les moteurs partagés (utils/matches/autoScheduler,
// scheduleDiagnostics, scheduleContext) : ce service charge, appelle, écrit.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { firstString } from '@/utils/admin/pathParams';
import {
  emitScheduleEvents,
  emitScheduleEventsInBackground,
} from '@/utils/matches/scheduleEvents';
import { loadScheduleContext } from '@/utils/matches/scheduleContext';
import {
  diagnoseSchedule,
  previewMoves,
} from '@/utils/matches/scheduleDiagnostics';
import type { AvailabilityConstraint } from '@/utils/matches/availability';
import {
  rowToConstraint,
  type AvailabilityRow,
} from '@/utils/matches/availabilityRows';
import {
  autoScheduleMatches,
  makeMultiDayWindows,
  DEFAULT_MATCH_DURATIONS_MINUTES,
} from '@/utils/matches/autoScheduler';
import type {
  MatchToSchedule,
  AutoSchedulerConfig,
  MatchFormat,
} from '@/types/matches';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { Audited } from '../../_shared/audited';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/matches';
import { ScheduleMoveSchema } from '../schemas';
import { fail, failWith } from './common';

/* ---------------------------------------------------------------------------
 * Auto-scheduler
 * ------------------------------------------------------------------------ */

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
  /** Écrire malgré des conflits d'équipe : confirmation explicite. */
  acceptConflicts?: boolean;
  /** SIMULATION : calcule et renvoie le planning SANS RIEN ÉCRIRE. */
  dryRun?: boolean;
  /** Ignorer les contraintes de disponibilité (comparaison « sans »). */
  ignoreTeamConstraints?: boolean;
};

function buildWindowsFromBody(body: AutoScheduleBody) {
  if (Array.isArray(body.windows) && body.windows.length > 0) {
    return body.windows
      .map((w) => {
        try {
          const start = new Date(w.start);
          const end = new Date(w.end);
          if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            end <= start
          ) {
            return null;
          }
          return { start, end };
        } catch {
          return null;
        }
      })
      .filter((x): x is { start: Date; end: Date } => x !== null);
  }
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
  return [];
}

type SchedulerResult = ReturnType<typeof autoScheduleMatches>;

export type AutoScheduleResponse = {
  tournamentId: string;
  scheduled: SchedulerResult['scheduled'];
  unscheduledMatchIds: string[];
  conflicts?: SchedulerResult['conflicts'];
  warnings?: string[];
  /** Présent et `true` uniquement en simulation : rien n'a été écrit. */
  dryRun?: boolean;
  /** Nombre de contraintes d'équipe prises en compte par le calcul. */
  constraintCount?: number;
};

export async function autoSchedule(
  ctx: ServiceContext,
  tournamentId: string,
  rawBody: Record<string, unknown>
): Promise<Audited<AutoScheduleResponse>> {
  const body = rawBody as AutoScheduleBody;
  const windows = buildWindowsFromBody(body);
  if (windows.length === 0) {
    fail(
      400,
      'No valid time windows provided. Provide either `windows` or (`startDay`, `daysCount`, `startTime`, `endTime`).'
    );
  }

  const { data: matchesData, error: mErr } = await repo.schedulableMatches(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (mErr) {
    ctx.logger.error('auto-schedule: fetch matches error', mErr);
    fail(500, 'Failed to fetch matches');
  }
  const allMatches = matchesData ?? [];
  const toScheduleRows = allMatches.filter((m) => !m.is_bye && !m.scheduled_at);
  if (toScheduleRows.length === 0) {
    return {
      result: { tournamentId, scheduled: [], unscheduledMatchIds: [] },
      audit: { skip: true },
    } satisfies Audited<unknown>;
  }

  // Matchs déjà planifiés : verrouillés, pour éviter le double-booking.
  const toMatch = (
    m: (typeof allMatches)[number],
    locked: boolean
  ): MatchToSchedule => ({
    id: m.id,
    tournamentId: m.tournament_id as string,
    stageId: m.stage_id,
    team1Id: m.team1_id,
    team2Id: m.team2_id,
    format: (m.match_format || 'bo3') as MatchFormat,
    resourceId: null,
    roundNumber: m.round_number ?? undefined,
    priority: m.round_number ?? undefined,
    pinnedStartAt: locked ? m.scheduled_at : null,
    locked,
  });
  const matchesToSchedule: MatchToSchedule[] = [
    ...allMatches
      .filter((m) => !m.is_bye && m.scheduled_at && m.status !== 'cancelled')
      .map((m) => toMatch(m, true)),
    ...toScheduleRows.map((m) => toMatch(m, false)),
  ];

  // Contraintes de disponibilité des équipes (lot 1) : sans elles, le
  // planning produit était aussitôt refusé par le diagnostic.
  let teamConstraints: AvailabilityConstraint[] = [];
  if (body.ignoreTeamConstraints !== true) {
    const teamIds = [
      ...new Set(
        matchesToSchedule
          .flatMap((m) => [m.team1Id, m.team2Id])
          .filter((v): v is string => Boolean(v))
      ),
    ];
    if (teamIds.length > 0) {
      const { data: rows, error: cErr } = await repo.availabilityConstraints(
        ctx.db,
        ctx.tenantId,
        tournamentId,
        teamIds,
        false
      );
      if (cErr)
        ctx.logger.error('auto-schedule: constraints fetch error', cErr);
      else {
        teamConstraints = ((rows ?? []) as AvailabilityRow[]).map(
          rowToConstraint
        );
      }
    }
  }

  const config: AutoSchedulerConfig = {
    windows,
    teamConstraints,
    estimatedDurationsMinutes: body.estimatedDurationsMinutes ?? {},
    resourceGapMinutes:
      typeof body.resourceGapMinutes === 'number' ? body.resourceGapMinutes : 5,
    teamRestMinutes:
      typeof body.teamRestMinutes === 'number' ? body.teamRestMinutes : 15,
    defaultResourceId: body.defaultResourceId ?? 'default',
  };
  const result = autoScheduleMatches(matchesToSchedule, config);

  // Matchs planifiés hors des dates du tournoi : avertissement.
  const warnings: string[] = [];
  const { data: tournament } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tournament) {
    const startLimit = tournament.start_date
      ? new Date(tournament.start_date).getTime()
      : null;
    const endLimit = tournament.end_date
      ? new Date(tournament.end_date).getTime()
      : null;
    const outOfRange = result.scheduled.filter((s) => {
      const t = new Date(s.startAt).getTime();
      return (startLimit && t < startLimit) || (endLimit && t > endLimit);
    }).length;
    if (outOfRange > 0) {
      warnings.push(
        `${outOfRange} match(s) planifié(s) en dehors des dates du tournoi (${tournament.start_date ?? '?'} — ${tournament.end_date ?? '?'})`
      );
    }
  }

  const conflictsPart =
    result.conflicts.length > 0 ? { conflicts: result.conflicts } : {};
  const warningsPart = warnings.length > 0 ? { warnings } : {};

  // SIMULATION : avant le garde-fou des conflits — une simulation doit
  // pouvoir MONTRER les conflits.
  if (body.dryRun === true) {
    return {
      result: {
        tournamentId,
        dryRun: true,
        scheduled: result.scheduled,
        unscheduledMatchIds: result.unscheduledMatchIds,
        constraintCount: teamConstraints.length,
        ...conflictsPart,
        ...warningsPart,
      },
      audit: { skip: true },
    } satisfies Audited<unknown>;
  }

  if (result.conflicts.length > 0 && body.acceptConflicts !== true) {
    failWith(
      409,
      `${result.conflicts.length} conflit(s) horaire(s) detecte(s) — confirme l’application en renvoyant acceptConflicts=true.`,
      undefined,
      {
        detail: 'SCHEDULE_CONFLICTS_REQUIRE_CONFIRMATION',
        conflicts: result.conflicts,
      }
    );
  }

  const failedIds = new Set<string>();
  if (result.scheduled.length > 0) {
    const updateResults = await Promise.all(
      result.scheduled.map((s) =>
        repo.updateMatch(ctx.db, ctx.tenantId, s.matchId, {
          scheduled_at: s.startAt,
        })
      )
    );
    updateResults.forEach((r, idx) => {
      if (r.error) {
        failedIds.add(result.scheduled[idx].matchId);
        ctx.logger.error(
          'auto-schedule: update match scheduled_at error',
          result.scheduled[idx].matchId,
          r.error
        );
      }
    });
  }

  // Événements : seulement les écritures réussies dont le créneau a
  // RÉELLEMENT changé (comparaison à l'instant, dans le helper).
  const beforeById = new Map(allMatches.map((m) => [m.id, m.scheduled_at]));
  await emitScheduleEvents(
    result.scheduled
      .filter((s) => !failedIds.has(s.matchId) && beforeById.has(s.matchId))
      .map((s) => ({
        matchId: s.matchId,
        tournamentId,
        scrimId: null,
        previous: beforeById.get(s.matchId) ?? null,
        next: s.startAt,
      })),
    ctx.tenantId
  );

  return {
    result: {
      tournamentId,
      scheduled: result.scheduled,
      unscheduledMatchIds: result.unscheduledMatchIds,
      ...conflictsPart,
      ...warningsPart,
    },
    audit: {
      entity_type: 'match_auto_schedule',
      entity_id: null,
      tournament_id: tournamentId,
      payload: {
        scheduled_count: result.scheduled.length,
        unscheduled_count: result.unscheduledMatchIds.length,
        conflicts_count: result.conflicts.length,
        team_constraints_count: teamConstraints.length,
        scheduled_match_ids: result.scheduled.map((s) => s.matchId),
        unscheduled_match_ids: result.unscheduledMatchIds,
        ...(result.conflicts.length > 0
          ? { accepted_with_conflicts: true }
          : {}),
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Déplacement de matchs, aperçu d'impact d'abord (lot 5)
 * ------------------------------------------------------------------------ */

type MoveImpact = ReturnType<typeof previewMoves>;

export type MoveMatchesResult =
  | { impact: MoveImpact; applied: false }
  | { impact: MoveImpact; applied: true; moved: string[] }
  | {
      /** Écriture partielle : rendue en 500 par la route, journal écrit. */
      partial: {
        error: string;
        code: 'PARTIAL_WRITE';
        impact: MoveImpact;
        applied: string[];
        failed: string[];
      };
    };

export async function moveMatches(
  ctx: ServiceContext,
  tournamentId: string,
  rawBody: unknown
): Promise<Audited<MoveMatchesResult>> {
  const parsed = ScheduleMoveSchema.safeParse(rawBody);
  if (!parsed.success) {
    failWith(400, 'Invalid body.', 'INVALID_BODY', {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { moves, apply = false, force = false } = parsed.data;

  // Un match ne peut pas recevoir deux destinations dans la même requête.
  const ids = moves.map((m) => m.matchId);
  if (new Set(ids).size !== ids.length) {
    failWith(400, 'Un match apparaît deux fois.', 'DUPLICATE_MATCH');
  }

  const context = await loadScheduleContext(ctx.tenantId, tournamentId);
  if (!context) {
    failWith(404, 'Tournament not found', 'TOURNAMENT_NOT_FOUND');
  }
  const known = new Set(context.matches.map((m) => m.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    failWith(404, 'Match hors de ce tournoi.', 'MATCH_NOT_IN_TOURNAMENT', {
      matchIds: unknown,
    });
  }

  const impact = previewMoves(context.matches, context.constraints, moves, {
    timezone: context.tournament.timezone,
    tournamentStart: context.tournament.startDate,
    tournamentEnd: context.tournament.endDate,
    teamRestMinutes: parsed.data.rest ?? 30,
    maxConcurrentMatches: parsed.data.concurrent ?? 1,
  });

  // Aperçu seul (le DÉFAUT) : rien d'écrit, rien à journaliser.
  if (!apply) {
    return {
      result: { impact, applied: false as const },
      audit: { skip: true },
    } satisfies Audited<unknown>;
  }
  if (impact.createsBlocking && !force) {
    failWith(
      409,
      'Ce déplacement crée une anomalie bloquante.',
      'WOULD_CREATE_BLOCKING',
      { impact, applied: false }
    );
  }

  // Écriture match par match (PostgREST n'expose pas de transaction) : un
  // échec partiel est signalé, jamais avalé.
  const before = new Map(
    context.matches.map((m) => [m.id, m.scheduledAt ?? null])
  );
  const written: string[] = [];
  const failed: string[] = [];
  for (const move of moves) {
    const { error } = await repo.moveMatch(
      ctx.db,
      ctx.tenantId,
      tournamentId,
      move.matchId,
      move.scheduledAt
    );
    if (error) {
      ctx.logger.error('[admin/schedule-move] update failed', error, {
        matchId: move.matchId,
      });
      failed.push(move.matchId);
    } else {
      written.push(move.matchId);
    }
  }

  // Même contrat d'événements que le PATCH match (helper partagé).
  emitScheduleEventsInBackground(
    moves
      .filter((m) => written.includes(m.matchId))
      .map((m) => ({
        matchId: m.matchId,
        tournamentId,
        scrimId: null,
        previous: before.get(m.matchId) ?? null,
        next: m.scheduledAt,
      })),
    ctx.tenantId
  );

  const audit = {
    entity_type: 'tournament',
    entity_id: tournamentId,
    tournament_id: tournamentId,
    payload: {
      // Liste plate : retrouvable depuis la fiche d'UN match.
      match_ids: moves.map((m) => m.matchId),
      moves: moves.map((m) => ({
        match_id: m.matchId,
        from: before.get(m.matchId) ?? null,
        to: m.scheduledAt,
      })),
      // Ce que le staff SAVAIT en décidant.
      fixed: impact.fixed.length,
      broken: impact.broken.length,
      forced: force && impact.createsBlocking,
      failed: failed.length > 0 ? failed : undefined,
    },
  };

  if (failed.length > 0) {
    // Échec partiel : 500, mais le journal est écrit (comme avant) — les
    // déplacements réussis sont bien faits.
    return {
      result: {
        partial: {
          error: 'Certains déplacements ont échoué.',
          code: 'PARTIAL_WRITE' as const,
          impact,
          applied: written,
          failed,
        },
      },
      audit,
    } satisfies Audited<unknown>;
  }
  return {
    result: { impact, applied: true as const, moved: written },
    audit,
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Diagnostic de planning (lecture seule, lot 3)
 * ------------------------------------------------------------------------ */

function readInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const v = firstString(value);
  if (typeof v !== 'string') return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export async function diagnose(
  ctx: ServiceContext,
  tournamentId: string,
  query: Record<string, unknown>
) {
  const context = await loadScheduleContext(ctx.tenantId, tournamentId);
  if (!context) {
    failWith(404, 'Tournament not found', 'TOURNAMENT_NOT_FOUND');
  }
  const timezone =
    (typeof query.tz === 'string' && query.tz) || context.tournament.timezone;
  const diagnosis = diagnoseSchedule(context.matches, context.constraints, {
    timezone,
    tournamentStart: context.tournament.startDate,
    tournamentEnd: context.tournament.endDate,
    // 30 min de repos, 1 match à la fois : les valeurs de la Cup. Réglables.
    teamRestMinutes: readInt(query.rest, 30, 0, 240),
    maxConcurrentMatches: readInt(query.concurrent, 1, 1, 32),
  });
  return {
    tournament: { ...context.tournament, timezone },
    counts: diagnosis.counts,
    anomalies: diagnosis.anomalies,
    slotGrid: diagnosis.slotGrid,
    teamNames: context.teamNames,
    constraintCount: context.constraints.length,
    matchCount: context.matches.length,
    // Le calendrier affiche les MÊMES matchs que la liste d'anomalies juge.
    matches: context.matches,
    constraints: context.constraints,
  };
}

/* ---------------------------------------------------------------------------
 * Contraintes de disponibilité (lot 2)
 * ------------------------------------------------------------------------ */

export async function availability(ctx: ServiceContext, tournamentId: string) {
  const { data: tournament, error: tErr } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr) {
    ctx.logger.error(
      '[admin/tournament-availability] tournament lookup',
      tErr,
      {
        tournamentId,
      }
    );
    fail(500, 'Server error.');
  }
  if (!tournament) {
    failWith(404, 'Tournament not found', 'TOURNAMENT_NOT_FOUND');
  }

  const { data: entrants, error: eErr } = await repo.entrantsWithNames(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (eErr) {
    ctx.logger.error('[admin/tournament-availability] entrants', eErr, {
      tournamentId,
    });
    fail(500, 'Server error.');
  }
  const teamNames = new Map<string, string | null>();
  for (const row of entrants ?? []) {
    // PostgREST rend l'embed en objet OU en tableau selon la relation.
    const team = oneRelation(row.team as Relation<{ name: string | null }>);
    teamNames.set(row.team_id, team?.name ?? null);
  }
  const teamIds = [...teamNames.keys()];
  if (teamIds.length === 0) {
    return { tournamentId, teams: [], constraints: [] };
  }

  const { data, error } = await repo.availabilityConstraints(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    teamIds,
    true
  );
  if (error) {
    ctx.logger.error('[admin/tournament-availability] constraints', error, {
      tournamentId,
    });
    fail(500, 'Server error.');
  }
  const constraints = ((data ?? []) as AvailabilityRow[]).map(rowToConstraint);
  const byTeam = new Map<string, AvailabilityConstraint[]>();
  for (const c of constraints) {
    const list = byTeam.get(c.teamId);
    if (list) list.push(c);
    else byTeam.set(c.teamId, [c]);
  }
  const teams = teamIds
    .map((id) => ({
      id,
      name: teamNames.get(id) ?? null,
      constraints: byTeam.get(id) ?? [],
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  return { tournamentId, teams, constraints };
}

/* ---------------------------------------------------------------------------
 * Conflits d'équipe (chevauchement de deux matchs)
 * ------------------------------------------------------------------------ */

type ScheduledMatch = {
  id: string;
  stage_name: string | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_name: string | null;
  team2_name: string | null;
  scheduled_at: string;
  estimated_end: string;
};

export async function conflicts(ctx: ServiceContext, tournamentId: string) {
  const { data: matchesData, error: mErr } =
    await repo.scheduledMatchesWithTeams(ctx.db, ctx.tenantId, tournamentId);
  if (mErr) {
    ctx.logger.error('conflicts: fetch matches error', mErr);
    fail(500, 'Failed to fetch matches');
  }
  const stageMap = new Map<string, string>();
  for (const s of await repo.stageNames(ctx.db, ctx.tenantId, tournamentId)) {
    stageMap.set(s.id, s.name);
  }

  // Durées : la table partagée avec l'auto-scheduler et le diagnostic.
  const matches: ScheduledMatch[] = (matchesData ?? [])
    .filter(
      (m): m is typeof m & { scheduled_at: string } =>
        !m.is_bye && !!m.scheduled_at
    )
    .map((m) => {
      const format = (m.match_format || 'bo3') as MatchFormat;
      const durationMin = DEFAULT_MATCH_DURATIONS_MINUTES[format] ?? 45;
      const start = new Date(m.scheduled_at);
      return {
        id: m.id,
        stage_name: m.stage_id ? (stageMap.get(m.stage_id) ?? null) : null,
        round_number: m.round_number,
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        team1_name:
          oneRelation(m.team1 as Relation<{ name: string }>)?.name ?? null,
        team2_name:
          oneRelation(m.team2 as Relation<{ name: string }>)?.name ?? null,
        scheduled_at: m.scheduled_at,
        estimated_end: new Date(
          start.getTime() + durationMin * 60_000
        ).toISOString(),
      };
    });

  const teamMatches = new Map<string, ScheduledMatch[]>();
  for (const m of matches) {
    for (const t of [m.team1_id, m.team2_id]) {
      if (!t) continue;
      if (!teamMatches.has(t)) teamMatches.set(t, []);
      teamMatches.get(t)!.push(m);
    }
  }

  const slot = (m: ScheduledMatch) => ({
    id: m.id,
    scheduled_at: m.scheduled_at,
    estimated_end: m.estimated_end,
    stage_name: m.stage_name,
    round_number: m.round_number,
  });
  const found: {
    type: 'team_overlap';
    team_id: string;
    team_name: string;
    match_a: ReturnType<typeof slot>;
    match_b: ReturnType<typeof slot>;
    overlap_minutes: number;
  }[] = [];
  const seen = new Set<string>();
  for (const [teamId, list] of teamMatches) {
    if (list.length < 2) continue;
    list.sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const aEnd = new Date(a.estimated_end).getTime();
        const bStart = new Date(b.scheduled_at).getTime();
        // Trié : plus aucun chevauchement possible pour `a`.
        if (bStart >= aEnd) break;
        const key = `${teamId}:${[a.id, b.id].sort().join(':')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          type: 'team_overlap',
          team_id: teamId,
          team_name:
            a.team1_id === teamId
              ? (a.team1_name ?? teamId)
              : (a.team2_name ?? teamId),
          match_a: slot(a),
          match_b: slot(b),
          overlap_minutes: Math.ceil((aEnd - bStart) / 60_000),
        });
      }
    }
  }
  found.sort(
    (a, b) =>
      new Date(a.match_a.scheduled_at).getTime() -
      new Date(b.match_a.scheduled_at).getTime()
  );
  return {
    conflicts: found,
    total: found.length,
    checked_matches: matches.length,
  };
}
