// features/admin/staff-planning/ui/StaffPlanningDayPanel.tsx — le détail d'un
// jour cliqué dans l'agenda : qui, de quelle heure à quelle heure, quel rôle,
// d'où vient la ligne (tableur ou saisie). Bouton « Retirer » pour la gestion.

import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanEyebrow,
  rubanMuted,
} from '@/features/ruban/ruban';
import type { StaffPlanningSlotRow } from '../client';
import { dotStyleOf, endsNextDay, personColor, rangeLabel } from '../view';
import type { StaffPlanningTexts } from './texts';

export function dayLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export default function StaffPlanningDayPanel({
  t,
  day,
  slots,
  people,
  canManage,
  busyId,
  onDelete,
}: {
  t: StaffPlanningTexts;
  day: string;
  slots: StaffPlanningSlotRow[];
  people: string[];
  canManage: boolean;
  busyId: string | null;
  onDelete: (slot: StaffPlanningSlotRow) => void;
}) {
  return (
    <section className={rubanCardPadded} aria-live="polite">
      <p className={`${rubanEyebrow} first-letter:uppercase`}>
        {format(t.dayTitle, { date: dayLabel(day) })}
      </p>
      {slots.length === 0 ? (
        <p className={`mt-2 text-sm ${rubanMuted}`}>{t.dayEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {slots.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-3 py-2"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full `}
                style={dotStyleOf(personColor(s.person_name, people))}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-[var(--t1,#f4edf7)]">
                  <span className="font-semibold">{s.person_name}</span>{' '}
                  <span className="tabular-nums">
                    {rangeLabel(s.start_time, s.end_time)}
                  </span>
                  {endsNextDay(s.start_time, s.end_time) && (
                    <span className={`ml-1 text-xs ${rubanMuted}`}>
                      {t.untilNextDay}
                    </span>
                  )}
                </p>
                <p className={`text-xs ${rubanMuted}`}>
                  {s.role ? t[`role_${s.role}`] : t.roleNone} ·{' '}
                  {s.source === 'csv' ? t.sourceCsv : t.sourceManual}
                  {s.note ? ` · ${s.note}` : ''}
                </p>
              </div>
              {canManage && (
                <AdminButton
                  variant="ghost"
                  size="xs"
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => onDelete(s)}
                >
                  {t.deleteSlot}
                </AdminButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
