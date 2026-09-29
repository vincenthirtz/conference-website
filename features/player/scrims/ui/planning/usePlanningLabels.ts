// features/player/scrims/ui/planning/usePlanningLabels.ts — libellés des
// trois vues de la grille (semaine, agenda, mois), mémoïsés sur la locale.

import { useMemo } from 'react';
import type { AvailabilityGridLabels } from '@/components/scrim/AvailabilityGrid';
import type { AvailabilityCalendarLabels } from '@/components/scrim/AvailabilityCalendar';
import type { PlanningMonthLabels } from '@/components/scrim/PlanningMonthOverview';
import type nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';

export function usePlanningLabels(t: typeof nsScrimPlanning.fr) {
  const gridLabels = useMemo<AvailabilityGridLabels>(
    () => ({
      legendTitle: t.gridLegendTitle,
      availableCount: t.gridAvailableCount,
      validatable: t.gridValidatable,
      fullOverlap: t.gridFullOverlap,
      paintHint: t.gridPaintHint,
      cellLabel: t.gridCellLabel,
      empty: t.gridEmpty,
    }),
    [t]
  );

  const calendarLabels = useMemo<AvailabilityCalendarLabels>(
    () => ({
      ...gridLabels,
      weekOf: t.calWeekOf,
      prevWeek: t.calPrevWeek,
      nextWeek: t.calNextWeek,
      todayLabel: t.calToday,
    }),
    [gridLabels, t]
  );

  const monthLabels = useMemo<PlanningMonthLabels>(
    () => ({
      monthPrev: t.monthPrev,
      monthNext: t.monthNext,
      legendMine: t.monthLegendMine,
      legendValidatable: t.monthLegendValidatable,
    }),
    [t]
  );

  return { gridLabels, calendarLabels, monthLabels };
}
