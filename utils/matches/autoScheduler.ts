// lib/matches/autoScheduler.ts
// Auto-scheduler de matchs : assigne des horaires en fonction
// d'une plage horaire, de ressources (streams/serveurs) et
// de la durée estimée des BO, tout en évitant les overlaps par équipe.
import type {
  AutoScheduleResult,
  AutoSchedulerConfig,
  MatchFormat,
  MatchToSchedule,
  PlannedSlot,
  ScheduledMatch,
  SchedulerResourceId,
  SchedulingConflict,
  TimeWindow,
} from '../../types/matches';

/* -----------------------------------------------------------
 * Fonction principale
 * ---------------------------------------------------------*/

/**
 * Auto-scheduler en 2 passes :
 * 1) Place d'abord les matchs « contraints » (dont les équipes
 *    apparaissent dans plusieurs matchs du batch → plus difficiles à caser).
 * 2) Puis les matchs « libres » restants, en greedy classique.
 *
 * À la fin, une validation de double-booking détecte tout conflit
 * d'une même équipe sur des créneaux superposés.
 */
export function autoScheduleMatches(
  matches: MatchToSchedule[],
  config: AutoSchedulerConfig
): AutoScheduleResult {
  const {
    windows,
    estimatedDurationsMinutes,
    resourceGapMinutes = 5,
    teamRestMinutes = 15,
    defaultResourceId = 'default',
    slideWindowMinutes = 5,
  } = config;

  if (windows.length === 0) {
    return {
      scheduled: [],
      unscheduledMatchIds: matches.map((m) => m.id),
      conflicts: [],
    };
  }

  // Tri des fenêtres temporelles chronologiquement
  const sortedWindows = windows
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Helpers d'état
  const resourceNextFreeTime = new Map<SchedulerResourceId, Date>();
  const teamNextFreeTime = new Map<string, Date>();

  // Résultat
  const scheduled: ScheduledMatch[] = [];
  const unscheduledMatchIds: string[] = [];

  // On sépare les matchs déjà "locked" (avec horaire fixée)
  const lockedMatches = matches.filter((m) => m.locked && m.pinnedStartAt);
  const toSchedule = matches.filter((m) => !m.locked);

  // 1) On place d'abord les matchs locked
  for (const m of lockedMatches) {
    const resourceId = m.resourceId ?? defaultResourceId;
    const durationMin = getEstimatedDurationMinutes(
      m.format,
      estimatedDurationsMinutes
    );
    const pinnedStartDate = new Date(m.pinnedStartAt!);
    const endDate = addMinutes(pinnedStartDate, durationMin);

    // On n'essaie pas de repacker, on prend ces horaires comme vérité
    scheduled.push({
      matchId: m.id,
      resourceId,
      startAt: pinnedStartDate.toISOString(),
      endAt: endDate.toISOString(),
      format: m.format,
    });

    // On met à jour les dispos de ressource et des équipes
    bumpResource(resourceNextFreeTime, resourceId, endDate, resourceGapMinutes);
    if (m.team1Id) {
      bumpTeam(teamNextFreeTime, m.team1Id, endDate, teamRestMinutes);
    }
    if (m.team2Id) {
      bumpTeam(teamNextFreeTime, m.team2Id, endDate, teamRestMinutes);
    }
  }

  // 2) Séparer matchs contraints et libres (two-pass)
  const { constrained, free } = partitionByConstraint(toSchedule);

  // Tri commun par priorité
  const sortByPriority = (a: MatchToSchedule, b: MatchToSchedule) => {
    const ra = a.roundNumber ?? Number.MAX_SAFE_INTEGER;
    const rb = b.roundNumber ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;

    const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;

    return a.id.localeCompare(b.id);
  };

  constrained.sort(sortByPriority);
  free.sort(sortByPriority);

  // 3) Passe 1 : matchs contraints (équipes partagées, même ressource)
  scheduleGroup(
    constrained,
    sortedWindows,
    resourceNextFreeTime,
    teamNextFreeTime,
    resourceGapMinutes,
    teamRestMinutes,
    slideWindowMinutes,
    defaultResourceId,
    estimatedDurationsMinutes,
    scheduled,
    unscheduledMatchIds
  );

  // 4) Passe 2 : matchs libres
  scheduleGroup(
    free,
    sortedWindows,
    resourceNextFreeTime,
    teamNextFreeTime,
    resourceGapMinutes,
    teamRestMinutes,
    slideWindowMinutes,
    defaultResourceId,
    estimatedDurationsMinutes,
    scheduled,
    unscheduledMatchIds
  );

  // 5) Validation de double-booking
  const conflicts = detectDoubleBooking(scheduled, matches);

  return {
    scheduled,
    unscheduledMatchIds,
    conflicts,
  };
}

