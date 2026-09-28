// features/admin/caster/repository.ts

import type { AdminDb } from '@/utils/admin/serviceContext';

export async function listFinishedMatches(
  db: AdminDb,
  tenantId: string,
  limit: number
) {
  const { data, error } = await db
    .from('matches')
    .select(
      'id, round_name, team1_id, team2_id, completed_at, is_bye, forfeit_team_id'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'finished')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return { rows: data ?? [], error };
}

export async function teamNamesByIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data } = await db
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  for (const t of data ?? []) {
    names.set(t.id, t.name);
  }
  return names;
}
