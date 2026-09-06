// utils/matches/availability.ts
// « Ce match, à cette date, viole-t-il une contrainte d'équipe ? »
//
// Logique PURE : aucun accès base, aucun appel réseau, aucune horloge implicite.
// C'est ce qui permet de la faire tourner sur le calendrier existant (diagnostic),
// sur un calendrier hypothétique (aperçu d'impact d'un déplacement) et à l'intérieur
// de l'auto-scheduler, avec la garantie que les trois répondent la même chose.
//
// Le modèle est décrit dans database/migrations/team_availability_constraints.sql.
// Tout se joue en heure MURALE dans le fuseau porté par la contrainte : « pas avant
// 21 h » ne parle pas d'un instant UTC, il parle de ce que lit l'équipe.

import { getWallClockParts } from '../timezone';

export type AvailabilityConstraintKind =
  | 'blackout'
  | 'earliest'
  | 'latest'
  | 'weekday';

export interface AvailabilityConstraint {
  id: string;
  teamId: string;
  /** null = la contrainte vaut pour tous les tournois de l'équipe. */
  tournamentId: string | null;
  kind: AvailabilityConstraintKind;
  /** `blackout` : bornes INCLUSIVES, format `YYYY-MM-DD`. */
  startsOn?: string | null;
  endsOn?: string | null;
  /** `earliest` / `latest` : heure murale `HH:MM` (ou `HH:MM:SS`). */
  timeOfDay?: string | null;
  /** `weekday` : jours ISO, 1 = lundi … 7 = dimanche. */
  weekdays?: number[] | null;
  /** IANA. Défaut appliqué à la lecture si absent. */
  timezone?: string | null;
  note?: string | null;
}

/** Le minimum qu'il faut savoir d'un match pour le confronter aux contraintes. */
export interface SchedulableMatch {
  id: string;
  tournamentId: string | null;
  /** Instant ISO (UTC). `null` = match non planifié : rien à vérifier. */
  scheduledAt: string | null;
  team1Id: string | null;
  team2Id: string | null;
  /** Un bye n'oppose personne : aucune contrainte ne s'y applique. */
  isBye?: boolean | null;
}

export interface AvailabilityViolation {
  matchId: string;
  teamId: string;
  constraintId: string;
  kind: AvailabilityConstraintKind;
  /** Phrase prête à afficher, en français, sans nom d'équipe (le contexte l'a). */
  reason: string;
  /** Heure murale du match dans le fuseau de la contrainte, pour l'affichage. */
  wallClock: { date: string; time: string; timezone: string };
}

export const DEFAULT_CONSTRAINT_TIMEZONE = 'Europe/Paris';

/** `HH:MM[:SS]` → minutes depuis minuit. `null` si illisible. */
export function parseTimeOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatMinuteOfDay(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = [
  '',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];

/**
 * Une contrainte s'applique-t-elle à ce match ?
 *
 * Deux filtres seulement, et ils sont indépendants : l'équipe doit jouer le
 * match, et la portée doit couvrir le tournoi (portée globale = tous).
 */
export function constraintApplies(
  constraint: AvailabilityConstraint,
  match: SchedulableMatch
): boolean {
  if (match.isBye) return false;
  if (
    constraint.teamId !== match.team1Id &&
    constraint.teamId !== match.team2Id
  ) {
    return false;
  }
  if (
    constraint.tournamentId !== null &&
    constraint.tournamentId !== undefined &&
    constraint.tournamentId !== match.tournamentId
  ) {
    return false;
  }
  return true;
}

/**
 * Confronte UN match à UNE contrainte. Rend la violation, ou `null`.
 *
 * Le match est daté par son COUP D'ENVOI : une contrainte « pas avant 21 h »
 * autorise un match à 21 h qui finira à 22 h 30. C'est la lecture qu'en font
 * les équipes ; l'autre (le match entier dans la fenêtre) interdirait de fait
 * le dernier créneau de chaque soirée.
 */
export function checkConstraint(
  match: SchedulableMatch,
  constraint: AvailabilityConstraint
): AvailabilityViolation | null {
  if (!match.scheduledAt) return null;
  if (!constraintApplies(constraint, match)) return null;

  const timezone = constraint.timezone || DEFAULT_CONSTRAINT_TIMEZONE;
  const at = new Date(match.scheduledAt);
  if (Number.isNaN(at.getTime())) return null;

  let parts;
  try {
    parts = getWallClockParts(at, timezone);
  } catch {
    // Fuseau inconnu du runtime : on ne peut rien affirmer, donc on n'affirme
    // rien. Une fausse violation coûterait un déplacement de match inutile.
    return null;
  }

  const wallClock = {
    date: parts.date,
    time: formatMinuteOfDay(parts.minuteOfDay),
    timezone,
  };
  const violation = (reason: string): AvailabilityViolation => ({
    matchId: match.id,
    teamId: constraint.teamId,
    constraintId: constraint.id,
    kind: constraint.kind,
    reason,
    wallClock,
  });

  switch (constraint.kind) {
    case 'blackout': {
      const from = constraint.startsOn;
      const to = constraint.endsOn;
      if (!from || !to) return null;
      // Comparaison lexicographique de `YYYY-MM-DD` : elle EST l'ordre
      // chronologique pour ce format, et elle évite de refabriquer des Date
      // qu'il faudrait re-situer dans un fuseau.
      if (parts.date < from || parts.date > to) return null;
      return violation(
        from === to
          ? `indisponible le ${from}`
          : `indisponible du ${from} au ${to}`
      );
    }

    case 'earliest': {
      const limit = parseTimeOfDay(constraint.timeOfDay);
      if (limit === null) return null;
      if (parts.minuteOfDay >= limit) return null;
      return violation(
        `commence à ${wallClock.time}, pas de match avant ${formatMinuteOfDay(limit)}`
      );
    }

    case 'latest': {
      const limit = parseTimeOfDay(constraint.timeOfDay);
      if (limit === null) return null;
      if (parts.minuteOfDay <= limit) return null;
      return violation(
        `commence à ${wallClock.time}, pas de match après ${formatMinuteOfDay(limit)}`
      );
    }

    case 'weekday': {
      const days = constraint.weekdays;
      if (!days || days.length === 0) return null;
      if (!days.includes(parts.isoWeekday)) return null;
      return violation(
        `indisponible le ${WEEKDAY_LABELS[parts.isoWeekday] ?? 'ce jour'}`
      );
    }

    default:
      return null;
  }
}

/**
 * Toutes les violations d'un calendrier.
 *
 * L'ordre de sortie suit le calendrier (date croissante), pas l'ordre d'entrée :
 * une liste d'anomalies se lit dans l'ordre où elles arriveront.
 */
export function findAvailabilityViolations(
  matches: SchedulableMatch[],
  constraints: AvailabilityConstraint[]
): AvailabilityViolation[] {
  const out: AvailabilityViolation[] = [];
  const ordered = matches
    .filter((m) => m.scheduledAt)
    .slice()
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));

  for (const match of ordered) {
    for (const constraint of constraints) {
      const v = checkConstraint(match, constraint);
      if (v) out.push(v);
    }
  }
  return out;
}

