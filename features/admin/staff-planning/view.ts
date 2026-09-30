// features/admin/staff-planning/view.ts — logique PURE d'affichage du planning
// du staff : couleur stable par personne, libellés d'horaire, créneaux →
// événements de l'agenda générique (`MonthCalendar`). Testé seul.

import type { MonthCalendarEvent } from '@/components/admin/calendar/MonthCalendar';
import type { StaffPlanningMatchNight, StaffPlanningSlotRow } from './client';
import { STAFF_PLANNING_ROLES, type StaffPlanningRole } from './schemas';

/**
 * Palette : une teinte par personne, en HEX explicite. Sous
 * `[data-surface=admin]`, le pont Ruban (styles/admin-ruban.css) ramène
 * presque toutes les familles Tailwind sur ses jetons (violets → orchidée,
 * verts → --ok…) : des classes `bg-sky-600` n'y donneraient que deux ou trois
 * teintes. Fond sombre saturé + texte clair (ou l'inverse), contraste ≥ 4,5:1.
 */
export const PERSON_COLORS = [
  { bg: '#7c3aed', fg: '#ffffff' },
  { bg: '#0284c7', fg: '#ffffff' },
  { bg: '#059669', fg: '#ffffff' },
  { bg: '#f59e0b', fg: '#1a1205' },
  { bg: '#e11d48', fg: '#ffffff' },
  { bg: '#0d9488', fg: '#ffffff' },
  { bg: '#c026d3', fg: '#ffffff' },
  { bg: '#84cc16', fg: '#141a05' },
  { bg: '#ea580c', fg: '#ffffff' },
  { bg: '#4f46e5', fg: '#ffffff' },
  { bg: '#06b6d4', fg: '#04181c' },
  { bg: '#db2777', fg: '#ffffff' },
  { bg: '#a16207', fg: '#ffffff' },
  { bg: '#64748b', fg: '#ffffff' },
] as const;

export type PersonColor = (typeof PERSON_COLORS)[number];

/**
 * Couleur d'une personne : par son rang dans la liste triée des pseudos —
 * stable d'un mois à l'autre, et deux personnes ne partagent pas une teinte
 * tant que l'équipe tient dans la palette.
 */
export function personColor(
  name: string,
  people: readonly string[]
): PersonColor {
  const i = people.indexOf(name);
  const idx = i >= 0 ? i : hash(name);
  return PERSON_COLORS[idx % PERSON_COLORS.length];
}

