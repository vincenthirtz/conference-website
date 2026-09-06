// utils/matches/scheduleDiagnostics.ts
//
// « Qu'est-ce qui cloche dans ce calendrier ? » — lot 3 de
// docs/PLAN-plateforme-tournois.md.
//
// L'écran qui rend inutile la simulation HTML du 06/09 : au lieu de rejouer six
// scénarios à la main pour vérifier qu'aucune équipe ne joue deux fois et
// qu'aucune contrainte n'est violée, on pose la question au calendrier.
//
// Logique PURE. Elle prend le calendrier tel qu'il est (ou tel qu'il SERAIT
// après un déplacement — c'est ce qui permettra l'aperçu d'impact du lot 5) et
// rend une liste d'anomalies ordonnée.
//
// Ce qu'elle ne fait pas : trancher. Une grille à 28 matchs pour 30 places n'a
// pas de solution optimale évidente, elle a des arbitrages. On montre les
// arbitrages, on ne les prend pas — sauf quand la correction est *triviale*
// (un créneau libre le même soir qui satisfait tout le monde), auquel cas on la
// PROPOSE, jamais on ne l'applique.

import { getWallClockParts } from '../timezone';
import {
  checkConstraint,
  isSlotAllowed,
  type AvailabilityConstraint,
  type SchedulableMatch,
} from './availability';
import { getEstimatedDurationMinutes } from './autoScheduler';
import type { MatchFormat } from '../../types/matches';

export type ScheduleAnomalyKind =
  /** Une contrainte de disponibilité d'équipe est violée. */
  | 'availability'
  /** Une équipe joue deux matchs qui se chevauchent (repos compris). */
  | 'double_booking'
  /** Une équipe joue deux fois le même soir, mais avec de l'air entre les deux. */
  | 'same_evening'
  /** Le match tombe hors des dates annoncées du tournoi. */
  | 'outside_tournament'
  /** Plus de matchs à la même heure que la production ne peut en porter. */
  | 'slot_collision'
  /** Le match n'a pas de date. */
  | 'unscheduled';

export type ScheduleAnomalySeverity = 'blocking' | 'warning' | 'info';

export interface ScheduleAnomaly {
  kind: ScheduleAnomalyKind;
  severity: ScheduleAnomalySeverity;
  /** Les matchs concernés — un seul, sauf pour les anomalies qui en opposent deux. */
  matchIds: string[];
  teamId: string | null;
  /** Instant ISO du match (le premier, pour les anomalies à deux matchs). */
  at: string | null;
  /** Phrase prête à afficher. */
  message: string;
  /** Correction triviale, quand il y en a une. Jamais appliquée d'office. */
  suggestion: ScheduleSuggestion | null;
}

export interface ScheduleSuggestion {
  matchId: string;
  /** Instant ISO proposé. */
  moveTo: string;
  /** Pourquoi ce créneau-là et pas un autre. */
  why: string;
}

export interface DiagnosableMatch extends SchedulableMatch {
  format?: string | null;
  status?: string | null;
  team1Name?: string | null;
  team2Name?: string | null;
  /** « J3 », « Demi-finale »… sert à nommer le match dans les messages. */
  roundName?: string | null;
}

export interface DiagnoseOptions {
  /** Fuseau de lecture du calendrier. Défaut `Europe/Paris`. */
  timezone?: string;
  /** Dates annoncées du tournoi, `YYYY-MM-DD`. */
  tournamentStart?: string | null;
  tournamentEnd?: string | null;
  /** Repos minimum entre deux matchs d'une même équipe. Défaut 30 min. */
  teamRestMinutes?: number;
  /** Combien de matchs la production peut porter en parallèle. Défaut 1. */
  maxConcurrentMatches?: number;
  /** Durées par format, sinon la table partagée avec l'auto-scheduler. */
  estimatedDurationsMinutes?: Partial<Record<MatchFormat, number>>;
}

