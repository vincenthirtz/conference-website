// components/admin/scrims/ScrimMonthCalendar.tsx
// Agenda admin — VUE MOIS. Grille 6×7 (lundi en tête) du mois affiché, avec les
// jours débordants (fin du mois précédent / début du suivant) grisés. Chaque
// cellule liste jusqu'à 3 puces d'événements (scrims colorés par statut +
// matches gris) triées par heure, avec un « +N » de débordement.
//   - clic sur une puce  → onOpenScrim(id) / onOpenMatch(id)
//   - clic sur une cellule → onSelectDay(ymd) (le parent bascule en vue semaine)
// Présentation pure : aucun fetch. Réutilise dateAndMinuteInTz pour placer les
// événements dans le fuseau `tz`.

import { useMemo, useState } from 'react';
import {
  mondayOf,
  addDaysYmd,
  dateAndMinuteInTz,
  todayYmdInTz,
} from '@/utils/teams/scrimCalendar';
import { fmtHourOfDay as fmtHour } from '@/utils/teams/scrimTime';
import type {
  CalendarScrim,
  CalendarMatch,
} from '@/components/admin/scrims/ScrimCalendar';

export type ScrimMonthLabels = {
  monthPrev: string;
  monthNext: string;
  matchTag: string;
  moreEvents: string; // reçoit {count}
  collapse: string; // « réduire » (replier les événements dépliés)
};

const MAX_CHIPS = 3;
const pad2 = (n: number) => String(n).padStart(2, '0');

const STATUS_CHIP: Record<string, string> = {
  draft: 'bg-neutral-600/80 text-neutral-100',
  scheduled: 'bg-blue-600/80 text-white',
  running: 'bg-emerald-600/80 text-white',
  completed: 'bg-purple-600/80 text-white',
  cancelled: 'bg-red-700/70 text-red-100 line-through',
};

type DayEvent =
  | { kind: 'scrim'; id: string; minute: number; label: string; status: string }
  | { kind: 'match'; id: string; minute: number; label: string };

function weekdayHeads(tz: string): string[] {
  // Lundi de référence arbitraire (2024-01-01 est un lundi).
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`2024-01-0${i + 1}T12:00:00Z`);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: tz });
  });
}