/* -----------------------------------------------------------
 * Partition contraints / libres
 * ---------------------------------------------------------*/

/**
 * Identifie les matchs « contraints » : ceux dont au moins une équipe
 * apparaît dans un autre match du même batch.
 */
function partitionByConstraint(matches: MatchToSchedule[]): {
  constrained: MatchToSchedule[];
  free: MatchToSchedule[];
} {
  // Compter les apparitions de chaque teamId
  const teamAppearances = new Map<string, number>();
  for (const m of matches) {
    if (m.team1Id) {
      teamAppearances.set(m.team1Id, (teamAppearances.get(m.team1Id) ?? 0) + 1);
    }
    if (m.team2Id) {
      teamAppearances.set(m.team2Id, (teamAppearances.get(m.team2Id) ?? 0) + 1);
    }
  }

  const constrained: MatchToSchedule[] = [];
  const free: MatchToSchedule[] = [];

  for (const m of matches) {
    const t1Count = m.team1Id ? (teamAppearances.get(m.team1Id) ?? 0) : 0;
    const t2Count = m.team2Id ? (teamAppearances.get(m.team2Id) ?? 0) : 0;

    if (t1Count > 1 || t2Count > 1) {
      constrained.push(m);
    } else {
      free.push(m);
    }
  }

  return { constrained, free };
}

/* -----------------------------------------------------------
 * Scheduling d'un groupe de matchs
 * ---------------------------------------------------------*/

function scheduleGroup(
  matches: MatchToSchedule[],
  windows: TimeWindow[],
  resourceNextFreeTime: Map<SchedulerResourceId, Date>,
  teamNextFreeTime: Map<string, Date>,
  resourceGapMinutes: number,
  teamRestMinutes: number,
  slideWindowMinutes: number,
  defaultResourceId: SchedulerResourceId,
  estimatedDurationsMinutes: Partial<Record<MatchFormat, number>>,
  scheduled: ScheduledMatch[],
  unscheduledMatchIds: string[]
): void {
  for (const match of matches) {
    const resourceId = match.resourceId ?? defaultResourceId;
    const durationMin = getEstimatedDurationMinutes(
      match.format,
      estimatedDurationsMinutes
    );

    const planned = scheduleSingleMatch(
      match,
      resourceId,
      durationMin,
      windows,
      resourceNextFreeTime,
      teamNextFreeTime,
      resourceGapMinutes,
      teamRestMinutes,
      slideWindowMinutes
    );

    if (!planned) {
      unscheduledMatchIds.push(match.id);
      continue;
    }

    scheduled.push({
      matchId: match.id,
      resourceId,
      startAt: planned.start.toISOString(),
      endAt: planned.end.toISOString(),
      format: match.format,
    });

    bumpResource(
      resourceNextFreeTime,
      resourceId,
      planned.end,
      resourceGapMinutes
    );
    if (match.team1Id) {
      bumpTeam(teamNextFreeTime, match.team1Id, planned.end, teamRestMinutes);
    }
    if (match.team2Id) {
      bumpTeam(teamNextFreeTime, match.team2Id, planned.end, teamRestMinutes);
    }
  }
}

/* -----------------------------------------------------------
 * Planning d'un match isolé
 * ---------------------------------------------------------*/

/**
 * Planifie un match dans les fenêtres disponibles selon :
 * - dispo ressource
 * - dispo équipe(s)
 * - pinnedStartAt éventuellement
 */
