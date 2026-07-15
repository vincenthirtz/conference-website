// components/player/scrim-planning/PlanningToolbar.tsx
//
// Bascules du panneau de disponibilités : vue (agenda / grille / mois) et mode
// (peinture / heatmap). Présentationnel : l'état vit dans ScrimPlanningPanel,
// les callbacks remontent les changements. Extrait sans changement de
// comportement — ajout léger d'`aria-pressed` sur les toggles (a11y, sans effet
// fonctionnel).

import { useT } from '@/lib/i18n/useT';

type View = 'grid' | 'calendar' | 'month';
type EffectiveMode = 'paint' | 'heatmap';

export default function PlanningToolbar({
  view,
  onViewChange,
  showModeToggle,
  effectiveMode,
  onModeChange,
}: {
  view: View;
  onViewChange: (v: View) => void;
  showModeToggle: boolean;
  effectiveMode: EffectiveMode;
  onModeChange: (m: EffectiveMode) => void;
}) {
  const t = useT('scrimPlanning');
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
        <button
          type="button"
          onClick={() => onViewChange('calendar')}
          aria-pressed={view === 'calendar'}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            view === 'calendar'
              ? 'bg-white/15 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {t.viewCalendar}
        </button>
        <button
          type="button"
          onClick={() => onViewChange('grid')}
          aria-pressed={view === 'grid'}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            view === 'grid'
              ? 'bg-white/15 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {t.viewGrid}
        </button>
        <button
          type="button"
          onClick={() => onViewChange('month')}
          aria-pressed={view === 'month'}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            view === 'month'
              ? 'bg-white/15 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {t.viewMonth}
        </button>
      </div>

      {showModeToggle && (
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
          <button
            type="button"
            onClick={() => onModeChange('paint')}
            aria-pressed={effectiveMode === 'paint'}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              effectiveMode === 'paint'
                ? 'bg-white/15 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.modePaint}
          </button>
          <button
            type="button"
            onClick={() => onModeChange('heatmap')}
            aria-pressed={effectiveMode === 'heatmap'}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              effectiveMode === 'heatmap'
                ? 'bg-white/15 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.modeHeatmap}
          </button>
        </div>
      )}
    </div>
  );
}
