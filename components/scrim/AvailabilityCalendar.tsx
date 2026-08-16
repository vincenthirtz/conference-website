// components/scrim/AvailabilityCalendar.tsx
// Vue « agenda » façon Google Calendar pour déclarer/visualiser les
// disponibilités d'un scrim planning. Même contrat de props que
// components/scrim/AvailabilityGrid (drop-in interchangeable) :
//   - 'paint'   : je glisse verticalement dans une colonne-jour pour créer un
//                 bloc de dispo (plage horaire continue), re-glisser sur un bloc
//                 l'efface. Snap sur slot_minutes.
//   - 'heatmap' : chaque créneau est coloré selon le nombre de parties dispo ;
//                 clic (admin) pour valider. Ligne rouge « maintenant ».
//
// Axe horaire continu à gauche, colonnes = jours (fenêtre de 7 jours paginée
// dans l'horizon). Idiome dark aligné sur AvailabilityGrid.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  horizonDates,
  slotMinutesOfDay,
  slotKey,
  isSlotValidatable,
  isFullOverlap,
  type PlanningConfig,
  type Heatmap,
  type HeatmapCell,
} from '@/utils/teams/scrimPlanningOverlap';
import { fmtHourOfDay as fmtHour } from '@/utils/teams/scrimTime';
import type { AvailabilityGridLabels } from '@/components/scrim/AvailabilityGrid';

export type AvailabilityCalendarLabels = AvailabilityGridLabels & {
  /** « Semaine du {date} ». */
  weekOf: string;
  /** Bouton semaine précédente (aria). */
  prevWeek: string;
  /** Bouton semaine suivante (aria). */
  nextWeek: string;
  /** Indicateur « aujourd'hui ». */
  todayLabel: string;
};

export type AvailabilityCalendarProps = {
  config: PlanningConfig;
  mode: 'paint' | 'heatmap';
  labels: AvailabilityCalendarLabels;
  accent?: 'blue' | 'purple' | 'emerald';
  value?: string[];
  onChange?: (slots: string[]) => void;
  heatmap?: Heatmap;
  maxParties?: number;
  onSlotClick?: (slotKey: string) => void;
  selectedSlot?: string | null;
  disabled?: boolean;
  /** Session `staff_required` : planifiable seulement avec le staff. */
  requireStaff?: boolean;
  /**
   * Fuseau du visiteur : si fourni et différent du fuseau de la session, l'axe
   * horaire affiche une 2e étiquette (heure locale du visiteur) sous l'heure de
   * référence. La géométrie reste ancrée au fuseau session (aucun désalignement).
   */
  secondaryTz?: string | null;
  /** Si fourni, pagine la fenêtre pour afficher la semaine contenant ce jour. */
  focusDate?: string | null;
};

const HOUR_PX = 48; // hauteur d'une heure pleine
const DAYS_PER_PAGE = 7;

const ACCENT_BLOCK: Record<string, string> = {
  blue: 'bg-blue-500/70 border-blue-300/60',
  purple: 'bg-purple-500/70 border-purple-300/60',
  emerald: 'bg-emerald-500/70 border-emerald-300/60',
};

const HEAT_RAMP = [
  'bg-transparent',
  'bg-emerald-900/50',
  'bg-emerald-600/60',
  'bg-emerald-400/80',
];

function fmtDayHeader(
  dateStr: string,
  timezone: string
): { dow: string; day: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return {
    dow: d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      timeZone: timezone,
    }),
    day: d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    }),
  };
}

/** Date calendaire (Y-M-D) et minutes-de-jour de « maintenant » dans le fuseau. */
function nowInTimezone(timezone: string): { ymd: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: h * 60 + parseInt(get('minute'), 10),
  };
}

