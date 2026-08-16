// components/player/scrim-planning/PlanningFooter.tsx
//
// Pied du panneau de disponibilités : compteur de créneaux + témoin d'état
// (sauvegarde en cours / non enregistré / auto-enregistré) + bouton de
// sauvegarde manuelle. Présentationnel : l'auto-save et la mutation vivent dans
// ScrimPlanningPanel. Extrait sans changement de comportement.

import { useT, format } from '@/lib/i18n/useT';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';

export default function PlanningFooter({
  slotsCount,
  saving,
  dirty,
  accent,
  onSave,
}: {
  slotsCount: number;
  saving: boolean;
  dirty: boolean;
  accent: 'purple' | 'blue';
  onSave: () => void;
}) {
  const t = useT(nsScrimPlanning);
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <span className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        {format(slotsCount === 1 ? t.slotsPainted_one : t.slotsPainted_other, {
          count: slotsCount,
        })}
        {saving ? (
          <span className="inline-flex items-center gap-1 text-gray-400">
            <span
              className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse"
              aria-hidden="true"
            />
            {t.saving}
          </span>
        ) : dirty ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-200">
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            {t.unsavedChanges}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-300/80">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              aria-hidden="true"
            />
            {t.autoSaved}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
          saving
            ? 'bg-gray-600 cursor-not-allowed text-gray-300'
            : accent === 'purple'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white'
              : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white'
        }`}
      >
        {saving ? t.saving : t.save}
      </button>
    </div>
  );
}
