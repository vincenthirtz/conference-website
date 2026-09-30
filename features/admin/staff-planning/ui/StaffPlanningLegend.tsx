// features/admin/staff-planning/ui/StaffPlanningLegend.tsx — l'équipe, une
// pastille de couleur par personne (celle de ses puces dans l'agenda) et son
// nombre de créneaux du mois. Un clic filtre l'agenda sur cette personne.

import { format } from '@/lib/i18n/useAdminT';
import {
  rubanCardPadded,
  rubanEyebrow,
  rubanHelp,
} from '@/features/ruban/ruban';
import { dotStyleOf, personColor } from '../view';
import type { StaffPlanningTexts } from './texts';

export default function StaffPlanningLegend({
  t,
  people,
  counts,
  only,
  onOnly,
}: {
  t: StaffPlanningTexts;
  people: string[];
  counts: Record<string, number>;
  only: string | null;
  onOnly: (name: string | null) => void;
}) {
  const pill =
    'flex w-full items-center gap-2 rounded-[var(--r-ctrl,4px)] px-2 py-1.5 text-left text-sm transition';
  return (
    <section className={rubanCardPadded} aria-label={t.legendTitle}>
      <p className={rubanEyebrow}>{t.legendTitle}</p>
      <p className={rubanHelp}>{t.legendHint}</p>
      <ul className="mt-3 flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            aria-pressed={only === null}
            onClick={() => onOnly(null)}
            className={`${pill} ${only === null ? 'bg-[var(--s2,#1d1520)] text-[var(--t1,#f4edf7)]' : 'text-[var(--t2,#c7bfca)] hover:bg-[var(--s2,#1d1520)]/60'}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--line2,rgba(194,196,201,.2))]" />
            {t.legendAll}
          </button>
        </li>
        {people.map((name) => {
          const active = only === name;
          const count = counts[name] ?? 0;
          return (
            <li key={name}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onOnly(active ? null : name)}
                className={`${pill} ${active ? 'bg-[var(--s2,#1d1520)] text-[var(--t1,#f4edf7)]' : 'text-[var(--t2,#c7bfca)] hover:bg-[var(--s2,#1d1520)]/60'}`}
              >
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full `}
                  style={dotStyleOf(personColor(name, people))}
                />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {count > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-[var(--t3,#a39ba6)]">
                    {format(t.legendCount, { count })}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
