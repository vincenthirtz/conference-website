// utils/teams/teamRhythm.ts
//
// « Rythme d'équipe » (N1) — la disponibilité RÉCURRENTE d'un roster.
//
// Pourquoi une troisième notion de créneau alors qu'il en existe déjà deux :
//
//   - `scrim_plannings` (When2Meet) est une grille PAR SCRIM : elle suppose
//     qu'un scrim existe déjà. 0 grille remplie en prod.
//   - `scrim_searches` porte des créneaux PONCTUELS : « ce jeudi 21 h ».
//
//   Aucune des deux ne capte le fait de base d'une équipe amateur : **on joue
//   mardi et jeudi à 21 h**. C'est une HABITUDE, pas un événement. Tant qu'elle
//   n'est pas déclarée, chaque scrim recommence à zéro la question des dispos,
//   et le système ne peut rien déduire du rythme de l'équipe.
//
// Deux propriétés qui font tout l'intérêt de ce module :
//
//   1. Il vaut à UNE SEULE équipe. Une équipe de 5 sans aucune autre équipe sur
//      la plateforme y gagne déjà « on est au complet le mardi 21 h, pas le
//      jeudi » — un fait qu'elle n'a nulle part ailleurs. Le réseau n'a pas
//      besoin d'être dense pour que ça serve.
//
//   2. Il PRODUIT des instants réels. Une habitude hebdomadaire se projette sur
//      les jours à venir en ISO datetimes exacts — c'est-à-dire exactement le
//      type de créneau qu'attendent `scrim_searches` et `scrim_nego`. Le rythme
//      n'est donc pas un silo : il alimente l'annonce de scrim et le matching.
//
// CONVENTIONS
//
//   - Un créneau récurrent est une clé `"<weekday>-<minutes>"` où `weekday` est
//     le jour ISO (1 = lundi … 7 = dimanche) et `minutes` le début du créneau en
//     minutes depuis minuit, DANS LE FUSEAU DU MEMBRE.
//   - Granularité HORAIRE (et non demi-heure comme les autres grilles) : une
//     habitude, ça se dit « 21 h », pas « 21 h 30 ». Une grille deux fois plus
//     fine serait deux fois plus pénible à peindre pour zéro information utile.
//   - Chaque membre déclare dans SON fuseau. L'agrégation ne compare donc jamais
//     des clés brutes entre fuseaux différents : elle passe par la projection en
//     instants absolus (cf. `projectRhythmSlot`), qui gère le DST via
//     `getTimeZoneOffsetMs`.

import { getTimeZoneOffsetMs } from '@/utils/timezone';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';

/** Granularité d'un créneau récurrent, en minutes. */
export const RHYTHM_SLOT_MINUTES = 60;

/** Début de la bande horaire couverte par la grille (minutes depuis minuit). */
export const RHYTHM_DAY_START_MIN = 14 * 60;

/** Fin de la bande horaire, exclusive. */
export const RHYTHM_DAY_END_MIN = 24 * 60;

/** Jours ISO, lundi d'abord — l'ordre d'affichage de la grille. */
export const RHYTHM_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type RhythmWeekday = (typeof RHYTHM_WEEKDAYS)[number];

/** Minutes-de-jour de la bande horaire (lignes de la grille). */
export function rhythmMinutesOfDay(): number[] {
  const out: number[] = [];
  for (
    let m = RHYTHM_DAY_START_MIN;
    m < RHYTHM_DAY_END_MIN;
    m += RHYTHM_SLOT_MINUTES
  ) {
    out.push(m);
  }
  return out;
}

/** Nombre total de cellules de la grille — borne haute d'une déclaration. */
export const MAX_RHYTHM_SLOTS =
  RHYTHM_WEEKDAYS.length *
  Math.ceil((RHYTHM_DAY_END_MIN - RHYTHM_DAY_START_MIN) / RHYTHM_SLOT_MINUTES);

export type ParsedRhythmSlot = { weekday: RhythmWeekday; minutes: number };

/** Clé canonique d'un créneau récurrent. */
export function rhythmSlotKey(weekday: number, minutes: number): string {
  return `${weekday}-${minutes}`;
}

/**
 * Parse une clé de créneau. Renvoie `null` pour tout ce qui ne tombe PAS
 * exactement sur la grille : jour hors 1-7, minute hors bande, ou non alignée
 * sur le pas. Une clé libre laisserait entrer des créneaux invisibles dans la
 * grille — donc impossibles à décocher.
 */