/**
 * Un créneau donné convient-il aux deux équipes d'un match ?
 *
 * C'est la question de l'auto-scheduler et de l'aperçu d'impact : on teste un
 * instant candidat AVANT de l'écrire. Réutilise `checkConstraint` sur un match
 * fictif daté au créneau candidat — une seule règle, un seul comportement.
 */
export function isSlotAllowed(
  match: SchedulableMatch,
  startAt: Date,
  constraints: AvailabilityConstraint[]
): { allowed: boolean; violations: AvailabilityViolation[] } {
  const candidate: SchedulableMatch = {
    ...match,
    scheduledAt: startAt.toISOString(),
  };
  const violations = constraints
    .map((c) => checkConstraint(candidate, c))
    .filter((v): v is AvailabilityViolation => v !== null);
  return { allowed: violations.length === 0, violations };
}

/** Index par équipe — ce dont l'auto-scheduler a besoin à chaque essai de créneau. */
export function groupConstraintsByTeam(
  constraints: AvailabilityConstraint[]
): Map<string, AvailabilityConstraint[]> {
  const map = new Map<string, AvailabilityConstraint[]>();
  for (const c of constraints) {
    const list = map.get(c.teamId);
    if (list) list.push(c);
    else map.set(c.teamId, [c]);
  }
  return map;
}

/** `YYYY-MM-DD` → jour ISO (1 = lundi … 7 = dimanche), sans passer par un fuseau. */
export function isoWeekdayOfYmd(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  // Date.UTC : la date murale est traitée comme une date pure, donc le résultat
  // ne dépend pas du fuseau de la machine qui l'évalue.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Le jour suivant, en `YYYY-MM-DD`. */
function nextYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Les jours d'indisponibilité, équipe par équipe, sur une plage donnée.
 *
 * Sert à GRISER les jours dans un calendrier : montrer où une équipe ne peut
 * pas jouer vaut mieux que d'attendre qu'on l'y place pour le signaler. Ne
 * couvre que les contraintes qui portent sur des JOURS entiers (`blackout`,
 * `weekday`) — une contrainte d'heure ne rend pas la journée indisponible, elle
 * en rend une partie inutilisable, et grisée elle mentirait.
 *
 * La plage est bornée à 400 jours : au-delà, l'appelant demande à voir plus
 * d'une saison d'un coup, ce qu'aucun calendrier n'affiche.
 */
export function blackoutDaysByTeam(
  constraints: AvailabilityConstraint[],
  fromYmd: string,
  toYmd: string
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
    return out;
  }

  const push = (day: string, teamId: string) => {
    const list = out.get(day);
    if (!list) out.set(day, [teamId]);
    else if (!list.includes(teamId)) list.push(teamId);
  };

  let day = fromYmd;
  let guard = 0;
  while (day <= toYmd && guard < 400) {
    guard += 1;
    const weekday = isoWeekdayOfYmd(day);
    for (const c of constraints) {
      if (c.kind === 'blackout') {
        if (c.startsOn && c.endsOn && day >= c.startsOn && day <= c.endsOn) {
          push(day, c.teamId);
        }
      } else if (c.kind === 'weekday') {
        if (weekday !== null && (c.weekdays ?? []).includes(weekday)) {
          push(day, c.teamId);
        }
      }
    }
    day = nextYmd(day);
  }

  return out;
}
