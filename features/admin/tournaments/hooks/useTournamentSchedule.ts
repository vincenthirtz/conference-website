// features/admin/tournaments/hooks/useTournamentSchedule.ts — diagnostic du
// calendrier d'un tournoi et déplacement de matchs
// (pages/admin/tournament/[id]/schedule), lot L10.
//
// Le déplacement reste sur `useIdempotentMutation` (file hors ligne) : la
// page l'appelle avec `tournamentUrls.scheduleMove`.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CalendarMatch } from '@/components/admin/tournament/ScheduleMonthCalendar';
import type { AvailabilityConstraint } from '@/utils/matches/availability';
import type {
  ScheduleAnomaly,
  ScheduleAnomalySeverity,
} from '@/utils/matches/scheduleDiagnostics';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentUrls } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export type DiagnosticsResponse = {
  tournament: {
    id: string;
    name: string | null;
    startDate: string | null;
    endDate: string | null;
    timezone: string;
  };
  counts: Record<ScheduleAnomalySeverity, number>;
  anomalies: ScheduleAnomaly[];
  slotGrid: string[];
  constraintCount: number;
  matchCount: number;
  matches: CalendarMatch[];
  constraints: AvailabilityConstraint[];
  teamNames: Record<string, string>;
};

/** Les paramètres changés gardent le diagnostic précédent à l'écran. */
export function useScheduleDiagnostics(
  id: string,
  rest: number,
  concurrent: number
) {
  return useQuery({
    queryKey: tournamentKeys.part(id, 'schedule', rest, concurrent),
    queryFn: () =>
      adminRequest<DiagnosticsResponse>(
        tournamentUrls.scheduleDiagnostics(id, rest, concurrent)
      ),
    enabled: !!id,
    placeholderData: keepPreviousData,
    ...MOUNT_ONLY,
  });
}