export function parseRhythmSlot(key: unknown): ParsedRhythmSlot | null {
  if (typeof key !== 'string') return null;
  const match = /^([1-7])-(\d{1,4})$/.exec(key.trim());
  if (!match) return null;
  const weekday = parseInt(match[1], 10) as RhythmWeekday;
  const minutes = parseInt(match[2], 10);
  if (minutes < RHYTHM_DAY_START_MIN || minutes >= RHYTHM_DAY_END_MIN) {
    return null;
  }
  if ((minutes - RHYTHM_DAY_START_MIN) % RHYTHM_SLOT_MINUTES !== 0) return null;
  return { weekday, minutes };
}

/** Ordre d'affichage : par jour, puis par heure. */
function compareRhythmSlots(a: string, b: string): number {
  const pa = parseRhythmSlot(a);
  const pb = parseRhythmSlot(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.weekday !== pb.weekday) return pa.weekday - pb.weekday;
  return pa.minutes - pb.minutes;
}

export type NormalizeRhythmResult =
  | { ok: true; slots: string[] }
  | { ok: false; error: string };

/**
 * Valide/normalise une déclaration : clés valides, dédupliquées, ordonnées.
 * Le tableau VIDE est légitime — c'est ainsi qu'on retire sa disponibilité.
 */
export function normalizeRhythmSlots(input: unknown): NormalizeRhythmResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Créneaux invalides.' };
  }
  if (input.length > MAX_RHYTHM_SLOTS) {
    return {
      ok: false,
      error: `Maximum ${MAX_RHYTHM_SLOTS} créneaux.`,
    };
  }
  const seen = new Set<string>();
  for (const raw of input) {
    const parsed = parseRhythmSlot(raw);
    if (!parsed) {
      return { ok: false, error: `Créneau invalide : ${String(raw)}` };
    }
    seen.add(rhythmSlotKey(parsed.weekday, parsed.minutes));
  }
  return { ok: true, slots: Array.from(seen).sort(compareRhythmSlots) };
}

// ---------------------------------------------------------------------------
// Agrégation : de N déclarations individuelles au rythme de l'équipe
// ---------------------------------------------------------------------------

export type RhythmMemberInput = {
  userId: string;
  /** Fuseau IANA du membre. */
  timezone: string;
  slots: string[];
};

export type RhythmCell = { count: number; userIds: string[] };

/** Heatmap indexée par clé de créneau, exprimée dans le fuseau de RÉFÉRENCE. */
export type RhythmHeatmap = Record<string, RhythmCell>;

/**
 * Agrège les déclarations de plusieurs membres dans un fuseau de référence
 * (celui de l'équipe, en pratique celui de la personne qui regarde).
 *
 * Le passage par un fuseau de référence est ce qui rend l'agrégation correcte
 * quand une joueuse est au Québec : son « mardi 21 h » n'est pas le « mardi
 * 21 h » de Paris, et les additionner tels quels produirait un noyau fantôme.
 * On projette donc chaque créneau sur une occurrence concrète (`reference`),
 * puis on le relit dans le fuseau de référence.
 */
export function buildRhythmHeatmap(
  members: RhythmMemberInput[],
  referenceTimezone: string,
  from: Date = new Date()
): RhythmHeatmap {
  const heatmap: RhythmHeatmap = {};
  for (const member of members) {
    const seen = new Set<string>();
    for (const slot of member.slots) {
      const parsed = parseRhythmSlot(slot);
      if (!parsed) continue;
      const key =
        member.timezone === referenceTimezone
          ? rhythmSlotKey(parsed.weekday, parsed.minutes)
          : rebaseRhythmSlot(parsed, member.timezone, referenceTimezone, from);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cell = heatmap[key] ?? { count: 0, userIds: [] };
      cell.count += 1;
      cell.userIds.push(member.userId);
      heatmap[key] = cell;
    }
  }
  return heatmap;
}

/**
 * Effectif à partir duquel un créneau est considéré comme « noyau ».
 *
 * On ne demande pas l'unanimité : au-delà de l'effectif titulaire, un créneau
 * est jouable même si les remplaçantes ne sont pas là. En dessous, on exige
 * tout le monde — un créneau où 2 personnes sur 3 sont libres n'est pas un
 * créneau d'entraînement.
 */
