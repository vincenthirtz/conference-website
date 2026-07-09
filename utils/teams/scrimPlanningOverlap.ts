// utils/teams/scrimPlanningOverlap.ts
// Helpers PURS (aucune dépendance Supabase) pour la grille de disponibilités
// partagée d'un scrim planning « When2Meet ». Utilisés à la fois côté serveur
// (validation des slots soumis) et côté client (rendu de la grille + heatmap).
//
// Un slot = chaîne ISO datetime EXACTE (canonique via Date#toISOString), qui
// correspond à un DÉBUT de créneau sur la grille. La géométrie (colonnes/lignes)
// vient de la config de session ; les valeurs peintes sont des instants absolus.
//
// La bande horaire (day_start_min → day_end_min) et les jours sont interprétés
// dans le fuseau `timezone` de la session, puis convertis en instant UTC via
// `getTimeZoneOffsetMs` (Intl.DateTimeFormat, robuste au fuseau machine, gère
// le DST). Le client génère ses cellules avec les mêmes helpers → les slots
// peints tombent exactement sur les clés valides.

import { getTimeZoneOffsetMs } from '@/utils/timezone';

export const PLANNING_PARTIES = ['team1', 'team2', 'staff'] as const;
export type PlanningParty = (typeof PLANNING_PARTIES)[number];

export type PlanningConfig = {
  /** Premier jour de l'horizon, format 'YYYY-MM-DD'. */
  horizonStart: string;
  /** Nombre de jours (colonnes). */
  horizonDays: number;
  /** Granularité d'un slot en minutes (30 ou 60). */
  slotMinutes: number;
  /** Début de la bande horaire, en minutes depuis minuit. */
  dayStartMin: number;
  /** Fin de la bande horaire, en minutes depuis minuit (exclusif). */
  dayEndMin: number;
  /** Fuseau IANA (ex. 'Europe/Paris'). */
  timezone: string;
};

export type PlanningAvailabilityInput = {
  party: PlanningParty;
  userId: string;
  displayName?: string | null;
  slots: string[];
};

export type HeatmapParticipant = {
  party: PlanningParty;
  userId: string;
  displayName: string | null;
};

export type HeatmapCell = {
  count: number;
  parties: PlanningParty[];
  participants: HeatmapParticipant[];
};