function scheduleSingleMatch(
  match: MatchToSchedule,
  resourceId: SchedulerResourceId,
  durationMin: number,
  windows: TimeWindow[],
  resourceNextFreeTime: Map<SchedulerResourceId, Date>,
  teamNextFreeTime: Map<string, Date>,
  resourceGapMinutes: number,
  teamRestMinutes: number,
  slideWindowMinutes: number
): PlannedSlot | null {
  // Si pinnedStartAt fourni, on tente directement à cette date
  if (match.pinnedStartAt) {
    const start = new Date(match.pinnedStartAt);
    const end = addMinutes(start, durationMin);

    if (
      isInAnyWindow(start, end, windows) &&
      isResourceAvailable(resourceId, start, resourceNextFreeTime) &&
      areTeamsAvailable(match, start, teamNextFreeTime)
    ) {
      return { start, end };
    }

    // Sinon, on ne place pas (pinned = "hard")
    return null;
  }

  // Sinon, on cherche le premier créneau possible dans les windows
  for (const w of windows) {
    // On commence au max entre début de la fenêtre
    // et dispos actuelles ressource + teams
    let cursor = new Date(w.start);

    cursor = applyAvailabilityConstraints(
      match,
      resourceId,
      cursor,
      resourceNextFreeTime,
      teamNextFreeTime
    );

    while (true) {
      const end = addMinutes(cursor, durationMin);

      // Si on dépasse la fenêtre, on passe à la suivante
      if (end > w.end) break;

      // Check dispo finale
      if (
        isResourceAvailable(resourceId, cursor, resourceNextFreeTime) &&
        areTeamsAvailable(match, cursor, teamNextFreeTime)
      ) {
        return { start: cursor, end };
      }

      // Sinon, on avance (configurable) pour essayer un autre slot
      cursor = addMinutes(cursor, slideWindowMinutes);
      // Et on applique à nouveau les contraintes
      cursor = applyAvailabilityConstraints(
        match,
        resourceId,
        cursor,
        resourceNextFreeTime,
        teamNextFreeTime
      );
    }
  }

  // Aucun créneau trouvé
  return null;
}

/**
 * Applique rapidement les contraintes de disponibilité :
 * - ressource
 * - team1
 * - team2
 * en remontant le curseur au max de toutes les nextFreeTime.
 */
function applyAvailabilityConstraints(
  match: MatchToSchedule,
  resourceId: SchedulerResourceId,
  current: Date,
  resourceNextFreeTime: Map<SchedulerResourceId, Date>,
  teamNextFreeTime: Map<string, Date>
): Date {
  let t = new Date(current);

  const rNext = resourceNextFreeTime.get(resourceId);
  if (rNext && rNext > t) t = new Date(rNext);

  if (match.team1Id) {
    const t1 = teamNextFreeTime.get(match.team1Id);
    if (t1 && t1 > t) t = new Date(t1);
  }

  if (match.team2Id) {
    const t2 = teamNextFreeTime.get(match.team2Id);
    if (t2 && t2 > t) t = new Date(t2);
  }

  return t;
}

/* -----------------------------------------------------------
 * Validation de double-booking
 * ---------------------------------------------------------*/

/**
 * Détecte les cas où une même équipe apparaît dans deux matchs
 * dont les plages horaires se chevauchent.
 */
function detectDoubleBooking(
  scheduled: ScheduledMatch[],
  originalMatches: MatchToSchedule[]
): SchedulingConflict[] {
  // Construire un index matchId → teamIds
  const matchTeams = new Map<
    string,
    { team1Id: string | null; team2Id: string | null }
  >();
  for (const m of originalMatches) {
    matchTeams.set(m.id, { team1Id: m.team1Id, team2Id: m.team2Id });
  }

  // Grouper les matchs programmés par teamId
  const teamSchedules = new Map<
    string,
    { matchId: string; start: Date; end: Date }[]
  >();

  for (const s of scheduled) {
    const teams = matchTeams.get(s.matchId);
    if (!teams) continue;

    const entry = {
      matchId: s.matchId,
      start: new Date(s.startAt),
      end: new Date(s.endAt),
    };

    for (const teamId of [teams.team1Id, teams.team2Id]) {
      if (!teamId) continue;
      if (!teamSchedules.has(teamId)) {
        teamSchedules.set(teamId, []);
      }
      teamSchedules.get(teamId)!.push(entry);
    }
  }

  // Vérifier les chevauchements pour chaque équipe
  const conflicts: SchedulingConflict[] = [];
  const seen = new Set<string>();

  for (const [teamId, entries] of teamSchedules) {
    if (entries.length < 2) continue;

    // Trier par date de début
    entries.sort((a, b) => a.start.getTime() - b.start.getTime());

    for (let i = 0; i < entries.length - 1; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];

        // Si b commence après la fin de a, pas de chevauchement
        if (b.start >= a.end) break;

        // Chevauchement détecté
        const key = [a.matchId, b.matchId, teamId].sort().join('::');
        if (seen.has(key)) continue;
        seen.add(key);

        const overlapStart = b.start > a.start ? b.start : a.start;
        const overlapEnd = a.end < b.end ? a.end : b.end;

        conflicts.push({
          matchId1: a.matchId,
          matchId2: b.matchId,
          teamId,
          overlapStart: overlapStart.toISOString(),
          overlapEnd: overlapEnd.toISOString(),
        });
      }
    }
  }

  return conflicts;
}

