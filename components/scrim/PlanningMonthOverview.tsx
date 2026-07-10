// components/scrim/PlanningMonthOverview.tsx
// Vue MOIS « overview » (lecture seule) d'une grille de dispos scrim, côté
// joueur. Sur un horizon long (jusqu'à 42 jours), la vue calendrier pagine par
// semaine ; ce mois donne une vue d'ensemble et sert de navigation : chaque jour
// de l'horizon porte des pastilles de densité (mes dispos / overlap planifiable)
// et un clic renvoie la vue calendrier sur la semaine correspondante.
//
// Présentation pure : aucune peinture ici (cf. AvailabilityCalendar/Grid).

import { useMemo, useState } from 'react';
import {
  horizonDates,
  slotMinutesOfDay,
  slotKey,
  isSlotValidatable,
  type PlanningConfig,
  type Heatmap,
} from '@/utils/teams/scrimPlanningOverlap';
import {
  mondayOf,
  addDaysYmd,
  todayYmdInTz,
} from '@/utils/teams/scrimCalendar';

export type PlanningMonthLabels = {
  monthPrev: string;
  monthNext: string;
  legendMine: string;
  legendValidatable: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

function weekdayHeads(tz: string): string[] {
  // 2024-01-01 est un lundi (référence arbitraire).
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`2024-01-0${i + 1}T12:00:00Z`);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: tz });
  });
}

function shiftMonth(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split('-').map((v) => parseInt(v, 10));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-01`;
}

type DayStat = { mine: boolean; overlap: number; validatable: boolean };

export default function PlanningMonthOverview({
  config,
  value,
  heatmap,
  requireStaff = false,
  labels,
  onSelectDay,
}: {
  config: PlanningConfig;
  value?: string[];
  heatmap?: Heatmap;
  requireStaff?: boolean;
  labels: PlanningMonthLabels;
  onSelectDay: (ymd: string) => void;
}) {
  const heads = useMemo(() => weekdayHeads(config.timezone), [config.timezone]);
  const todayYmd = useMemo(
    () => todayYmdInTz(config.timezone),
    [config.timezone]
  );

  // Jours de l'horizon + stats par jour (mes dispos / overlap planifiable).
  const { horizonSet, statsByDay } = useMemo(() => {
    const days = horizonDates(config);
    const rows = slotMinutesOfDay(config);
    const mine = new Set(value ?? []);
    const set = new Set(days);
    const stats: Record<string, DayStat> = {};
    for (const day of days) {
      let hasMine = false;
      let overlap = 0;
      let validatable = false;
      for (const m of rows) {
        const key = slotKey(config, day, m);
        if (mine.has(key)) hasMine = true;
        const cell = heatmap?.[key];
        if (cell) {
          overlap = Math.max(overlap, cell.count);
          if (isSlotValidatable(cell, requireStaff)) validatable = true;
        }
      }
      stats[day] = { mine: hasMine, overlap, validatable };
    }
    return { horizonSet: set, statsByDay: stats };
  }, [config, value, heatmap, requireStaff]);

  // Ancre du mois affiché : par défaut le mois du 1er jour de l'horizon.
  const [monthAnchor, setMonthAnchor] = useState(
    () => `${config.horizonStart.slice(0, 7)}-01`
  );
  const anchorMonth = monthAnchor.slice(0, 7);

  const gridDays = useMemo(() => {
    const start = mondayOf(monthAnchor);
    return Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i));
  }, [monthAnchor]);

  const monthLabel = new Date(`${monthAnchor}T12:00:00Z`).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric', timeZone: config.timezone }
  );

  return (
    <div className="select-none">
      {/* Barre de navigation mois + légende */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            aria-label={labels.monthPrev}
            onClick={() => setMonthAnchor(shiftMonth(monthAnchor, -1))}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 hover:bg-white/10 transition"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={labels.monthNext}
            onClick={() => setMonthAnchor(shiftMonth(monthAnchor, 1))}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 hover:bg-white/10 transition"
          >
            ›
          </button>
          <span className="ml-1 capitalize text-gray-200">{monthLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            {labels.legendMine}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {labels.legendValidatable}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-2">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 gap-1 pb-1">
            {heads.map((h) => (
              <div
                key={h}
                className="text-center text-[11px] font-semibold uppercase text-gray-500"
              >
                {h}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const inMonth = day.slice(0, 7) === anchorMonth;
              const inHorizon = horizonSet.has(day);
              const isToday = day === todayYmd;
              const stat = statsByDay[day];
              const dayNum = parseInt(day.slice(8, 10), 10);
              const clickable = inHorizon;
              return (
                <button
                  type="button"
                  key={day}
                  disabled={!clickable}
                  onClick={() => clickable && onSelectDay(day)}
                  className={`flex min-h-[64px] flex-col items-center rounded-lg border p-1 text-left transition ${
                    inHorizon
                      ? 'border-white/15 bg-white/[0.04] hover:border-white/30 cursor-pointer'
                      : inMonth
                        ? 'border-white/5 bg-white/[0.02] opacity-60'
                        : 'border-transparent bg-transparent opacity-30'
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold tabular-nums ${
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-black'
                        : inMonth
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {stat && (stat.mine || stat.overlap > 0) && (
                    <span className="mt-1 flex items-center gap-1">
                      {stat.mine && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-blue-400"
                          aria-hidden="true"
                        />
                      )}
                      {stat.overlap > 0 && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            stat.validatable
                              ? 'bg-emerald-400'
                              : 'bg-emerald-700'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