export interface ScheduleDiagnosis {
  anomalies: ScheduleAnomaly[];
  counts: Record<ScheduleAnomalySeverity, number>;
  /**
   * Les créneaux de la grille tels qu'ils sont RÉELLEMENT utilisés, en heure
   * murale (`HH:MM`), triés. C'est la grille qu'on propose de réutiliser pour
   * corriger : elle est déduite du calendrier, jamais configurée — un tournoi
   * qui joue à 19 h / 20 h 30 / 22 h n'a pas à le déclarer deux fois.
   */
  slotGrid: string[];
}

const DEFAULT_TIMEZONE = 'Europe/Paris';
const DEFAULT_REST_MINUTES = 30;

function matchLabel(m: DiagnosableMatch): string {
  const teams =
    m.team1Name && m.team2Name
      ? `${m.team1Name} vs ${m.team2Name}`
      : (m.roundName ?? m.id.slice(0, 8));
  return m.roundName ? `${m.roundName} · ${teams}` : teams;
}

function teamNameOf(m: DiagnosableMatch, teamId: string): string {
  if (m.team1Id === teamId) return m.team1Name ?? 'cette équipe';
  if (m.team2Id === teamId) return m.team2Name ?? 'cette équipe';
  return 'cette équipe';
}

function durationOf(
  m: DiagnosableMatch,
  table: Partial<Record<MatchFormat, number>>
): number {
  return getEstimatedDurationMinutes((m.format || 'bo3') as MatchFormat, table);
}

/** Les matchs qui comptent : datés, non annulés, non byes. */
function playable(matches: DiagnosableMatch[]): DiagnosableMatch[] {
  return matches.filter(
    (m) => !m.isBye && m.status !== 'cancelled' && Boolean(m.scheduledAt)
  );
}

/**
 * Les heures de coup d'envoi réellement pratiquées, en heure murale, triées.
 *
 * Déduite plutôt que configurée : le calendrier EST la déclaration de la grille.
 * Une heure utilisée une seule fois compte quand même — un créneau exceptionnel
 * reste un créneau que la production sait tenir.
 */
export function deriveSlotGrid(
  matches: DiagnosableMatch[],
  timezone: string = DEFAULT_TIMEZONE
): string[] {
  const set = new Set<string>();
  for (const m of playable(matches)) {
    try {
      const p = getWallClockParts(new Date(m.scheduledAt as string), timezone);
      const h = Math.floor(p.minuteOfDay / 60);
      const min = p.minuteOfDay % 60;
      set.add(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    } catch {
      // Date ou fuseau illisible : le match sera signalé ailleurs, pas ici.
    }
  }
  return [...set].sort();
}

/** L'instant d'un créneau `HH:MM` le jour mural de `reference`. */
function slotInstantSameDay(
  reference: Date,
  slot: string,
  timezone: string
): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(slot);
  if (!m) return null;
  try {
    const parts = getWallClockParts(reference, timezone);
    const targetMinute = Number(m[1]) * 60 + Number(m[2]);
    // On décale l'instant de référence du delta de minutes murales : l'offset du
    // fuseau est le même dans la journée (hors bascule DST, qui a lieu à 3 h du
    // matin — jamais dans une soirée de match).
    return new Date(
      reference.getTime() + (targetMinute - parts.minuteOfDay) * 60_000
    );
  } catch {
    return null;
  }
}

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  restMinutes: number
): boolean {
  const rest = restMinutes * 60_000;
  return aStart.getTime() < bEnd.getTime() + rest &&
    bStart.getTime() < aEnd.getTime() + rest;
}

/**
 * Le diagnostic complet d'un calendrier.
 *
 * Ordre de sortie : par gravité puis par date. On lit d'abord ce qui bloque,
 * et dans l'ordre où ça arrivera — c'est l'ordre dans lequel on corrige.
 */
