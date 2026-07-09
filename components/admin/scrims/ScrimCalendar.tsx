// components/admin/scrims/ScrimCalendar.tsx
// Agenda admin (vue semaine) pour poser des scrims directement sur un créneau.
// Colonnes = 7 jours (lun→dim), axe horaire continu à gauche. Les scrims
// existants sont rendus comme des blocs positionnés par scheduled_date (dans le
// fuseau `tz`) ; cliquer un scrim → onOpenScrim(id), cliquer une zone vide →
// onCreateAt(dayYmd, minuteOfDay) (snap 30 min) pour ouvrir la création
// pré-remplie. Présentation pure (aucun fetch).

import { useMemo } from 'react';
import {
  weekDaysFrom,
  dateAndMinuteInTz,
  todayYmdInTz,
} from '@/utils/teams/scrimCalendar';

export type CalendarScrim = {
  id: string;
  name: string;
  status: string;
  scheduled_date: string | null;
  team1Name?: string | null;
  team2Name?: string | null;
};

export type ScrimCalendarLabels = {
  today: string;
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  weekOf: string; // reçoit {date}
  createHint: string;
};

const DAY_START_MIN = 8 * 60; // 08:00
const DAY_END_MIN = 24 * 60; // minuit
const HOUR_PX = 44;
const SNAP_MIN = 30;
const DEFAULT_DURATION_MIN = 120;
const pxPerMin = HOUR_PX / 60;

const STATUS_BLOCK: Record<string, string> = {
  draft: 'bg-neutral-600/80 border-neutral-400/50 text-neutral-100',
  scheduled: 'bg-blue-600/80 border-blue-300/50 text-white',
  running: 'bg-emerald-600/80 border-emerald-300/50 text-white',
  completed: 'bg-purple-600/80 border-purple-300/50 text-white',
  cancelled: 'bg-red-700/70 border-red-400/50 text-red-100 line-through',
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtHour = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

function fmtDayHeader(ymd: string, tz: string): { dow: string; day: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  return {
    dow: d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: tz }),
    day: d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: tz,
    }),
  };
}

