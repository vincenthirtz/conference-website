// components/admin/tournament/ScheduleMonthCalendar.tsx
//
// Le calendrier des matchs d'un tournoi — lot 4 de docs/PLAN-plateforme-tournois.md.
//
// POURQUOI UNE VUE MOIS. La liste d'anomalies du lot 3 dit ce qui cloche ; elle
// ne dit pas à quoi ressemble la saison. C'est le calendrier qui montre les
// soirées chargées, les trous, et les jours où une équipe ne peut pas jouer —
// et c'est cette forme-là qu'on regarde pour décider où déplacer un match.
//
// Présentation PURE : aucun fetch, aucune écriture. Les matchs, les anomalies et
// les contraintes viennent du même appel que la liste, donc les deux vues
// montrent le même calendrier à la même seconde.
//
// Les jours grisés sont ceux où AU MOINS une équipe engagée est indisponible
// toute la journée (`blackout` / `weekday`). Une contrainte d'heure ne grise
// rien : elle ne rend pas la journée impossible, seulement une partie, et un
// jour grisé à tort se lit comme une interdiction.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { dateAndMinuteInTz } from '@/utils/teams/scrimCalendar';
import { fmtHourOfDay } from '@/utils/teams/scrimTime';
import { blackoutDaysByTeam } from '@/utils/matches/availability';
import type { AvailabilityConstraint } from '@/utils/matches/availability';
import type { ScheduleAnomalySeverity } from '@/utils/matches/scheduleDiagnostics';

export type CalendarMatch = {
  id: string;
  scheduledAt: string | null;
  team1Name?: string | null;
  team2Name?: string | null;
  roundName?: string | null;
  status?: string | null;
  isBye?: boolean | null;
};

export type ScheduleCalendarLabels = {
  prevMonth: string;
  nextMonth: string;
  blockedDay: string;
  legendBlocking: string;
  legendWarning: string;
  legendOk: string;
  legendBlocked: string;
  empty: string;
};

type Props = {
  matches: CalendarMatch[];
  /** matchId → gravité la plus haute retenue contre lui. */
  severityByMatch: Record<string, ScheduleAnomalySeverity>;
  constraints: AvailabilityConstraint[];
  teamNames: Record<string, string>;
  timezone: string;
  labels: ScheduleCalendarLabels;
};

const CELL_SEVERITY: Record<ScheduleAnomalySeverity, string> = {
  blocking: 'border-l-red-400 bg-red-500/15 text-red-100',
  warning: 'border-l-amber-400 bg-amber-500/15 text-amber-100',
  info: 'border-l-neutral-500 bg-neutral-700/50 text-neutral-200',
};

const DOW = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Trigramme d'un nom d'équipe : « Hinode Sparkles » → « HIN ». */
function code(name: string | null | undefined): string {
  if (!name) return '—';
  const clean = name.replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return (clean.slice(0, 3) || '—').toUpperCase();
}