export function diagnoseSchedule(
  matches: DiagnosableMatch[],
  constraints: AvailabilityConstraint[],
  options: DiagnoseOptions = {}
): ScheduleDiagnosis {
  const timezone = options.timezone || DEFAULT_TIMEZONE;
  const restMinutes = options.teamRestMinutes ?? DEFAULT_REST_MINUTES;
  const maxConcurrent = options.maxConcurrentMatches ?? 1;
  const durations = options.estimatedDurationsMinutes ?? {};

  const anomalies: ScheduleAnomaly[] = [];
  const dated = playable(matches);
  const slotGrid = deriveSlotGrid(dated, timezone);

  // --- 1. Matchs sans date ------------------------------------------------
  for (const m of matches) {
    if (m.isBye || m.status === 'cancelled' || m.scheduledAt) continue;
    anomalies.push({
      kind: 'unscheduled',
      severity: 'warning',
      matchIds: [m.id],
      teamId: null,
      at: null,
      message: `${matchLabel(m)} n'a pas de date.`,
      suggestion: null,
    });
  }

  // --- 2. Contraintes d'équipe -------------------------------------------
  for (const m of dated) {
    for (const c of constraints) {
      const v = checkConstraint(m, c);
      if (!v) continue;
      anomalies.push({
        kind: 'availability',
        severity: 'blocking',
        matchIds: [m.id],
        teamId: v.teamId,
        at: m.scheduledAt,
        message: `${teamNameOf(m, v.teamId)} : ${v.reason} (${matchLabel(m)}).`,
        suggestion: findSameEveningFix(m, dated, constraints, slotGrid, {
          timezone,
          restMinutes,
          maxConcurrent,
          durations,
        }),
      });
    }
  }

  // --- 3. Double-booking et doubles soirées -------------------------------
  const byTeam = new Map<string, DiagnosableMatch[]>();
  for (const m of dated) {
    for (const teamId of [m.team1Id, m.team2Id]) {
      if (!teamId) continue;
      const list = byTeam.get(teamId);
      if (list) list.push(m);
      else byTeam.set(teamId, [m]);
    }
  }

  for (const [teamId, list] of byTeam) {
    const sorted = [...list].sort((a, b) =>
      (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const aStart = new Date(a.scheduledAt as string);
      const bStart = new Date(b.scheduledAt as string);
      const aEnd = new Date(aStart.getTime() + durationOf(a, durations) * 60_000);
      const bEnd = new Date(bStart.getTime() + durationOf(b, durations) * 60_000);

      if (overlaps(aStart, aEnd, bStart, bEnd, restMinutes)) {
        anomalies.push({
          kind: 'double_booking',
          severity: 'blocking',
          matchIds: [a.id, b.id],
          teamId,
          at: a.scheduledAt,
          message: `${teamNameOf(a, teamId)} enchaîne deux matchs sans le repos de ${restMinutes} min : ${matchLabel(a)} puis ${matchLabel(b)}.`,
          suggestion: null,
        });
        continue;
      }

      // Même soirée mais avec de l'air : c'est tenable, et ça se sait. La Cup
      // 2026 vit avec une équipe qui joue à 19 h et à 22 h — exception acceptée,
      // pas anomalie à corriger.
      let sameDay = false;
      try {
        sameDay =
          getWallClockParts(aStart, timezone).date ===
          getWallClockParts(bStart, timezone).date;
      } catch {
        sameDay = false;
      }
      if (sameDay) {
        anomalies.push({
          kind: 'same_evening',
          severity: 'info',
          matchIds: [a.id, b.id],
          teamId,
          at: a.scheduledAt,
          message: `${teamNameOf(a, teamId)} joue deux fois le même soir : ${matchLabel(a)} puis ${matchLabel(b)}.`,
          suggestion: null,
        });
      }
    }
  }

  // --- 4. Hors des dates du tournoi ---------------------------------------
  if (options.tournamentStart || options.tournamentEnd) {
    for (const m of dated) {
      let day: string;
      try {
        day = getWallClockParts(new Date(m.scheduledAt as string), timezone).date;
      } catch {
        continue;
      }
      const before = options.tournamentStart && day < options.tournamentStart;
      const after = options.tournamentEnd && day > options.tournamentEnd;
      if (!before && !after) continue;
      anomalies.push({
        kind: 'outside_tournament',
        severity: 'warning',
        matchIds: [m.id],
        teamId: null,
        at: m.scheduledAt,
        message: `${matchLabel(m)} tombe le ${day}, hors des dates annoncées du tournoi.`,
        suggestion: null,
      });
    }
  }

  // --- 5. Créneaux surchargés ---------------------------------------------
  const bySlot = new Map<string, DiagnosableMatch[]>();
  for (const m of dated) {
    const key = m.scheduledAt as string;
    const list = bySlot.get(key);
    if (list) list.push(m);
    else bySlot.set(key, [m]);
  }
  for (const [at, list] of bySlot) {
    if (list.length <= maxConcurrent) continue;
    anomalies.push({
      kind: 'slot_collision',
      severity: 'warning',
      matchIds: list.map((m) => m.id),
      teamId: null,
      at,
      message: `${list.length} matchs au même créneau, la production en porte ${maxConcurrent}.`,
      suggestion: null,
    });
  }

  const order: Record<ScheduleAnomalySeverity, number> = {
    blocking: 0,
    warning: 1,
    info: 2,
  };
  anomalies.sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) {
      return order[a.severity] - order[b.severity];
    }
    return (a.at ?? '￿').localeCompare(b.at ?? '￿');
  });

  const counts: Record<ScheduleAnomalySeverity, number> = {
    blocking: 0,
    warning: 0,
    info: 0,
  };
  for (const a of anomalies) counts[a.severity] += 1;

  return { anomalies, counts, slotGrid };
}