export default function ScrimCalendar({
  tz,
  weekStart,
  scrims,
  labels,
  onWeekChange,
  onCreateAt,
  onOpenScrim,
}: {
  tz: string;
  /** Lundi de la semaine affichée ('YYYY-MM-DD'). */
  weekStart: string;
  scrims: CalendarScrim[];
  labels: ScrimCalendarLabels;
  onWeekChange: (mondayYmd: string) => void;
  onCreateAt: (dayYmd: string, minuteOfDay: number) => void;
  onOpenScrim: (id: string) => void;
}) {
  const days = useMemo(() => weekDaysFrom(weekStart), [weekStart]);
  const colHeight = ((DAY_END_MIN - DAY_START_MIN) / 60) * HOUR_PX;
  const todayYmd = useMemo(() => todayYmdInTz(tz), [tz]);

  // Positionne chaque scrim daté sur (jour, minute) dans le fuseau.
  const eventsByDay = useMemo(() => {
    const map: Record<string, { scrim: CalendarScrim; minute: number }[]> = {};
    for (const s of scrims) {
      if (!s.scheduled_date) continue;
      const pos = dateAndMinuteInTz(s.scheduled_date, tz);
      if (!pos) continue;
      if (!days.includes(pos.ymd)) continue;
      (map[pos.ymd] ??= []).push({ scrim: s, minute: pos.minute });
    }
    return map;
  }, [scrims, tz, days]);

  const hourMarks = useMemo(() => {
    const marks: { top: number; label: string }[] = [];
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) {
      marks.push({ top: (m - DAY_START_MIN) * pxPerMin, label: fmtHour(m) });
    }
    return marks;
  }, []);

  const handleColClick = (dayYmd: string) => (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let minute = DAY_START_MIN + Math.round(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
    minute = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SNAP_MIN, minute));
    onCreateAt(dayYmd, minute);
  };

  const weekLabel = fmtDayHeader(days[0], tz).day;

  return (
    <div className="select-none">
      {/* Barre de navigation semaine */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            aria-label={labels.prevWeek}
            onClick={() => onWeekChange(shift(weekStart, -7))}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 hover:bg-neutral-800 transition"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onWeekChange(mondayToday(tz))}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-1 text-xs font-medium hover:bg-neutral-800 transition"
          >
            {labels.thisWeek}
          </button>
          <button
            type="button"
            aria-label={labels.nextWeek}
            onClick={() => onWeekChange(shift(weekStart, 7))}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 hover:bg-neutral-800 transition"
          >
            ›
          </button>
          <span className="ml-1 text-neutral-300 tabular-nums">
            {labels.weekOf.replace('{date}', weekLabel)}
          </span>
        </div>
        <span className="text-xs text-neutral-500">{labels.createHint}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
        <div className="flex min-w-[720px]">
          {/* Gouttière d'heures */}
          <div className="w-12 flex-shrink-0 pt-9">
            <div className="relative" style={{ height: colHeight }}>
              {hourMarks.map((m) => (
                <div
                  key={m.label}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-neutral-500"
                  style={{ top: m.top }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Colonnes-jour */}
          <div className="flex flex-1 gap-1">
            {days.map((day) => {
              const isToday = day === todayYmd;
              const events = eventsByDay[day] ?? [];
              return (
                <div key={day} className="flex-1 min-w-[92px]">
                  <div
                    className={`h-9 text-center ${
                      isToday ? 'text-emerald-300' : 'text-neutral-200'
                    }`}
                  >
                    <div className="text-[11px] font-semibold uppercase">
                      {fmtDayHeader(day, tz).dow}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {fmtDayHeader(day, tz).day}
                    </div>
                  </div>

                  <div
                    className="relative cursor-copy rounded-lg border border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900/40"
                    style={{ height: colHeight }}
                    onClick={handleColClick(day)}
                    title={labels.createHint}
                  >
                    {hourMarks.map((m) => (
                      <div
                        key={m.label}
                        className="pointer-events-none absolute inset-x-0 border-t border-neutral-800/70"
                        style={{ top: m.top }}
                      />
                    ))}

                    {events.map(({ scrim, minute }) => {
                      const top = Math.max(
                        0,
                        (minute - DAY_START_MIN) * pxPerMin
                      );
                      const height = Math.max(
                        18,
                        DEFAULT_DURATION_MIN * pxPerMin - 2
                      );
                      const cls =
                        STATUS_BLOCK[scrim.status] ?? STATUS_BLOCK.draft;
                      const vs =
                        scrim.team1Name || scrim.team2Name
                          ? `${scrim.team1Name ?? '?'} vs ${scrim.team2Name ?? '?'}`
                          : scrim.name;
                      return (
                        <button
                          type="button"
                          key={scrim.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenScrim(scrim.id);
                          }}
                          className={`absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm hover:brightness-110 ${cls}`}
                          style={{ top, height }}
                          title={`${vs} — ${fmtHour(minute)}`}
                        >
                          <span className="block font-semibold tabular-nums">
                            {fmtHour(minute)}
                          </span>
                          <span className="block truncate">{vs}</span>
                        </button>
                      );
                    })}

                    {isToday && (
                      <TodayLine tz={tz} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayLine({ tz }: { tz: string }) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  const nowMin = get('hour') * 60 + get('minute');
  if (nowMin < DAY_START_MIN || nowMin > DAY_END_MIN) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top: (nowMin - DAY_START_MIN) * pxPerMin }}
    >
      <span className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-red-500" />
      <span className="h-px flex-1 bg-red-500/80" />
    </div>
  );
}

// Décale un lundi de n jours (helpers locaux pour éviter d'importer plus).
function shift(mondayYmd: string, n: number): string {
  const [y, m, d] = mondayYmd.split('-').map((v) => parseInt(v, 10));
  const next = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${next.getUTCFullYear()}-${p(next.getUTCMonth() + 1)}-${p(next.getUTCDate())}`;
}

function mondayToday(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return shift(ymd, offset);
}