/* -----------------------------------------------------------
 * Helpers de disponibilité & tracking
 * ---------------------------------------------------------*/

function isInAnyWindow(start: Date, end: Date, windows: TimeWindow[]): boolean {
  return windows.some((w) => start >= w.start && end <= w.end);
}

function isResourceAvailable(
  resourceId: SchedulerResourceId,
  start: Date,
  resourceNextFreeTime: Map<SchedulerResourceId, Date>
): boolean {
  const next = resourceNextFreeTime.get(resourceId);
  if (!next) return true;
  return start >= next;
}

function areTeamsAvailable(
  match: MatchToSchedule,
  start: Date,
  teamNextFreeTime: Map<string, Date>
): boolean {
  if (match.team1Id) {
    const t1 = teamNextFreeTime.get(match.team1Id);
    if (t1 && start < t1) return false;
  }
  if (match.team2Id) {
    const t2 = teamNextFreeTime.get(match.team2Id);
    if (t2 && start < t2) return false;
  }
  return true;
}

function bumpResource(
  map: Map<SchedulerResourceId, Date>,
  resourceId: SchedulerResourceId,
  lastEnd: Date,
  gapMinutes: number
) {
  const nextFree = addMinutes(lastEnd, gapMinutes);
  map.set(resourceId, nextFree);
}

function bumpTeam(
  map: Map<string, Date>,
  teamId: string,
  lastEnd: Date,
  restMinutes: number
) {
  const nextFree = addMinutes(lastEnd, restMinutes);
  map.set(teamId, nextFree);
}

/* -----------------------------------------------------------
 * Durée estimée & dates
 * ---------------------------------------------------------*/

function getEstimatedDurationMinutes(
  format: MatchFormat,
  table: Partial<Record<MatchFormat, number>>
): number {
  const fallback: Record<MatchFormat, number> = {
    bo1: 20,
    bo2: 30,
    bo3: 45,
    bo5: 70,
    bo7: 95,
  };

  return (
    table[format] ?? fallback[format] ?? 45 // fallback général
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/* -----------------------------------------------------------
 * Helpers pour construire des windows de journée(s)
 * ---------------------------------------------------------*/

/**
 * Construit une plage horaire sur un jour donné.
 * @param day ISO string (YYYY-MM-DD) ou Date
 * @param startTime "HH:MM" (24h)
 * @param endTime "HH:MM" (24h)
 */
export function makeDayWindow(
  day: string | Date,
  startTime: string,
  endTime: string
): TimeWindow {
  const base = typeof day === 'string' ? new Date(day) : day;

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  const start = new Date(base);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(base);
  end.setHours(eh, em, 0, 0);

  return { start, end };
}

/**
 * Helper rapide pour N jours d'affilée, même plage horaire.
 */
export function makeMultiDayWindows(
  startDay: string | Date,
  daysCount: number,
  startTime: string,
  endTime: string
): TimeWindow[] {
  const windows: TimeWindow[] = [];
  const base = typeof startDay === 'string' ? new Date(startDay) : startDay;

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    windows.push(makeDayWindow(d, startTime, endTime));
  }

  return windows;
}