export default function ScheduleMonthCalendar({
  matches,
  severityByMatch,
  constraints,
  teamNames,
  timezone,
  labels,
}: Props) {
  const placed = useMemo(() => {
    const out: Array<{ ymd: string; minute: number; match: CalendarMatch }> = [];
    for (const m of matches) {
      if (!m.scheduledAt || m.isBye || m.status === 'cancelled') continue;
      const p = dateAndMinuteInTz(m.scheduledAt, timezone);
      if (p) out.push({ ymd: p.ymd, minute: p.minute, match: m });
    }
    return out.sort((a, b) =>
      a.ymd === b.ymd ? a.minute - b.minute : a.ymd.localeCompare(b.ymd)
    );
  }, [matches, timezone]);

  // Les mois qui portent réellement des matchs. Afficher un mois vide entre
  // deux mois pleins serait fidèle au calendrier grégorien et inutile ici ;
  // afficher le mois courant quand la saison est ailleurs le serait encore plus.
  const months = useMemo(() => {
    const set = new Set(placed.map((p) => p.ymd.slice(0, 7)));
    if (set.size === 0) {
      const now = new Date();
      set.add(`${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`);
    }
    return [...set].sort();
  }, [placed]);

  const [monthIndex, setMonthIndex] = useState(0);
  const month = months[Math.min(monthIndex, months.length - 1)];

  const byDay = useMemo(() => {
    const map = new Map<string, typeof placed>();
    for (const p of placed) {
      const list = map.get(p.ymd);
      if (list) list.push(p);
      else map.set(p.ymd, [p]);
    }
    return map;
  }, [placed]);

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;

  const blackouts = useMemo(
    () =>
      blackoutDaysByTeam(
        constraints,
        `${month}-01`,
        `${month}-${pad2(daysInMonth)}`
      ),
    [constraints, month, daysInMonth]
  );

  const cells: Array<{ day: number | null; ymd: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, ymd: '' });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, ymd: `${month}-${pad2(d)}` });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, ymd: '' });

  const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMonthIndex((i) => Math.max(0, i - 1))}
          disabled={monthIndex === 0}
          className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 disabled:opacity-40"
        >
          {labels.prevMonth}
        </button>
        <p className="text-sm font-semibold first-letter:uppercase">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={() =>
            setMonthIndex((i) => Math.min(months.length - 1, i + 1))
          }
          disabled={monthIndex >= months.length - 1}
          className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 disabled:opacity-40"
        >
          {labels.nextMonth}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DOW.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-neutral-500"
          >
            {d}
          </div>
        ))}

        {cells.map((cell, i) => {
          if (cell.day === null) {
            return <div key={`empty-${i}`} className="min-h-[72px]" />;
          }
          const dayMatches = byDay.get(cell.ymd) ?? [];
          const blockedTeams = blackouts.get(cell.ymd) ?? [];
          const blocked = blockedTeams.length > 0;
          const blockedTitle = blocked
            ? `${labels.blockedDay} : ${blockedTeams
                .map((id) => teamNames[id] ?? id.slice(0, 8))
                .join(', ')}`
            : undefined;

          return (
            <div
              key={cell.ymd}
              title={blockedTitle}
              className={`min-h-[72px] rounded-md border p-1 ${
                blocked
                  ? 'border-dashed border-neutral-500 bg-neutral-700/40'
                  : 'border-neutral-700 bg-neutral-800/60'
              }`}
            >
              <span
                className={`pl-0.5 text-[0.6rem] tabular-nums ${
                  blocked ? 'font-semibold text-neutral-300' : 'text-neutral-500'
                }`}
              >
                {cell.day}
              </span>

              <div className="mt-0.5 space-y-0.5">
                {dayMatches.map(({ minute, match }) => {
                  const severity = severityByMatch[match.id];
                  const cls = severity
                    ? CELL_SEVERITY[severity]
                    : 'border-l-emerald-500/60 bg-neutral-700/40 text-neutral-200';
                  const teams =
                    match.team1Name && match.team2Name
                      ? `${code(match.team1Name)}–${code(match.team2Name)}`
                      : (match.roundName ?? '—');
                  const full =
                    match.team1Name && match.team2Name
                      ? `${match.team1Name} vs ${match.team2Name}`
                      : (match.roundName ?? '');
                  return (
                    <Link
                      key={match.id}
                      href={`/admin/matches/${match.id}`}
                      title={`${fmtHourOfDay(minute)} — ${full}`}
                      className={`block rounded border-l-[3px] px-1 py-0.5 text-[0.62rem] leading-tight ${cls}`}
                    >
                      <span className="block font-mono text-[0.55rem] opacity-80">
                        {fmtHourOfDay(minute)}
                      </span>
                      <span className="block truncate font-mono font-semibold">
                        {teams}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {placed.length === 0 && (
        <p className="text-sm text-neutral-400">{labels.empty}</p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-400">
        <Swatch className="border-l-red-400 bg-red-500/15" label={labels.legendBlocking} />
        <Swatch className="border-l-amber-400 bg-amber-500/15" label={labels.legendWarning} />
        <Swatch
          className="border-l-emerald-500/60 bg-neutral-700/40"
          label={labels.legendOk}
        />
        <Swatch
          className="border-l-neutral-500 border-dashed bg-neutral-700/40"
          label={labels.legendBlocked}
        />
      </div>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <i
        aria-hidden="true"
        className={`inline-block h-3 w-3 rounded-sm border-l-[3px] ${className}`}
      />
      {label}
    </span>
  );
}
