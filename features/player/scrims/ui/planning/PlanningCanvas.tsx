// features/player/scrims/ui/planning/PlanningCanvas.tsx — la surface de
// peinture selon la vue choisie : aperçu du mois, agenda (semaine paginée) ou
// grille complète. Présentationnel, extrait sans changement (lot P13).

import AvailabilityGrid from '@/components/scrim/AvailabilityGrid';
import AvailabilityCalendar from '@/components/scrim/AvailabilityCalendar';
import PlanningMonthOverview from '@/components/scrim/PlanningMonthOverview';
import type {
  Heatmap,
  PlanningConfig,
} from '@/utils/teams/scrimPlanningOverlap';
import type { usePlanningLabels } from './usePlanningLabels';

export type PlanningViewKind = 'grid' | 'calendar' | 'month';

export default function PlanningCanvas({
  view,
  config,
  mode,
  labels,
  accent,
  slots,
  onChange,
  heatmap,
  requireStaff,
  viewerTz,
  focusDate,
  disabled,
  onSelectDay,
}: {
  view: PlanningViewKind;
  config: PlanningConfig;
  mode: 'paint' | 'heatmap';
  labels: ReturnType<typeof usePlanningLabels>;
  accent: 'purple' | 'blue';
  slots: string[];
  onChange: (next: string[]) => void;
  heatmap?: Heatmap;
  requireStaff: boolean;
  viewerTz: string | null;
  focusDate: string | null;
  disabled: boolean;
  /** Vue mois : un jour cliqué ouvre l'agenda sur ce jour. */
  onSelectDay: (day: string) => void;
}) {
  const gridAccent = mode === 'heatmap' ? 'emerald' : accent;
  if (view === 'month') {
    return (
      <PlanningMonthOverview
        config={config}
        value={slots}
        heatmap={heatmap}
        requireStaff={requireStaff}
        labels={labels.monthLabels}
        onSelectDay={onSelectDay}
      />
    );
  }
  if (view === 'calendar') {
    return (
      <AvailabilityCalendar
        config={config}
        mode={mode}
        labels={labels.calendarLabels}
        accent={gridAccent}
        value={slots}
        onChange={onChange}
        heatmap={heatmap}
        requireStaff={requireStaff}
        secondaryTz={viewerTz}
        focusDate={focusDate}
        disabled={disabled}
      />
    );
  }
  return (
    <AvailabilityGrid
      config={config}
      mode={mode}
      labels={labels.gridLabels}
      accent={gridAccent}
      value={slots}
      onChange={onChange}
      heatmap={heatmap}
      requireStaff={requireStaff}
      secondaryTz={viewerTz}
      disabled={disabled}
    />
  );
}
