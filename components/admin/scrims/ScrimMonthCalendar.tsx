// components/admin/scrims/ScrimMonthCalendar.tsx
// Agenda admin des scrims — VUE MOIS. Adaptateur de la grille générique
// `MonthCalendar` : place scrims (colorés par statut) et matches (gris) dans le
// fuseau `tz`, puis délègue le rendu.
//   - clic sur une puce  → onOpenScrim(id) / onOpenMatch(id)
//   - clic sur une cellule → onSelectDay(ymd) (le parent bascule en vue semaine)

import { useMemo } from 'react';
import { dateAndMinuteInTz } from '@/utils/teams/scrimCalendar';
import { fmtHourOfDay as fmtHour } from '@/utils/teams/scrimTime';
import type {
  CalendarScrim,
  CalendarMatch,
} from '@/components/admin/scrims/ScrimCalendar';
import MonthCalendar, {
  type MonthCalendarEvent,
} from '@/components/admin/calendar/MonthCalendar';

export type ScrimMonthLabels = {
  monthPrev: string;
  monthNext: string;
  matchTag: string;
  moreEvents: string; // reçoit {count}
  collapse: string; // « réduire » (replier les événements dépliés)
};

const STATUS_CHIP: Record<string, string> = {
  draft: 'bg-neutral-600/80 text-neutral-100',
  scheduled: 'bg-blue-600/80 text-white',
  running: 'bg-emerald-600/80 text-white',
  completed: 'bg-purple-600/80 text-white',
  cancelled: 'bg-red-700/70 text-red-100 line-through',
};
const MATCH_CHIP = 'bg-neutral-700/70 text-neutral-300';

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
  const events = useMemo(() => {
    const out: MonthCalendarEvent[] = [];
    for (const s of scrims) {
      if (!s.scheduled_date) continue;
      const pos = dateAndMinuteInTz(s.scheduled_date, tz);
      if (!pos) continue;
      out.push({
        key: `scrim:${s.id}`,
        ymd: pos.ymd,
        minute: pos.minute,
        timeLabel: fmtHour(pos.minute),
        label:
          s.team1Name || s.team2Name
            ? `${s.team1Name ?? '?'} vs ${s.team2Name ?? '?'}`
            : s.name,
        chipClassName: STATUS_CHIP[s.status] ?? STATUS_CHIP.draft,
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
      out.push({
        key: `match:${m.id}`,
        ymd: pos.ymd,
        minute: pos.minute,
        timeLabel: fmtHour(pos.minute),
        label: `[${labels.matchTag}] ${label}`,
        title: `${fmtHour(pos.minute)} — ${label}`,
        chipClassName: MATCH_CHIP,
      });
    }
    return out;
  }, [scrims, matches, tz, labels.matchTag]);

  return (
    <MonthCalendar
      tz={tz}
      monthAnchor={monthAnchor}
      events={events}
      labels={labels}
      onMonthChange={onMonthChange}
      onSelectDay={onSelectDay}
      onOpenEvent={(key) => {
        const [kind, id] = [
          key.slice(0, key.indexOf(':')),
          key.slice(key.indexOf(':') + 1),
        ];
        if (kind === 'scrim') onOpenScrim(id);
        else onOpenMatch(id);
      }}
    />
  );
}