/** Style de puce / pastille d'une couleur de la palette. */
export function chipStyleOf(c: PersonColor) {
  return { backgroundColor: c.bg, color: c.fg };
}
export function dotStyleOf(c: PersonColor) {
  return { backgroundColor: c.bg };
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** « 20:30 » → « 20h30 », « 22:00 » → « 22h ». */
export function hourLabel(t: string): string {
  const [h, m] = t.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** Plage lisible ; minuit final écrit « 00h » comme dans le tableur. */
export function rangeLabel(start: string, end: string): string {
  const e = end === '00:00' ? '00h' : hourLabel(end);
  return `${hourLabel(start)}–${e}`;
}

/** Fin le lendemain (« 22h–00h », « 23h–2h »). */
export function endsNextDay(start: string, end: string): boolean {
  return end <= start;
}

const minuteOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function slotsToEvents(
  slots: readonly StaffPlanningSlotRow[],
  people: readonly string[],
  only: string | null
): MonthCalendarEvent[] {
  return slots
    .filter((s) => !only || s.person_name === only)
    .map((s) => ({
      key: s.id,
      ymd: s.slot_date,
      minute: minuteOf(s.start_time),
      timeLabel: rangeLabel(s.start_time, s.end_time),
      label: s.person_name,
      title: `${s.person_name} · ${rangeLabel(s.start_time, s.end_time)}${s.note ? ` — ${s.note}` : ''}`,
      chipClassName: '',
      chipStyle: chipStyleOf(personColor(s.person_name, people)),
    }));
}

/** Couleurs des soirs de match : couvert (au moins une personne) ou non. */
const NIGHT_COVERED = { backgroundColor: '#2a2230', color: '#e9e1ee' };
const NIGHT_UNCOVERED = { backgroundColor: '#7f1d1d', color: '#ffe4e4' };

/**
 * Soirs de match → puces de tête de journée (avant les créneaux) : « ⚔ 3
 * matchs », en rouge quand personne n'est disponible ce soir-là.
 */
export function matchNightEvents(
  nights: readonly StaffPlanningMatchNight[],
  slots: readonly StaffPlanningSlotRow[],
  labels: { matchesOne: string; matchesMany: string; nobody: string }
): MonthCalendarEvent[] {
  const staffed = new Set(slots.map((s) => s.slot_date));
  return nights.map((n) => {
    const covered = staffed.has(n.date);
    const what = (n.count > 1 ? labels.matchesMany : labels.matchesOne).replace(
      '{count}',
      String(n.count)
    );
    return {
      key: `night:${n.date}`,
      ymd: n.date,
      // Avant tout créneau de la journée.
      minute: -1,
      timeLabel: hourLabel(n.first),
      label: covered ? `⚔ ${what}` : `⚠ ${what} · ${labels.nobody}`,
      chipClassName: 'font-semibold',
      chipStyle: covered ? NIGHT_COVERED : NIGHT_UNCOVERED,
    };
  });
}

/** Rôles couverts / manquants d'une journée (rôles non précisés ignorés). */
export function roleCoverage(daySlots: readonly StaffPlanningSlotRow[]): {
  covered: StaffPlanningRole[];
  missing: StaffPlanningRole[];
  unassigned: number;
} {
  const present = new Set(daySlots.map((s) => s.role).filter(Boolean));
  return {
    covered: STAFF_PLANNING_ROLES.filter((r) => present.has(r)),
    missing: STAFF_PLANNING_ROLES.filter((r) => !present.has(r)),
    unassigned: daySlots.filter((s) => !s.role).length,
  };
}

/** Stats du mois affiché : créneaux, personnes, soirs de match couverts. */
export function monthStats(
  slots: readonly StaffPlanningSlotRow[],
  nights: readonly StaffPlanningMatchNight[],
  month: string
) {
  const inMonth = slots.filter((s) => s.slot_date.slice(0, 7) === month);
  const staffed = new Set(inMonth.map((s) => s.slot_date));
  const monthNights = nights.filter((n) => n.date.slice(0, 7) === month);
  return {
    slots: inMonth.length,
    people: new Set(inMonth.map((s) => s.person_name)).size,
    nights: monthNights.length,
    coveredNights: monthNights.filter((n) => staffed.has(n.date)).length,
    uncovered: monthNights
      .filter((n) => !staffed.has(n.date))
      .map((n) => n.date),
  };
}

/**
 * Récap d'une soirée à coller dans Discord : les soirs de match d'abord, puis
 * une ligne par créneau, rôle entre crochets. Texte brut, markdown Discord.
 */
export function discordRecap(input: {
  dayLabel: string;
  night: StaffPlanningMatchNight | null;
  slots: readonly StaffPlanningSlotRow[];
  roleLabel: (r: StaffPlanningRole) => string;
  labels: { matchesOne: string; matchesMany: string; nobody: string };
}): string {
  const lines = [`**📅 ${input.dayLabel}**`];
  if (input.night) {
    const what = (
      input.night.count > 1 ? input.labels.matchesMany : input.labels.matchesOne
    ).replace('{count}', String(input.night.count));
    lines.push(`⚔ ${what} — ${hourLabel(input.night.first)}`);
  }
  if (input.slots.length === 0) lines.push(`⚠ ${input.labels.nobody}`);
  for (const s of [...input.slots].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  )) {
    const role = s.role ? ` [${input.roleLabel(s.role)}]` : '';
    const note = s.note ? ` — ${s.note}` : '';
    lines.push(
      `• ${s.person_name} ${rangeLabel(s.start_time, s.end_time)}${role}${note}`
    );
  }
  return lines.join('\n');
}

/** Créneaux d'un mois ('YYYY-MM') par personne, pour la légende. */
export function countByPerson(
  slots: readonly StaffPlanningSlotRow[],
  month: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of slots) {
    if (s.slot_date.slice(0, 7) !== month) continue;
    out[s.person_name] = (out[s.person_name] ?? 0) + 1;
  }
  return out;
}
