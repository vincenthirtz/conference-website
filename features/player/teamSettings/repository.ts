// features/player/teamSettings/repository.ts — drapeaux d'ouverture de
// `teams`, toujours scopés au tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';

export type TeamFlags = {
  id: string;
  name: string;
  is_joinable: boolean;
  open_for_scrim: boolean;
};

export async function readTeamFlags(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id, name, is_joinable, open_for_scrim')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { team: data as TeamFlags | null, error };
}

export async function updateTeamFlags(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  patch: Partial<Pick<TeamFlags, 'is_joinable' | 'open_for_scrim'>>
) {
  const { error } = await db
    .from('teams')
    .update(patch)
    .eq('id', teamId)
    .eq('tenant_id', tenantId);
  return { error };
}
