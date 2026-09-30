// components/admin/calendar/MonthCalendar.tsx
// Agenda admin — VUE MOIS générique. Grille 6×7 (lundi en tête) du mois
// affiché, jours débordants grisés. Chaque cellule liste jusqu'à 3 puces
// triées par heure, avec un « +N » qui déplie la journée sur place.
//
// Extraite de ScrimMonthCalendar (même rendu, mêmes classes) pour servir à
// d'autres agendas — scrims/matchs, planning du staff. Présentation pure :
// l'appelant fournit des événements DÉJÀ placés (jour + minute) et leur
// couleur ; le composant ne connaît ni scrim, ni match, ni personne.

import { useMemo, useState, type CSSProperties } from 'react';
import {
  mondayOf,
  addDaysYmd,
  todayYmdInTz,
} from '@/utils/teams/scrimCalendar';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

export type MonthCalendarLabels = {
  monthPrev: string;
  monthNext: string;
  moreEvents: string; // reçoit {count}
  collapse: string; // « réduire » (replier les événements dépliés)
};

export type MonthCalendarEvent = {
  /** Identifiant unique, rendu à `onOpenEvent`. */
  key: string;
  /** Jour 'YYYY-MM-DD'. */
  ymd: string;
  /** Minute du jour, pour le tri. */
  minute: number;
  /** Heure affichée en tête de puce (chiffres tabulaires), ex. « 20:00 ». */
  timeLabel?: string;
  label: string;
  /** Infobulle ; défaut « heure — libellé ». */
  title?: string;
  /** Classes de couleur de la puce. */
  chipClassName: string;
  /**
   * Couleur explicite (fond + texte), quand la palette Tailwind ne suffit pas :
   * sous `[data-surface=admin]`, le pont Ruban ramène la plupart des familles
   * sur ses jetons — un agenda « une couleur par personne » y perdrait ses teintes.
   */
  chipStyle?: CSSProperties;
};

const MAX_CHIPS = 3;
const pad2 = (n: number) => String(n).padStart(2, '0');

function weekdayHeads(tz: string): string[] {
  // Lundi de référence arbitraire (2024-01-01 est un lundi).
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`2024-01-0${i + 1}T12:00:00Z`);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: tz });
  });
}

/** Décale un 'YYYY-MM-01' de n mois, renvoie le 1er du mois cible. */
export function shiftMonth(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split('-').map((v) => parseInt(v, 10));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-01`;
}

export default function MonthCalendar({
  tz,
  monthAnchor,
  events,
  labels,
  onMonthChange,
  onSelectDay,
  onOpenEvent,
}: {
  tz: string;
  /** Premier jour du mois affiché ('YYYY-MM-01'). */
  monthAnchor: string;
  events: MonthCalendarEvent[];
  labels: MonthCalendarLabels;
  onMonthChange: (monthAnchor: string) => void;
  onSelectDay?: (dayYmd: string) => void;
  onOpenEvent?: (key: string) => void;
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
    const map: Record<string, MonthCalendarEvent[]> = {};
    for (const ev of events) (map[ev.ymd] ??= []).push(ev);
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.minute - b.minute);
    }
    return map;
  }, [events]);

  const monthLabel = new Date(`${monthAnchor}T12:00:00Z`).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric', timeZone: tz }
  );

  const prevMonth = () => onMonthChange(shiftMonth(monthAnchor, -1));
  const nextMonth = () => onMonthChange(shiftMonth(monthAnchor, 1));

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <AdminButton
          variant="ghost"
          size="xs"
          type="button"
          aria-label={labels.monthPrev}
          onClick={prevMonth}
        >
          ‹
        </AdminButton>
        <AdminButton
          variant="ghost"
          size="xs"
          type="button"
          aria-label={labels.monthNext}
          onClick={nextMonth}
        >
          ›
        </AdminButton>
        <span className="ml-1 text-neutral-200 capitalize">{monthLabel}</span>
      </div>

      <div className="overflow-x-auto rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-2">
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
              const dayEvents = eventsByDay[day] ?? [];
              const isExpanded = expandedDay === day;
              const shown = isExpanded
                ? dayEvents
                : dayEvents.slice(0, MAX_CHIPS);
              const overflow = dayEvents.length - shown.length;
              const dayNum = parseInt(day.slice(8, 10), 10);
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => onSelectDay?.(day)}
                  className={`flex min-h-[92px] flex-col rounded-[var(--r-ctrl,4px)] border p-1 text-left transition hover:border-neutral-600 ${
                    inMonth
                      ? 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]'
                      : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] opacity-50'
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
                    {shown.map((ev) => (
                      <span
                        key={ev.key}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEvent?.(ev.key);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            onOpenEvent?.(ev.key);
                          }
                        }}
                        title={
                          ev.title ??
                          (ev.timeLabel
                            ? `${ev.timeLabel} — ${ev.label}`
                            : ev.label)
                        }
                        className={`block cursor-pointer truncate rounded-[var(--r-ctrl,4px)] px-1 py-0.5 text-[9px] leading-tight hover:brightness-110 ${ev.chipClassName}`}
                        style={ev.chipStyle}
                      >
                        {ev.timeLabel && (
                          <>
                            <span className="tabular-nums">
                              {ev.timeLabel}
                            </span>{' '}
                          </>
                        )}
                        {ev.label}
                      </span>
                    ))}
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
                        className="cursor-pointer rounded-[var(--r-ctrl,4px)] px-1 text-[9px] text-neutral-400 hover:text-neutral-200"
                      >
                        {labels.moreEvents.replace('{count}', String(overflow))}
                      </span>
                    )}
                    {isExpanded && dayEvents.length > MAX_CHIPS && (
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
                        className="cursor-pointer rounded-[var(--r-ctrl,4px)] px-1 text-[9px] text-neutral-400 hover:text-neutral-200"
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
