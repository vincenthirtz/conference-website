// components/player/scrim-planning/PlanningBestSlots.tsx
//
// Encart « meilleur créneau commun » (overlap des deux équipes) du panneau de
// disponibilités. Présentationnel : le classement `topSlots` est calculé dans
// ScrimPlanningPanel. Extrait sans changement de comportement.

import { useT } from '@/lib/i18n/useT';
import type { RankedSlot } from '@/utils/teams/scrimPlanningOverlap';

export default function PlanningBestSlots({
  topSlots,
  slots,
  formatSlot,
}: {
  topSlots: RankedSlot[];
  slots: string[];
  formatSlot: (iso: string) => string;
}) {
  const t = useT('scrimPlanning');
  return (
    <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21 8 14 2 9.4h7.6z" />
        </svg>
        {t.bestSlotTitle}
      </p>
      <ul className="flex flex-col gap-1.5">
        {topSlots.map((r) => {
          const mine = slots.includes(r.slot);
          return (
            <li
              key={r.slot}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-50"
            >
              <span className="font-medium">{formatSlot(r.slot)}</span>
              {r.full && (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                  {t.gridFullOverlap}
                </span>
              )}
              <span className={mine ? 'text-emerald-300' : 'text-amber-300'}>
                {mine ? t.bestSlotMeAvailable : t.bestSlotMeMissing}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
