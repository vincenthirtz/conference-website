// features/admin/pilotage/service.ts — charge le tournoi EN COURS de l'espace
// du staff et en tire le pilotage du jour (build.ts).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { adminErrorFromStatus } from '@/utils/admin/errors';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import { fetchDashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import { buildPilotage, emptyPilotage } from './build';
import type { Pilotage } from './schemas';

export async function loadPilotage(
  ctx: ServiceContext,
  now: Date = new Date()
): Promise<Pilotage> {
  const tournamentId = await resolveCurrentTournamentId(ctx.tenantId);
  if (!tournamentId) return emptyPilotage(now);
  const result = await fetchDashboardData(tournamentId, ctx.tenantId);
  if (!result.ok) throw adminErrorFromStatus(result.status, result.error);
  return buildPilotage(result.data, now);
}