export default function ScrimMonthCalendar({
  tz,
  monthAnchor,
  scrims,
  matches = [],
  labels,
  onMonthChange,
  onSelectDay,
  onOpenScrim,
  onOpenMatch,
}: {
  tz: string;
  /** Premier jour du mois affiché ('YYYY-MM-01'). */
  monthAnchor: string;
  scrims: CalendarScrim[];
  matches?: CalendarMatch[];
  labels: ScrimMonthLabels;
  onMonthChange: (monthAnchor: string) => void;
  onSelectDay: (dayYmd: string) => void;
  onOpenScrim: (id: string) => void;
  onOpenMatch: (id: string) => void;
}) {
  const anchorMonth = monthAnchor.slice(0, 7); // 'YYYY-MM'
  const todayYmd = useMemo(() => todayYmdInTz(tz), [tz]);
  const heads = useMemo(() => weekdayHeads(tz), [tz]);
  // Jour dont on a déplié tous les événements sur place (« +N » → tout afficher).
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const gridDays = useMemo(() => {
    const start = mondayOf(monthAnchor);
    return Array.from({ length: 42 }, (_, i) => addDaysYmd(start, i));
  }, [monthAnchor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    for (const s of scrims) {
      if (!s.scheduled_date) continue;
      const pos = dateAndMinuteInTz(s.scheduled_date, tz);
      if (!pos) continue;
      const label =
        s.team1Name || s.team2Name
          ? `${s.team1Name ?? '?'} vs ${s.team2Name ?? '?'}`
          : s.name;
      (map[pos.ymd] ??= []).push({
        kind: 'scrim',
        id: s.id,
        minute: pos.minute,
        label,
        status: s.status,
      });
    }
    for (const m of matches) {
      if (!m.scheduled_at) continue;
      const pos = dateAndMinuteInTz(m.scheduled_at, tz);
      if (!pos) continue;
      const label =
        m.team1Name || m.team2Name
          ? `${m.team1Name ?? '?'} vs ${m.team2Name ?? '?'}`
          : labels.matchTag;
      (map[pos.ymd] ??= []).push({
        kind: 'match',
        id: m.id,
        minute: pos.minute,
        label,
      });
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.minute - b.minute);
    }
    return map;
  }, [scrims, matches, tz, labels.matchTag]);

  const monthLabel = new Date(`${monthAnchor}T12:00:00Z`).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric', timeZone: tz }
  );

  const prevMonth = () => onMonthChange(shiftMonth(monthAnchor, -1));
  const nextMonth = () => onMonthChange(shiftMonth(monthAnchor, 1));

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label={labels.monthPrev}
          onClick={prevMonth}
          className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 hover:bg-neutral-800 transition"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={labels.monthNext}
          onClick={nextMonth}
          className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 hover:bg-neutral-800 transition"
        >
          ›
        </button>
        <span className="ml-1 text-neutral-200 capitalize">{monthLabel}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
        <div className="min-w-[720px]">
          {/* En-têtes de jours */}
          <div className="grid grid-cols-7 gap-1 pb-1">
            {heads.map((h) => (
              <div
                key={h}
                className="text-center text-[11px] font-semibold uppercase text-neutral-400"
              >
                {h}
              </div>
            ))}
          </div>

          {/* Grille 6×7 */}
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const inMonth = day.slice(0, 7) === anchorMonth;
              const isToday = day === todayYmd;
              const events = eventsByDay[day] ?? [];
              const isExpanded = expandedDay === day;
              const shown = isExpanded ? events : events.slice(0, MAX_CHIPS);
              const overflow = events.length - shown.length;
              const dayNum = parseInt(day.slice(8, 10), 10);
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => onSelectDay(day)}
                  className={`flex min-h-[92px] flex-col rounded-lg border p-1 text-left transition hover:border-neutral-600 ${
                    inMonth
                      ? 'border-neutral-800 bg-neutral-950/40'
                      : 'border-neutral-900 bg-neutral-950/20 opacity-50'
                  }`}
                >
                  <span
                    className={`mb-1 text-[11px] font-semibold tabular-nums ${
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-emerald-500 text-neutral-900'
                        : inMonth
                          ? 'text-neutral-300'
                          : 'text-neutral-600'
                    }`}
                  >
                    {dayNum}
                  </span>

                  <span className="flex flex-col gap-0.5">
                    {shown.map((ev) => {
                      const chipCls =
                        ev.kind === 'match'
                          ? 'bg-neutral-700/70 text-neutral-300'
                          : (STATUS_CHIP[ev.status] ?? STATUS_CHIP.draft);
                      return (
                        <span
                          key={`${ev.kind}-${ev.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ev.kind === 'scrim') onOpenScrim(ev.id);
                            else onOpenMatch(ev.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              e.preventDefault();
                              if (ev.kind === 'scrim') onOpenScrim(ev.id);
                              else onOpenMatch(ev.id);
                            }
                          }}
                          title={`${fmtHour(ev.minute)} — ${ev.label}`}
                          className={`block cursor-pointer truncate rounded px-1 py-0.5 text-[9px] leading-tight hover:brightness-110 ${chipCls}`}
                        >
                          <span className="tabular-nums">
                            {fmtHour(ev.minute)}
                          </span>{' '}
                          {ev.kind === 'match' ? `[${labels.matchTag}] ` : ''}
                          {ev.label}
                        </span>
                      );
                    })}
                    {overflow > 0 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDay(day);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            setExpandedDay(day);
                          }
                        }}
                        className="cursor-pointer rounded px-1 text-[9px] text-neutral-400 hover:text-neutral-200"
                      >
                        {labels.moreEvents.replace('{count}', String(overflow))}
                      </span>
                    )}
                    {isExpanded && events.length > MAX_CHIPS && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDay(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            setExpandedDay(null);
                          }
                        }}
                        className="cursor-pointer rounded px-1 text-[9px] text-neutral-400 hover:text-neutral-200"
                      >
                        {labels.collapse}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Décale un 'YYYY-MM-01' de n mois, renvoie le 1er du mois cible.
function shiftMonth(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split('-').map((v) => parseInt(v, 10));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-01`;
}