/**
 * La correction gratuite : un autre créneau LE MÊME SOIR qui satisfait tout le
 * monde et ne prend la place de personne.
 *
 * C'est le cas « 21/10 20 h 30 → 22 h, le créneau est libre » de la simulation
 * du 06/09 : personne d'autre ne bouge, aucune date ne change. Quand il n'existe
 * pas, on ne propose rien — proposer un déplacement de date sans en montrer les
 * effets de bord serait exactement l'erreur que ce lot corrige.
 */
function findSameEveningFix(
  match: DiagnosableMatch,
  allMatches: DiagnosableMatch[],
  constraints: AvailabilityConstraint[],
  slotGrid: string[],
  ctx: {
    timezone: string;
    restMinutes: number;
    maxConcurrent: number;
    durations: Partial<Record<MatchFormat, number>>;
  }
): ScheduleSuggestion | null {
  if (!match.scheduledAt) return null;
  const current = new Date(match.scheduledAt);
  if (Number.isNaN(current.getTime())) return null;

  const others = allMatches.filter((m) => m.id !== match.id);
  const myDuration = durationOf(match, ctx.durations) * 60_000;

  for (const slot of slotGrid) {
    const candidate = slotInstantSameDay(current, slot, ctx.timezone);
    if (!candidate || candidate.getTime() === current.getTime()) continue;

    // a) les contraintes des deux équipes, au créneau candidat
    if (!isSlotAllowed(match, candidate, constraints).allowed) continue;

    // b) le créneau ne doit pas être déjà plein
    const occupants = others.filter(
      (m) => new Date(m.scheduledAt as string).getTime() === candidate.getTime()
    );
    if (occupants.length >= ctx.maxConcurrent) continue;

    // c) aucune des deux équipes ne doit déjà jouer autour
    const candEnd = new Date(candidate.getTime() + myDuration);
    const clash = others.some((m) => {
      const shares =
        (m.team1Id && (m.team1Id === match.team1Id || m.team1Id === match.team2Id)) ||
        (m.team2Id && (m.team2Id === match.team1Id || m.team2Id === match.team2Id));
      if (!shares) return false;
      const s = new Date(m.scheduledAt as string);
      const e = new Date(s.getTime() + durationOf(m, ctx.durations) * 60_000);
      return overlaps(candidate, candEnd, s, e, ctx.restMinutes);
    });
    if (clash) continue;

    return {
      matchId: match.id,
      moveTo: candidate.toISOString(),
      why: `Le créneau de ${slot} est libre le même soir et respecte les contraintes des deux équipes.`,
    };
  }

  return null;
}

