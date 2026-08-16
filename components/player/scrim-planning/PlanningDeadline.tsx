// components/player/scrim-planning/PlanningDeadline.tsx
//
// Compte à rebours « réponds avant le 1er jour de créneaux » du panneau de
// disponibilités. Présentationnel : la valeur `daysUntilStart` est calculée
// dans ScrimPlanningPanel. Extrait sans changement de comportement.

import { useT, format } from '@/lib/i18n/useT';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';

export default function PlanningDeadline({
  daysUntilStart,
}: {
  daysUntilStart: number;
}) {
  const t = useT(nsScrimPlanning);
  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs ${
        daysUntilStart <= 2
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
          : 'border-white/10 bg-white/5 text-gray-300'
      }`}
    >
      <svg
        className="h-4 w-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span>
        {daysUntilStart === 0
          ? t.deadlineToday
          : format(
              daysUntilStart === 1 ? t.deadlineDays_one : t.deadlineDays_other,
              { count: daysUntilStart }
            )}
      </span>
    </div>
  );
}