export function rhythmCoreThreshold(memberCount: number): number {
  if (memberCount <= 0) return 1;
  return Math.min(MAX_TEAM_PLAYERS, memberCount);
}

/** Créneaux où l'effectif requis est atteint, dans l'ordre de la semaine. */
export function coreRhythmSlots(
  heatmap: RhythmHeatmap,
  threshold: number
): string[] {
  return Object.entries(heatmap)
    .filter(([, cell]) => cell.count >= threshold)
    .map(([key]) => key)
    .sort(compareRhythmSlots);
}

/** Créneaux récurrents communs à deux équipes (clés du même fuseau). */
export function overlappingRhythmSlots(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((slot) => set.has(slot)).sort(compareRhythmSlots);
}

// ---------------------------------------------------------------------------
// Projection : de l'habitude hebdomadaire aux instants réels
// ---------------------------------------------------------------------------

/** Minuit local du jour de `date` dans `timeZone`, lu comme date UTC. */
function localCalendarDate(date: Date, timeZone: string): Date {
  return new Date(date.getTime() + getTimeZoneOffsetMs(date, timeZone));
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date lue en UTC. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Instant UTC (ms) correspondant à une date calendaire + une minute-de-jour,
 * interprétées dans `timeZone`.
 *
 * Double passe volontaire (même technique que `localInputToUTC`) : le premier
 * décalage est estimé sur un instant approximatif, ce qui peut tomber du
 * mauvais côté d'un changement d'heure ; la seconde passe le corrige.
 */
function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string
): number {
  const guess = Date.UTC(
    year,
    month,
    day,
    Math.floor(minutes / 60),
    minutes % 60
  );
  const off1 = getTimeZoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - off1;
  const off2 = getTimeZoneOffsetMs(new Date(utc), timeZone);
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

/**
 * Prochaine occurrence CONCRÈTE d'un créneau récurrent, en ISO UTC.
 * Renvoie `null` si aucune occurrence n'est trouvée dans les 8 jours (ne
 * devrait pas arriver : un jour de la semaine revient toujours).
 */
export function projectRhythmSlot(
  slot: ParsedRhythmSlot,
  timeZone: string,
  from: Date = new Date()
): string | null {
  const localNow = localCalendarDate(from, timeZone);
  const baseUtcDay = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = new Date(baseUtcDay + offset * 86_400_000);
    if (isoWeekday(day) !== slot.weekday) continue;
    const utcMs = zonedTimeToUtcMs(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      slot.minutes,
      timeZone
    );
    if (utcMs > from.getTime()) return new Date(utcMs).toISOString();
  }
  return null;
}

/**
 * Réexprime un créneau récurrent déclaré dans `fromZone` en une clé de grille
 * valable dans `toZone`. Passe par une occurrence concrète : c'est la seule
 * façon correcte de traverser un décalage qui n'est pas constant (DST).
 *
 * Renvoie `null` quand la projection tombe hors de la bande horaire de la
 * grille — un « 22 h à Montréal » n'a tout simplement pas de case côté Paris.
 */
function rebaseRhythmSlot(
  slot: ParsedRhythmSlot,
  fromZone: string,
  toZone: string,
  from: Date
): string | null {
  const iso = projectRhythmSlot(slot, fromZone, from);
  if (!iso) return null;
  const instant = new Date(iso);
  const local = localCalendarDate(instant, toZone);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < RHYTHM_DAY_START_MIN || minutes >= RHYTHM_DAY_END_MIN) {
    return null;
  }
  const aligned =
    minutes - ((minutes - RHYTHM_DAY_START_MIN) % RHYTHM_SLOT_MINUTES);
  return rhythmSlotKey(isoWeekday(local), aligned);
}

/**
 * Projette une liste de créneaux récurrents sur les prochaines occurrences,
 * triées, dédupliquées et plafonnées.
 *
 * C'est le pont vers le reste du domaine scrim : la sortie est directement
 * consommable par `normalizeSearchSlots` (annonce de scrim) et par la
 * négociation multi-créneaux.
 */
export function projectRhythmSlots(
  slots: string[],
  timeZone: string,
  { from = new Date(), max = 10 }: { from?: Date; max?: number } = {}
): string[] {
  const out = new Set<string>();
  for (const slot of slots) {
    const parsed = parseRhythmSlot(slot);
    if (!parsed) continue;
    const iso = projectRhythmSlot(parsed, timeZone, from);
    if (iso) out.add(iso);
  }
  return Array.from(out).sort().slice(0, max);
}
