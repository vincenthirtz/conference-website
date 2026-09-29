// features/player/team/repository/myTeam.ts — accès `teams` de « Mon équipe »,
// toujours scopés au tenant, colonnes explicites (lot P10).

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Colonnes renvoyées après une édition d'identité (ex-`select('*')`). */
export const TEAM_INFO_COLUMNS =
  'id, slug, name, short_name, logo_url, skill_rating, country, description, discord, website, is_joinable, open_for_scrim, updated_at';

export type TeamInfoPatch = {
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
  skill_rating?: number | null;
  updated_at: string;
};

export async function teamExists(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { exists: !!data, error };
}

export async function updateTeamInfo(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  patch: TeamInfoPatch
) {
  const { data, error } = await db
    .from('teams')
    .update(patch)
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .select(TEAM_INFO_COLUMNS)
    .maybeSingle();
  return { team: data, error };
}