export default function AvailabilityCalendar({
  config,
  mode,
  labels,
  accent = 'emerald',
  value,
  onChange,
  heatmap,
  maxParties = 3,
  onSlotClick,
  selectedSlot,
  disabled = false,
  requireStaff = false,
  secondaryTz = null,
  focusDate = null,
}: AvailabilityCalendarProps) {
  const allDays = useMemo(() => horizonDates(config), [config]);
  const rows = useMemo(() => slotMinutesOfDay(config), [config]);
  const slotPx = (HOUR_PX * config.slotMinutes) / 60;
  const colHeight = rows.length * slotPx;
  const pxPerMin = HOUR_PX / 60;

  const pageCount = Math.max(1, Math.ceil(allDays.length / DAYS_PER_PAGE));
  const [page, setPage] = useState(0);
  const days = useMemo(
    () =>
      allDays.slice(page * DAYS_PER_PAGE, page * DAYS_PER_PAGE + DAYS_PER_PAGE),
    [allDays, page]
  );

  // Navigation externe : saute sur la page contenant `focusDate` (ex. depuis la
  // vue mois « overview »).
  useEffect(() => {
    if (!focusDate) return;
    const idx = allDays.indexOf(focusDate);
    if (idx >= 0) setPage(Math.floor(idx / DAYS_PER_PAGE));
  }, [focusDate, allDays]);

  // Clé ISO par (jour, index de ligne).
  const keyAt = useCallback(
    (day: string, rowIdx: number) => slotKey(config, day, rows[rowIdx]),
    [config, rows]
  );

  const selected = useMemo(() => new Set(value ?? []), [value]);

  // Repères d'heures pleines (lignes + libellés) sur l'axe. Si `secondaryTz`
  // diffère du fuseau session, on ajoute l'heure locale du visiteur, calculée
  // sur un jour de référence de la page (l'écart peut varier au fil de l'horizon
  // en cas de bascule DST décalée entre les deux fuseaux — annotation indicative).
  const hourMarks = useMemo(() => {
    const refDay = days[0] ?? allDays[0];
    const secTz =
      secondaryTz && secondaryTz !== config.timezone ? secondaryTz : null;
    const secFmt = secTz
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: secTz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : null;
    const marks: { top: number; label: string; secondary: string | null }[] =
      [];
    const startH = Math.ceil(config.dayStartMin / 60);
    for (let h = startH * 60; h <= config.dayEndMin; h += 60) {
      marks.push({
        top: (h - config.dayStartMin) * pxPerMin,
        label: fmtHour(h),
        secondary:
          secFmt && refDay
            ? secFmt.format(new Date(slotKey(config, refDay, h)))
            : null,
      });
    }
    return marks;
  }, [config, pxPerMin, secondaryTz, days, allDays]);

  // --- Peinture par glissement (une colonne-jour à la fois) ---
  const drag = useRef<null | {
    day: string;
    anchor: number;
    erase: boolean;
  }>(null);
  const [preview, setPreview] = useState<null | {
    day: string;
    from: number;
    to: number;
    erase: boolean;
  }>(null);

  const rowFromClientY = useCallback(
    (clientY: number, colEl: HTMLElement) => {
      const rect = colEl.getBoundingClientRect();
      const idx = Math.floor((clientY - rect.top) / slotPx);
      return Math.max(0, Math.min(rows.length - 1, idx));
    },
    [slotPx, rows.length]
  );

  const commit = useCallback(
    (day: string, from: number, to: number, erase: boolean) => {
      if (!onChange) return;
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const next = new Set(value ?? []);
      for (let i = lo; i <= hi; i += 1) {
        const k = keyAt(day, i);
        if (erase) next.delete(k);
        else next.add(k);
      }
      onChange(Array.from(next));
    },
    [onChange, value, keyAt]
  );

  const onColPointerDown = (day: string) => (e: React.PointerEvent) => {
    if (disabled || mode !== 'paint') return;
    const idx = rowFromClientY(e.clientY, e.currentTarget as HTMLElement);
    const erase = selected.has(keyAt(day, idx));
    drag.current = { day, anchor: idx, erase };
    setPreview({ day, from: idx, to: idx, erase });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onColPointerMove = (day: string) => (e: React.PointerEvent) => {
    if (!drag.current || drag.current.day !== day) return;
    const idx = rowFromClientY(e.clientY, e.currentTarget as HTMLElement);
    setPreview({
      day,
      from: drag.current.anchor,
      to: idx,
      erase: drag.current.erase,
    });
  };

  const endDrag = () => {
    if (drag.current && preview) {
      commit(drag.current.day, preview.from, preview.to, drag.current.erase);
    }
    drag.current = null;
    setPreview(null);
  };

  // Regroupe les créneaux sélectionnés consécutifs d'un jour en blocs.
  const blocksForDay = useCallback(
    (day: string) => {
      const blocks: { from: number; to: number }[] = [];
      let start = -1;
      for (let i = 0; i < rows.length; i += 1) {
        const on = selected.has(keyAt(day, i));
        if (on && start === -1) start = i;
        if (!on && start !== -1) {
          blocks.push({ from: start, to: i - 1 });
          start = -1;
        }
      }
      if (start !== -1) blocks.push({ from: start, to: rows.length - 1 });
      return blocks;
    },
    [rows.length, selected, keyAt]
  );

  const now = useMemo(() => nowInTimezone(config.timezone), [config.timezone]);
  const [hover, setHover] = useState<{ cell: HeatmapCell } | null>(null);

  const blockAccent = ACCENT_BLOCK[accent] ?? ACCENT_BLOCK.emerald;

  return (
    <div className="select-none">
      {/* Barre de navigation semaine */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-[0.12em] uppercase text-gray-300">
          {labels.legendTitle}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <button
              type="button"
              aria-label={labels.prevWeek}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 disabled:opacity-30 hover:bg-white/10 transition"
            >
              ‹
            </button>
            <span className="tabular-nums">
              {labels.weekOf.replace(
                '{date}',
                fmtDayHeader(days[0], config.timezone).day
              )}
            </span>
            <button
              type="button"
              aria-label={labels.nextWeek}
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 disabled:opacity-30 hover:bg-white/10 transition"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {mode === 'paint' && (
        <p className="mb-2 text-xs text-gray-500">{labels.paintHint}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-2">
        <div className="flex min-w-[560px]">
          {/* Gouttière d'heures */}
          <div className="w-14 flex-shrink-0 pt-8">
            <div className="relative" style={{ height: colHeight }}>
              {hourMarks.map((m) => (
                <div
                  key={m.label}
                  className="absolute right-1 -translate-y-1/2 text-right tabular-nums leading-tight"
                  style={{ top: m.top }}
                >
                  <span className="block text-[10px] text-gray-500">
                    {m.label}
                  </span>
                  {m.secondary && (
                    <span className="block text-[9px] text-sky-400/70">
                      {m.secondary}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Colonnes-jour */}
          <div className="flex flex-1 gap-1">
            {days.map((day) => {
              const isToday = day === now.ymd;
              const showNow =
                isToday &&
                now.minutes >= config.dayStartMin &&
                now.minutes <= config.dayEndMin;
              return (
                <div key={day} className="flex-1 min-w-[64px]">
                  {/* En-tête jour */}
                  <div
                    className={`h-8 text-center ${
                      isToday ? 'text-emerald-300' : 'text-gray-200'
                    }`}
                  >
                    <div className="text-[11px] font-semibold uppercase">
                      {fmtDayHeader(day, config.timezone).dow}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {fmtDayHeader(day, config.timezone).day}
                    </div>
                  </div>

                  {/* Colonne */}
                  <div
                    className="relative rounded-lg border border-white/5 bg-white/[0.02] touch-none"
                    style={{ height: colHeight }}
                    onPointerDown={onColPointerDown(day)}
                    onPointerMove={onColPointerMove(day)}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    {/* Lignes d'heures */}
                    {hourMarks.map((m) => (
                      <div
                        key={m.label}
                        className="absolute inset-x-0 border-t border-white/5"
                        style={{ top: m.top }}
                      />
                    ))}

                    {/* Mode heatmap : segments colorés par créneau */}
                    {mode === 'heatmap' &&
                      rows.map((_, i) => {
                        const key = keyAt(day, i);
                        const cell = heatmap?.[key];
                        const count = cell?.count ?? 0;
                        if (count === 0 && selectedSlot !== key) return null;
                        const idx = Math.min(
                          count,
                          HEAT_RAMP.length - 1,
                          maxParties
                        );
                        const clickable = !!onSlotClick && !disabled;
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!clickable}
                            onPointerEnter={() => cell && setHover({ cell })}
                            onPointerLeave={() => setHover(null)}
                            onClick={() => clickable && onSlotClick?.(key)}
                            className={`absolute inset-x-0.5 rounded ${HEAT_RAMP[idx]} ${
                              isFullOverlap(cell)
                                ? 'shadow-[0_0_8px_-1px] shadow-emerald-400/60'
                                : ''
                            } ${
                              selectedSlot === key
                                ? 'ring-2 ring-emerald-300'
                                : ''
                            } ${clickable ? 'cursor-pointer hover:brightness-125' : ''} ${
                              isSlotValidatable(cell, requireStaff)
                                ? 'border-b-2 border-emerald-200/70'
                                : ''
                            }`}
                            style={{ top: i * slotPx, height: slotPx - 1 }}
                            title={fmtHour(rows[i])}
                          />
                        );
                      })}

                    {/* Mode paint : blocs de dispo */}
                    {mode === 'paint' &&
                      blocksForDay(day).map((b) => (
                        <div
                          key={`${day}-${b.from}`}
                          className={`absolute inset-x-0.5 rounded-md border ${blockAccent} shadow-sm`}
                          style={{
                            top: b.from * slotPx,
                            height: (b.to - b.from + 1) * slotPx - 2,
                          }}
                        >
                          <span className="block px-1 pt-0.5 text-[9px] font-medium text-white/90">
                            {fmtHour(rows[b.from])}
                          </span>
                        </div>
                      ))}

                    {/* Aperçu du glissement en cours */}
                    {mode === 'paint' &&
                      preview &&
                      preview.day === day &&
                      (() => {
                        const lo = Math.min(preview.from, preview.to);
                        const hi = Math.max(preview.from, preview.to);
                        return (
                          <div
                            className={`absolute inset-x-0.5 rounded-md border-2 border-dashed ${
                              preview.erase
                                ? 'border-red-300/70 bg-red-500/20'
                                : 'border-white/60 bg-white/15'
                            }`}
                            style={{
                              top: lo * slotPx,
                              height: (hi - lo + 1) * slotPx,
                            }}
                          />
                        );
                      })()}

                    {/* Ligne « maintenant » */}
                    {showNow && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                        style={{
                          top: (now.minutes - config.dayStartMin) * pxPerMin,
                        }}
                      >
                        <span className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-red-500" />
                        <span className="h-px flex-1 bg-red-500/80" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tooltip overlap (heatmap) */}
      {mode === 'heatmap' && hover && hover.cell.count > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-gray-300">
          <span className="font-medium text-gray-100">
            {labels.availableCount.replace('{count}', String(hover.cell.count))}
          </span>
          {isFullOverlap(hover.cell) && (
            <span className="ml-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              {labels.fullOverlap}
            </span>
          )}
          {hover.cell.participants.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {hover.cell.participants.map((p, i) => (
                <span
                  key={`${p.userId}-${i}`}
                  className="rounded-md bg-black/40 px-2 py-0.5 text-[11px] text-gray-300"
                >
                  {p.displayName || p.party}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'paint' && selected.size === 0 && (
        <p className="mt-3 text-xs text-gray-500">{labels.empty}</p>
      )}
    </div>
  );
}
