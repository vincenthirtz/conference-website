// components/player/scrim-planning/PlanningQuickFill.tsx
//
// Barre de remplissage rapide (tout remplir / copier le 1er jour / reprendre mes
// dispos / effacer) du panneau de disponibilités. Présentationnel : les actions
// (mutation des créneaux, fetch suggest) restent dans ScrimPlanningPanel.
// Extrait sans changement de comportement.

import { useT } from '@/lib/i18n/useT';

export default function PlanningQuickFill({
  onFillAll,
  onCopyFirstDay,
  onReuse,
  onClear,
  hasSlots,
  loadingSuggest,
}: {
  onFillAll: () => void;
  onCopyFirstDay: () => void;
  onReuse: () => void;
  onClear: () => void;
  hasSlots: boolean;
  loadingSuggest: boolean;
}) {
  const t = useT('scrimPlanning');
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onFillAll}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 transition"
      >
        {t.quickFillAll}
      </button>
      <button
        type="button"
        onClick={onCopyFirstDay}
        disabled={!hasSlots}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 disabled:opacity-40 transition"
      >
        {t.quickCopyDay}
      </button>
      <button
        type="button"
        onClick={onReuse}
        disabled={loadingSuggest}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/10 disabled:opacity-40 transition"
      >
        {t.quickReuse}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!hasSlots}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-red-500/15 hover:text-red-200 hover:border-red-500/40 disabled:opacity-40 transition"
      >
        {t.quickClear}
      </button>
    </div>
  );
}
