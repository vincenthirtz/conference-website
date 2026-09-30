// features/admin/staff-planning/ui/StaffPlanningDayPanel.tsx — le détail d'un
// jour cliqué dans l'agenda :
//   - le soir de match éventuel (combien, à quelle heure) ;
//   - les rôles couverts et manquants ce soir-là ;
//   - qui, de quelle heure à quelle heure, quel rôle, d'où vient la ligne ;
//   - « Copier pour Discord » : le récap de la soirée, prêt à coller ;
//   - pour la gestion : modifier (rôle, horaires, note) ou retirer.

import { useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanEyebrow,
  rubanMuted,
} from '@/features/ruban/ruban';
import type { StaffPlanningMatchNight, StaffPlanningSlotRow } from '../client';
import {
  discordRecap,
  dotStyleOf,
  endsNextDay,
  hourLabel,
  personColor,
  rangeLabel,
  roleCoverage,
} from '../view';
import StaffPlanningSlotEditor, {
  type SlotPatch,
} from './StaffPlanningSlotEditor';
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
  night,
  slots,
  people,
  canManage,
  busyId,
  onDelete,
  onUpdate,
  onCopied,
}: {
  t: StaffPlanningTexts;
  day: string;
  night: StaffPlanningMatchNight | null;
  slots: StaffPlanningSlotRow[];
  people: string[];
  canManage: boolean;
  busyId: string | null;
  onDelete: (slot: StaffPlanningSlotRow) => void;
  onUpdate: (slot: StaffPlanningSlotRow, patch: SlotPatch) => Promise<void>;
  onCopied: (ok: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const coverage = roleCoverage(slots);
  const matchLabels = {
    matchesOne: t.matchesOne,
    matchesMany: t.matchesMany,
    nobody: t.nobody,
  };

  async function copy() {
    const text = discordRecap({
      dayLabel: dayLabel(day),
      night,
      slots,
      roleLabel: (r) => t[`role_${r}`],
      labels: matchLabels,
    });
    try {
      await navigator.clipboard.writeText(text);
      onCopied(true);
    } catch {
      onCopied(false);
    }
  }

  return (
    <section className={rubanCardPadded} aria-live="polite">
      <p className={`${rubanEyebrow} first-letter:uppercase`}>
        {format(t.dayTitle, { date: dayLabel(day) })}
      </p>

      {night && (
        <p
          className={`mt-2 rounded-[var(--r-ctrl,4px)] px-2.5 py-1.5 text-sm ${
            slots.length === 0
              ? 'bg-[rgba(255,107,107,.12)] text-[var(--err,#ff6b6b)]'
              : 'bg-[var(--s2,#1d1520)] text-[var(--t1,#f4edf7)]'
          }`}
        >
          ⚔{' '}
          {format(t.dayMatches, {
            what: (night.count > 1 ? t.matchesMany : t.matchesOne).replace(
              '{count}',
              String(night.count)
            ),
            time: hourLabel(night.first),
          })}
          {slots.length === 0 && ` — ${t.nobody}`}
        </p>
      )}

      {(night || slots.length > 0) && (
        <div className="mt-3">
          <p className={`text-xs ${rubanMuted}`}>{t.coverageTitle}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {coverage.covered.map((r) => (
              <li
                key={r}
                className="rounded-full bg-[rgba(127,202,101,.14)] px-2 py-0.5 text-[var(--lf,#7fca65)]"
              >
                ✓ {t[`role_${r}`]}
              </li>
            ))}
            {coverage.missing.map((r) => (
              <li
                key={r}
                className="rounded-full border border-dashed border-[var(--line2,rgba(194,196,201,.2))] px-2 py-0.5 text-[var(--t3,#a39ba6)]"
              >
                {t[`role_${r}`]} · {t.coverageMissing}
              </li>
            ))}
          </ul>
          {coverage.unassigned > 0 && (
            <p className={`mt-1 text-xs ${rubanMuted}`}>
              {format(t.coverageUnassigned, { count: coverage.unassigned })}
            </p>
          )}
        </div>
      )}

      {slots.length === 0 ? (
        <p className={`mt-3 text-sm ${rubanMuted}`}>{t.dayEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {slots.map((s) => (
            <li
              key={s.id}
              className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-3 py-2"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
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
              </div>
              {canManage && editing !== s.id && (
                <div className="mt-2 flex gap-1 pl-[22px]">
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    type="button"
                    onClick={() => setEditing(s.id)}
                  >
                    {t.editSlot}
                  </AdminButton>
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => onDelete(s)}
                  >
                    {t.deleteSlot}
                  </AdminButton>
                </div>
              )}
              {canManage && editing === s.id && (
                <StaffPlanningSlotEditor
                  t={t}
                  slot={s}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => {
                    await onUpdate(s, patch);
                    setEditing(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {(slots.length > 0 || night) && (
        <AdminButton
          type="button"
          variant="secondary"
          size="xs"
          className="mt-3"
          onClick={copy}
        >
          {t.copyDiscord}
        </AdminButton>
      )}
    </section>
  );
}
