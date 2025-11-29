// lib/matches/autoScheduler.ts
// Auto-scheduler de matchs : assigne des horaires en fonction
// d'une plage horaire, de ressources (streams/serveurs) et
// de la durée estimée des BO, tout en évitant les overlaps par équipe.

/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

export type MatchFormat =
  | "bo1"
  | "bo2"
  | "bo3"
  | "bo5"
  | "bo7";

export type SchedulerResourceId = string; // ex: "stream_main", "lobby_1", etc.

export interface MatchToSchedule {
  id: string;
  tournamentId: string;
  stageId: string | null;
  team1Id: string | null;
  team2Id: string | null;

  /** Format du match, ex: "bo3" */
  format: MatchFormat;

  /** Ressource souhaitée (stream ou lobby). Si null → "default". */
  resourceId?: SchedulerResourceId | null;

  /** Round / ordre logique pour la priorité de scheduling */
  roundNumber?: number | null;

  /** Priorité globale (plus petit = plus prioritaire) */
  priority?: number | null;

  /**
   * Horaire fixée (ne doit pas être déplacée).
   * Si défini, le scheduler l'utilise comme start forcé.
   */
  pinnedStartAt?: string | null;

  /** Match déjà verrouillé (le scheduler l'ignore) */
  locked?: boolean | null;
}

export interface TimeWindow {
  /** Début de la plage horaire disponible */
  start: Date;
  /** Fin de la plage horaire disponible */
  end: Date;
}

export interface AutoSchedulerConfig {
  /**
   * Plages horaires sur lesquelles on a le droit de planifier.
   * Ex : une journée de 10h à 22h, éventuellement plusieurs jours.
   */
  windows: TimeWindow[];

  /**
   * Durée estimée par format (en minutes).
   * Ex : { bo1: 20, bo3: 45, bo5: 70 }
   */
  estimatedDurationsMinutes: Partial<
    Record<MatchFormat, number>
  >;

  /**
   * Gap minimum entre deux matchs sur la même ressource (minutes).
   * Ex : nettoyer le lobby, pause stream, etc.
   */
  resourceGapMinutes?: number;

  /**
   * Gap minimum entre deux matchs pour la même équipe (minutes).
   * Ex : 15-20 minutes.
   */
  teamRestMinutes?: number;

  /**
   * Ressource par défaut si resourceId est absent.
   */
  defaultResourceId?: SchedulerResourceId;
}

export interface ScheduledMatch {
  matchId: string;
  resourceId: SchedulerResourceId;
  /**
   * Date de début/fin en ISO string,
   * prêtes à être insérées dans Supabase.
   */
  startAt: string;
  endAt: string;

  /** Format rappel pour info */
  format: MatchFormat;
}

export interface AutoScheduleResult {
  scheduled: ScheduledMatch[];
  /** Matchs qui n'ont pas pu être placés (par manque de place dans les time windows) */
  unscheduledMatchIds: string[];
}

/* -----------------------------------------------------------
 * Fonction principale
 * ---------------------------------------------------------*/

/**
 * Auto-scheduler greedy :
 * - trie les matchs par priorité (roundNumber, puis priority, puis id)
 * - pour chaque match, trouve le prochain créneau possible :
 *   - dans les time windows
 *   - sans overlap pour les équipes concernées
 *   - sans overlap pour la ressource
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
    defaultResourceId = "default",
  } = config;

  if (windows.length === 0) {
    return {
      scheduled: [],
      unscheduledMatchIds: matches.map((m) => m.id),
    };
  }

  // Tri des fenêtres temporelles chronologiquement
  const sortedWindows = windows
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Helpers d'état
  const resourceNextFreeTime = new Map<
    SchedulerResourceId,
    Date
  >();
  const teamNextFreeTime = new Map<string, Date>();

  // Résultat
  const scheduled: ScheduledMatch[] = [];
  const unscheduledMatchIds: string[] = [];

  // On sépare les matchs déjà "locked" (avec horaire fixée)
  const lockedMatches = matches.filter(
    (m) => m.locked && m.pinnedStartAt
  );
  const toSchedule = matches.filter(
    (m) => !m.locked
  );

  // 1) On place d'abord les matchs locked
  for (const m of lockedMatches) {
    const resourceId =
      m.resourceId ?? defaultResourceId;
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

  // 2) Tri des matchs à scheduler
  const sortedMatches = toSchedule.sort((a, b) => {
    const ra = a.roundNumber ?? Number.MAX_SAFE_INTEGER;
    const rb = b.roundNumber ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;

    const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;

    return a.id.localeCompare(b.id);
  });

  // 3) Pour chaque match, on cherche le meilleur créneau
  for (const match of sortedMatches) {
    const resourceId =
      match.resourceId ?? defaultResourceId;
    const durationMin = getEstimatedDurationMinutes(
      match.format,
      estimatedDurationsMinutes
    );

    const planned = scheduleSingleMatch(
      match,
      resourceId,
      durationMin,
      sortedWindows,
      resourceNextFreeTime,
      teamNextFreeTime,
      resourceGapMinutes,
      teamRestMinutes
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
      bumpTeam(
        teamNextFreeTime,
        match.team1Id,
        planned.end,
        teamRestMinutes
      );
    }
    if (match.team2Id) {
      bumpTeam(
        teamNextFreeTime,
        match.team2Id,
        planned.end,
        teamRestMinutes
      );
    }
  }

  return {
    scheduled,
    unscheduledMatchIds,
  };
}

/* -----------------------------------------------------------
 * Planning d'un match isolé
 * ---------------------------------------------------------*/

interface PlannedSlot {
  start: Date;
  end: Date;
}

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
  teamRestMinutes: number
): PlannedSlot | null {
  // Si pinnedStartAt fourni, on tente directement à cette date
  if (match.pinnedStartAt) {
    const start = new Date(match.pinnedStartAt);
    const end = addMinutes(start, durationMin);

    if (
      isInAnyWindow(start, end, windows) &&
      isResourceAvailable(
        resourceId,
        start,
        resourceNextFreeTime
      ) &&
      areTeamsAvailable(
        match,
        start,
        teamNextFreeTime
      )
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
        isResourceAvailable(
          resourceId,
          cursor,
          resourceNextFreeTime
        ) &&
        areTeamsAvailable(
          match,
          cursor,
          teamNextFreeTime
        )
      ) {
        return { start: cursor, end };
      }

      // Sinon, on avance un peu (5 minutes) pour essayer un autre slot
      cursor = addMinutes(cursor, 5);
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
 * Helpers de disponibilité & tracking
 * ---------------------------------------------------------*/

function isInAnyWindow(
  start: Date,
  end: Date,
  windows: TimeWindow[]
): boolean {
  return windows.some(
    (w) =>
      start >= w.start &&
      end <= w.end
  );
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
    table[format] ??
    fallback[format] ??
    45 // fallback général
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
  const base =
    typeof day === "string" ? new Date(day) : day;

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

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
  const base =
    typeof startDay === "string"
      ? new Date(startDay)
      : startDay;

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + i
    );
    windows.push(makeDayWindow(d, startTime, endTime));
  }

  return windows;
}
