// components/player/ScrimSlotCalendarPicker.tsx
// Sélecteur de créneaux de négociation basé CALENDRIER (drop-in du picker
// datetime-local historique) : on clique jusqu'à 5 créneaux dans une mini-grille
// hebdo (bande horaire du soir, pas de 30 min), récapitulés en chips dessous.
//
// Contrat de sortie IDENTIQUE à ScrimSlotPicker : `onChange` renvoie un tableau
// de chaînes `datetime-local` ('YYYY-MM-DDTHH:mm', heure locale du navigateur),
// donc les appelants (création de demande + contre-proposition) et la
// normalisation serveur restent inchangés.

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/lib/i18n/useLocale';
import { addDaysYmd } from '@/utils/teams/scrimCalendar';
import {
  fmtHourOfDay as fmtHour,
  formatInstant,
} from '@/utils/teams/scrimTime';

const MAX_SLOTS = 5;
const DAYS_AHEAD = 28; // horizon de sélection
const DAYS_PER_PAGE = 7;
const DAY_START_MIN = 10 * 60; // 10:00
const DAY_END_MIN = 24 * 60; // minuit (exclusif)
const STEP_MIN = 30;

export { MAX_SLOTS };

export type ScrimSlotCalendarLabels = {
  slotsLabel: string;
  removeSlot: string;
  maxSlotsHint: string;
  /** Optionnel : « créneaux dans ton fuseau ({tz}) ». */
  timezoneNote?: string;
  prevWeek: string;
  nextWeek: string;
  /** « Semaine du {date} ». */
  weekOf: string;
  /** « {max} créneaux maximum. » (affiché quand on tente d'en ajouter un 6e). */
  maxReached: string;
  /** Vide : aucun créneau sélectionné. */
  empty: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date calendaire locale du jour ('YYYY-MM-DD'). */
function localTodayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Chaîne datetime-local d'une cellule (jour + minute-de-jour). */
function cellValue(day: string, minuteOfDay: number): string {
  return `${day}T${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

export default function ScrimSlotCalendarPicker({
  slots,
  onChange,
  labels,
  accent = 'blue',
  maxSlots = MAX_SLOTS,
}: {
  slots: string[];
  onChange: (slots: string[]) => void;
  labels: ScrimSlotCalendarLabels;
  accent?: 'blue' | 'purple';
  /**
   * Plafond de créneaux. Défaut 5 (proposition ciblée) ; une ANNONCE de
   * recherche ratisse plus large et en autorise davantage (cf.
   * utils/teams/scrimSearch.ts).
   */
  maxSlots?: number;
}) {
  const locale = useLocale();
  const [page, setPage] = useState(0);
  const [maxHit, setMaxHit] = useState(false);
  // Fuseau du navigateur (client-only pour éviter un mismatch SSR).
  const [viewerTz, setViewerTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      setViewerTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setViewerTz(null);
    }
  }, []);

  // Sélection courante = créneaux non vides (drop-in : l'appelant peut passer ['']).
  const selected = useMemo(
    () => new Set(slots.map((s) => s.trim()).filter(Boolean)),
    [slots]
  );

  const today = useMemo(() => localTodayYmd(), []);
  const allDays = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysYmd(today, i)),
    [today]
  );
  const pageCount = Math.max(1, Math.ceil(allDays.length / DAYS_PER_PAGE));
  const days = allDays.slice(
    page * DAYS_PER_PAGE,
    page * DAYS_PER_PAGE + DAYS_PER_PAGE
  );

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START_MIN; m < DAY_END_MIN; m += STEP_MIN) out.push(m);
    return out;
  }, []);

  const accentSel =
    accent === 'purple'
      ? 'bg-purple-500/80 border-purple-300/60'
      : 'bg-blue-500/80 border-blue-300/60';

  const fmtDayHead = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00`);
    return {
      dow: d.toLocaleDateString(locale, { weekday: 'short' }),
      day: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    };
  };

  const echo = (value: string) => formatInstant(value, { locale });

  const toggle = (value: string) => {
    if (selected.has(value)) {
      setMaxHit(false);
      onChange(
        Array.from(selected)
          .filter((v) => v !== value)
          .sort()
      );
      return;
    }
    if (selected.size >= maxSlots) {
      setMaxHit(true);
      return;
    }
    setMaxHit(false);
    onChange([...Array.from(selected), value].sort());
  };

  const remove = (value: string) => {
    setMaxHit(false);
    onChange(
      Array.from(selected)
        .filter((v) => v !== value)
        .sort()
    );
  };

  const sortedSelected = useMemo(() => Array.from(selected).sort(), [selected]);
  const weekLabel = days.length ? fmtDayHead(days[0]).day : '';

  return (
    <div>
      <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
        {labels.slotsLabel}
      </label>

      {/* Navigation semaine */}
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label={labels.prevWeek}
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 hover:bg-white/10 disabled:opacity-40 transition"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={labels.nextWeek}
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 hover:bg-white/10 disabled:opacity-40 transition"
        >
          ›
        </button>
        <span className="ml-1 text-gray-300 tabular-nums">
          {labels.weekOf.replace('{date}', weekLabel)}
        </span>
      </div>

      {/* Grille hebdo (clic = sélectionne / désélectionne) */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-2">
        <div
          className="inline-grid"
          style={{
            gridTemplateColumns: `3.2rem repeat(${days.length}, minmax(2.4rem, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 bg-black/60" />
          {days.map((day) => {
            const { dow, day: dm } = fmtDayHead(day);
            return (
              <div key={`h-${day}`} className="px-1 pb-2 text-center">
                <div className="text-[11px] font-semibold uppercase text-gray-200">
                  {dow}
                </div>
                <div className="text-[10px] text-gray-500">{dm}</div>
              </div>
            );
          })}

          {rows.map((m) => (
            <div key={`r-${m}`} className="contents">
              <div className="sticky left-0 z-10 -mt-px flex items-start justify-end bg-black/60 pr-2 pt-0.5 text-[10px] tabular-nums text-gray-500">
                {m % 60 === 0 ? fmtHour(m) : ''}
              </div>
              {days.map((day) => {
                const value = cellValue(day, m);
                const isSel = selected.has(value);
                return (
                  <button
                    type="button"
                    key={`c-${day}-${m}`}
                    onClick={() => toggle(value)}
                    aria-pressed={isSel}
                    aria-label={`${fmtDayHead(day).dow} ${fmtHour(m)}`}
                    className={`m-px h-6 rounded border transition-colors ${
                      isSel
                        ? accentSel
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Récapitulatif des créneaux sélectionnés (chips) */}
      {sortedSelected.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {sortedSelected.map((value) => (
            <li
              key={value}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-100"
            >
              <span className="capitalize">{echo(value)}</span>
              <button
                type="button"
                onClick={() => remove(value)}
                aria-label={labels.removeSlot}
                title={labels.removeSlot}
                className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-gray-300 hover:bg-red-500/20 hover:text-red-200 hover:border-red-500/40 transition"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-gray-500">{labels.empty}</p>
      )}

      {maxHit && (
        <p className="mt-2 text-xs text-amber-300/80">
          {labels.maxReached.replace('{max}', String(maxSlots))}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500">{labels.maxSlotsHint}</p>
      {labels.timezoneNote && viewerTz && (
        <p className="mt-1 text-xs text-gray-500">
          {labels.timezoneNote.replace('{tz}', viewerTz)}
        </p>
      )}
    </div>
  );
}
