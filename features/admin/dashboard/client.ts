// features/admin/dashboard/client.ts — accueil admin (alertes, KPI) et
// modales d'action du tableau de bord d'un tournoi (L10).
//
// Les gestes de jour de match des modales (avancement de phase, déverrouillage
// des rosters, score, litige) restent sur `useIdempotentMutation` (file hors
// ligne) : ce module n'en expose que les chemins.

import type { AlertsSummary } from '@/utils/dashboard/buildTournamentDashboard';
import { adminRequest } from '@/utils/admin/adminHttp';

const enc = encodeURIComponent;

export const dashboardPaths = {
  stageAdvance: (stageId: string) =>
    `/api/admin/stages/${enc(stageId)}/advance`,
  rosterUnlock: (tournamentId: string) =>
    `/api/admin/tournament/${enc(tournamentId)}/roster-unlock`,
} as const;

/** KPI globaux (admin+) ; chaque clé peut valoir null en dégradation. */
export type OverviewSummary = {
  tournamentsActive?: number | null;
  teams?: number | null;
  demandesPending?: number | null;
  supportOpen?: number | null;
  supportHigh?: number | null;
  disputesOpen?: number | null;
};

export const dashboardClient = {
  alertsSummary: () => adminRequest<AlertsSummary>('/api/admin/alerts-summary'),
  overviewSummary: () =>
    adminRequest<OverviewSummary>('/api/admin/overview-summary'),
};
