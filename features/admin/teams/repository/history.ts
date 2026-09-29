// features/admin/teams/repository/history.ts — journal staff d'une équipe
// (`staff_logs`) : entrées posées SUR l'équipe, et entrées d'autres entités
// dont le payload porte `team_id`.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { TEAM_HISTORY_LOG_COLUMNS } from '../schemas';

type Filters = { action: string | null; entityType: string | null };

export async function listDirectTeamLogs(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  f: Filters,
  limit: number
) {
  let q = db
    .from('staff_logs')
    .select(TEAM_HISTORY_LOG_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'team')
    .eq('entity_id', teamId);
  if (f.action) q = q.eq('action', f.action);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit);
  return { rows: data ?? [], error };
}

export async function listPayloadTeamLogs(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  f: Filters,
  limit: number
) {
  let q = db
    .from('staff_logs')
    .select(TEAM_HISTORY_LOG_COLUMNS)
    .eq('tenant_id', tenantId)
    .contains('payload', { team_id: teamId });
  if (f.entityType) q = q.eq('entity_type', f.entityType);
  if (f.action) q = q.eq('action', f.action);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit);
  return { rows: data ?? [], error };
}
