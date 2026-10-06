// features/admin/dashboard/service.ts

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { adminErrorFromStatus } from '@/utils/admin/errors';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import {
  summarizeAlerts,
  type AlertsSummary,
} from '@/utils/dashboard/buildTournamentDashboard';
import { fetchAlertsSignals } from '@/utils/dashboard/alertsSignals';
import { uncoveredMatchNightsAhead } from '@/features/admin/staff-planning/service';

/**
 * Total d'alertes actives du tournoi demandé, ou du tournoi « en cours » de
 * l'espace du staff, PLUS les soirs de match des 7 prochains jours sans
 * personne au planning du staff (signal d'espace, compté même sans tournoi).
 *
 * Chemin LÉGER : les 8 signaux du badge (6 requêtes) + 2 requêtes de
 * planning, pas le builder complet (~18 requêtes) qui alimente tout le
 * dashboard.
 */
export async function getAlertsSummary(
  ctx: ServiceContext,
  tournamentId: string | undefined
): Promise<AlertsSummary> {
  const [summary, staffNights] = await Promise.all([
    tournamentAlerts(ctx, tournamentId),
    staffUncoveredNights(ctx),
  ]);
  return withStaffUncoveredNights(summary, staffNights);
}

async function tournamentAlerts(
  ctx: ServiceContext,
  tournamentId: string | undefined
): Promise<AlertsSummary> {
  const id = tournamentId ?? (await resolveCurrentTournamentId(ctx.tenantId));
  if (!id) return summarizeAlerts(null);
  const result = await fetchAlertsSignals(id, ctx.tenantId);
  if (!result.ok) throw adminErrorFromStatus(result.status, result.error);
  return result.summary;
}

/** Best effort : un planning illisible ne doit pas éteindre tout le badge. */
async function staffUncoveredNights(ctx: ServiceContext): Promise<number> {
  try {
    return (await uncoveredMatchNightsAhead(ctx)).length;
  } catch (err) {
    ctx.logger.warn('[admin/alerts-summary] staff planning signal skipped', {
      tenantId: ctx.tenantId,
      error: err,
    });
    return 0;
  }
}

/** Ajoute le signal planning au résumé (pur, testé). */
export function withStaffUncoveredNights(
  summary: AlertsSummary,
  nights: number
): AlertsSummary {
  return {
    ...summary,
    total: summary.total + nights,
    breakdown: { ...summary.breakdown, staffUncoveredNights: nights },
  };
}
