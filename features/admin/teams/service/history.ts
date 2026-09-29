// features/admin/teams/service/history.ts — historique staff d'une équipe
// (GET /api/admin/teams/[teamId]/history).
//
// Deux sources fusionnées, triées, dédoublonnées puis coupées à `limit` :
// les entrées posées sur l'équipe (`entity_type = team`) et celles d'autres
// entités qui la citent (`payload.team_id`).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { type StaffLog, formatStaffLog } from '@/utils/staffLogs';
import * as history from '../repository/history';

export async function getTeamHistory(
  ctx: ServiceContext,
  teamId: string,
  filters: { entityType: unknown; action: unknown },
  limit: number
) {
  const f = {
    action: typeof filters.action === 'string' ? filters.action : null,
    entityType:
      typeof filters.entityType === 'string' ? filters.entityType : null,
  };

  const direct = await history.listDirectTeamLogs(
    ctx.db,
    ctx.tenantId,
    teamId,
    f,
    limit
  );
  if (direct.error) {
    ctx.logger.error('team history: directLogs error:', direct.error);
  }

  const viaPayload = await history.listPayloadTeamLogs(
    ctx.db,
    ctx.tenantId,
    teamId,
    f,
    limit
  );
  if (viaPayload.error) {
    ctx.logger.error('team history: payloadLogs error:', viaPayload.error);
  }

  const rawLogs = [
    ...(direct.rows as unknown as StaffLog[]),
    ...(viaPayload.rows as unknown as StaffLog[]),
  ];
  rawLogs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // Les deux requêtes se recouvrent : sans dédoublonnage, l'écran afficherait
  // deux fois la même action.
  const seen = new Set<string>();
  const unique = rawLogs.filter((log) => {
    if (seen.has(log.id)) return false;
    seen.add(log.id);
    return true;
  });

  // `limit` s'applique à CHAQUE requête : on recoupe au total demandé.
  return {
    teamId,
    logs: unique.slice(0, limit).map((log) => formatStaffLog(log)),
  };
}