export type Heatmap = Record<string, HeatmapCell>;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ajoute `days` jours à une date calendaire 'YYYY-MM-DD' (arithmétique UTC pure). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * 86_400_000);
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(
    next.getUTCDate()
  )}`;
}

/** Liste ordonnée des jours (colonnes) de l'horizon, format 'YYYY-MM-DD'. */
export function horizonDates(cfg: PlanningConfig): string[] {
  const out: string[] = [];
  for (let d = 0; d < cfg.horizonDays; d += 1) {
    out.push(addDays(cfg.horizonStart, d));
  }
  return out;
}

/** Liste ordonnée des minutes-de-jour (lignes) de la bande horaire. */
export function slotMinutesOfDay(cfg: PlanningConfig): number[] {
  const out: number[] = [];
  for (let m = cfg.dayStartMin; m + cfg.slotMinutes <= cfg.dayEndMin; m += cfg.slotMinutes) {
    out.push(m);
  }
  return out;
}

/** Clé ISO (UTC) d'une cellule (jour + minute-de-jour) dans le fuseau de session. */
export function slotKey(
  cfg: PlanningConfig,
  dateStr: string,
  minuteOfDay: number
): string {
  const [y, mo, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  // Traite d'abord l'heure murale comme si elle était UTC, puis corrige de
  // l'offset du fuseau à cet instant. Deuxième passe pour les bascules DST.
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  const off1 = getTimeZoneOffsetMs(new Date(guess), cfg.timezone);
  let utc = guess - off1;
  const off2 = getTimeZoneOffsetMs(new Date(utc), cfg.timezone);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc).toISOString();
}

/** Toutes les clés ISO de slot valides de la grille, dans l'ordre de rendu. */
export function slotKeysForHorizon(cfg: PlanningConfig): string[] {
  const days = horizonDates(cfg);
  const minutes = slotMinutesOfDay(cfg);
  const out: string[] = [];
  for (const day of days) {
    for (const m of minutes) {
      out.push(slotKey(cfg, day, m));
    }
  }
  return out;
}

/** Nombre total de slots de la grille (borne haute d'une soumission). */
export function maxSlotsForConfig(cfg: PlanningConfig): number {
  return horizonDates(cfg).length * slotMinutesOfDay(cfg).length;
}

export type NormalizePlanningSlotsResult =
  | { ok: true; slots: string[] }
  | { ok: false; error: string };

/**
 * Valide et normalise une liste de slots ISO soumis contre la grille de la
 * session : chaque slot doit parser en date valide ET appartenir à la grille,
 * dédupliqué, ordre de grille préservé, borné au nombre de cellules.
 * Une liste vide est valide (= « je n'ai aucune dispo », efface ma peinture).
 */
export function normalizePlanningSlots(
  input: unknown,
  cfg: PlanningConfig
): NormalizePlanningSlotsResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Format de créneaux invalide.' };
  }
  const valid = new Set(slotKeysForHorizon(cfg));
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'Créneau invalide.' };
    }
    const d = new Date(raw.trim());
    if (isNaN(d.getTime())) {
      return { ok: false, error: `Date invalide : ${raw}` };
    }
    const iso = d.toISOString();
    if (!valid.has(iso)) {
      return { ok: false, error: `Créneau hors grille : ${raw}` };
    }
    seen.add(iso);
  }
  if (seen.size > valid.size) {
    return { ok: false, error: 'Trop de créneaux.' };
  }
  // Ré-ordonne selon l'ordre canonique de la grille.
  const slots = slotKeysForHorizon(cfg).filter((k) => seen.has(k));
  return { ok: true, slots };
}

/**
 * Agrège les dispos des participants en heatmap par slot.
 * `count` = nombre de PARTIES distinctes disponibles (staff fusionné, quel que
 * soit le nombre de casters). `participants` conserve l'attribution pour le hover.
 */
export function buildHeatmap(
  availabilities: PlanningAvailabilityInput[]
): Heatmap {
  const map: Heatmap = {};
  for (const av of availabilities) {
    if (!Array.isArray(av.slots)) continue;
    for (const raw of av.slots) {
      if (typeof raw !== 'string') continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString();
      const cell =
        map[key] ?? (map[key] = { count: 0, parties: [], participants: [] });
      if (!cell.parties.includes(av.party)) {
        cell.parties.push(av.party);
      }
      cell.participants.push({
        party: av.party,
        userId: av.userId,
        displayName: av.displayName ?? null,
      });
    }
  }
  for (const key of Object.keys(map)) {
    map[key].count = map[key].parties.length;
  }
  return map;
}

/**
 * Une cellule est « planifiable » dès que les DEUX équipes sont dispo (minimum
 * pour caler un scrim). La présence du staff est un bonus (overlap parfait) —
 * sauf si `requireStaff` est vrai (session `staff_required`), auquel cas le
 * staff doit aussi être présent.
 */
export function isSlotValidatable(
  cell: HeatmapCell | undefined,
  requireStaff = false
): boolean {
  if (!cell) return false;
  const bothTeams =
    cell.parties.includes('team1') && cell.parties.includes('team2');
  if (!requireStaff) return bothTeams;
  return bothTeams && cell.parties.includes('staff');
}

/** Overlap parfait : les 3 parties (2 équipes + staff) sont disponibles. */
export function isFullOverlap(cell: HeatmapCell | undefined): boolean {
  return !!cell && cell.count >= PLANNING_PARTIES.length;
}

/**
 * Réplique le motif horaire du PREMIER jour peint sur tous les jours de
 * l'horizon (« copier lundi → toute la semaine »). Renvoie la nouvelle liste de
 * créneaux ISO, ordonnée selon la grille. Si rien n'est peint, renvoie l'entrée.
 */
export function copyFirstPaintedDayAcrossHorizon(
  cfg: PlanningConfig,
  slots: string[]
): string[] {
  const days = horizonDates(cfg);
  const minutes = slotMinutesOfDay(cfg);
  const selected = new Set(slots);

  let templateMinutes: number[] | null = null;
  for (const day of days) {
    const mins = minutes.filter((m) => selected.has(slotKey(cfg, day, m)));
    if (mins.length > 0) {
      templateMinutes = mins;
      break;
    }
  }
  if (!templateMinutes) return slots.slice();

  const out = new Set<string>();
  for (const day of days) {
    for (const m of templateMinutes) out.add(slotKey(cfg, day, m));
  }
  return slotKeysForHorizon(cfg).filter((k) => out.has(k));
}

/** Jour de semaine (0=dim..6=sam) et minute-de-jour d'un instant ISO dans `tz`. */
export function weekdayAndMinuteInTz(
  iso: string,
  tz: string
): { weekday: number; minute: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = wdMap[get('weekday')];
  if (weekday === undefined) return null;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return { weekday, minute: hour * 60 + parseInt(get('minute'), 10) };
}

/**
 * Motif « dispos habituelles » = ensemble de clés `weekday:minute` déduites de
 * créneaux ISO passés, interprétés dans `tz`. Sert à ré-appliquer les dispos
 * d'une session précédente sur une nouvelle grille.
 */
export function availabilityPatternFromSlots(
  slots: string[],
  tz: string
): string[] {
  const set = new Set<string>();
  for (const iso of slots) {
    const wm = weekdayAndMinuteInTz(iso, tz);
    if (wm) set.add(`${wm.weekday}:${wm.minute}`);
  }
  return Array.from(set);
}

/** Applique un motif `weekday:minute` sur la grille d'une session → slots ISO. */
export function slotsFromPattern(
  cfg: PlanningConfig,
  pattern: string[]
): string[] {
  const patternSet = new Set(pattern);
  const minutes = slotMinutesOfDay(cfg);
  const out: string[] = [];
  for (const day of horizonDates(cfg)) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    for (const m of minutes) {
      if (patternSet.has(`${weekday}:${m}`)) {
        out.push(slotKey(cfg, day, m));
      }
    }
  }
  return out;
}

export type RankedSlot = {
  slot: string;
  count: number;
  full: boolean;
};

/**
 * Classe les créneaux « planifiables » (les 2 équipes présentes) du meilleur au
 * moins bon : d'abord par nombre de parties dispo décroissant (overlap parfait
 * en tête), puis par date croissante (le plus tôt possible à qualité égale).
 * Sert à suggérer le meilleur créneau à valider côté admin.
 */
export function rankValidatableSlots(
  heatmap: Heatmap,
  requireStaff = false
): RankedSlot[] {
  return Object.entries(heatmap)
    .filter(([, cell]) => isSlotValidatable(cell, requireStaff))
    .map(([slot, cell]) => ({
      slot,
      count: cell.count,
      full: isFullOverlap(cell),
    }))
    .sort((a, b) => b.count - a.count || (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
}
