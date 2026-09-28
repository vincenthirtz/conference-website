// features/admin/dashboard/service.ts

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { adminErrorFromStatus } from '@/utils/admin/errors';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import {
  summarizeAlerts,
  type AlertsSummary,
} from '@/utils/dashboard/buildTournamentDashboard';
import { fetchAlertsSignals } from '@/utils/dashboard/alertsSignals';

/**
 * Total d'alertes actives du tournoi demandé, ou du tournoi « en cours » de
 * l'espace du staff. Pas de tournoi en cours = pas d'alerte (total 0).
 *
 * Chemin LÉGER : les 8 signaux du badge (6 requêtes), pas le builder complet
 * (~18 requêtes) qui alimente tout le dashboard.
 */
export async function getAlertsSummary(
  ctx: ServiceContext,
  tournamentId: string | undefined
): Promise<AlertsSummary> {
  const id = tournamentId ?? (await resolveCurrentTournamentId(ctx.tenantId));
  if (!id) return summarizeAlerts(null);
  const result = await fetchAlertsSignals(id, ctx.tenantId);
  if (!result.ok) throw adminErrorFromStatus(result.status, result.error);
  return result.summary;
}