/* -----------------------------------------------------------
 * Aperçu d'impact d'un déplacement — lot 5
 * ---------------------------------------------------------*/

export interface ScheduleMove {
  matchId: string;
  /** Nouvel instant ISO. `null` déplanifie le match. */
  scheduledAt: string | null;
}

export interface MoveImpact {
  /** Anomalies que le déplacement fait DISPARAÎTRE. */
  fixed: ScheduleAnomaly[];
  /** Anomalies qu'il CRÉE. */
  broken: ScheduleAnomaly[];
  /** Celles qui étaient là avant et y restent. */
  remaining: ScheduleAnomaly[];
  /** Compteurs avant / après, pour la phrase de résumé. */
  before: Record<ScheduleAnomalySeverity, number>;
  after: Record<ScheduleAnomalySeverity, number>;
  /** Le déplacement crée-t-il au moins une anomalie BLOQUANTE ? */
  createsBlocking: boolean;
}

/**
 * Identité d'une anomalie, pour comparer deux diagnostics.
 *
 * Le message en fait partie : « commence à 20:30 » et « commence à 19:00 » sont
 * deux états différents du même problème, et les confondre ferait passer une
 * correction partielle pour un statu quo.
 */
function anomalyKey(a: ScheduleAnomaly): string {
  return [
    a.kind,
    a.severity,
    a.teamId ?? '',
    [...a.matchIds].sort().join('+'),
    a.message,
  ].join('|');
}

/**
 * Ce qu'un déplacement RÉPARE et ce qu'il CASSE.
 *
 * C'est la leçon de la simulation du 06/09 : un déplacement de match n'est
 * jamais local. Sortir Hinode du 18 septembre libérait une soirée mais en
 * saturait une autre, et il fallait rejouer tout le calendrier pour s'en
 * apercevoir. Ici on le rejoue pour de vrai — deux diagnostics complets, avant
 * et après — sans rien écrire.
 *
 * Plusieurs mouvements d'un coup, parce que l'unité utile n'est pas le
 * déplacement mais l'ÉCHANGE : deux matchs qui permutent leurs créneaux ne se
 * jugent qu'ensemble, chacun pris seul écrasant l'autre.
 */
export function previewMoves(
  matches: DiagnosableMatch[],
  constraints: AvailabilityConstraint[],
  moves: ScheduleMove[],
  options: DiagnoseOptions = {}
): MoveImpact {
  const byId = new Map(moves.map((m) => [m.matchId, m.scheduledAt]));
  const after = matches.map((m) =>
    byId.has(m.id) ? { ...m, scheduledAt: byId.get(m.id) ?? null } : m
  );

  const dBefore = diagnoseSchedule(matches, constraints, options);
  const dAfter = diagnoseSchedule(after, constraints, options);

  const beforeKeys = new Map(dBefore.anomalies.map((a) => [anomalyKey(a), a]));
  const afterKeys = new Map(dAfter.anomalies.map((a) => [anomalyKey(a), a]));

  const fixed: ScheduleAnomaly[] = [];
  const remaining: ScheduleAnomaly[] = [];
  for (const [key, a] of beforeKeys) {
    if (afterKeys.has(key)) remaining.push(a);
    else fixed.push(a);
  }
  const broken: ScheduleAnomaly[] = [];
  for (const [key, a] of afterKeys) {
    if (!beforeKeys.has(key)) broken.push(a);
  }

  return {
    fixed,
    broken,
    remaining,
    before: dBefore.counts,
    after: dAfter.counts,
    createsBlocking: broken.some((a) => a.severity === 'blocking'),
  };
}
