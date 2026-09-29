// features/player/scrims/repository/directory.ts — lectures de l'annuaire
// connecté (R4) : équipes du tenant, recherches vivantes, ratings, annonces
// de recrutement, affrontements récents, et les recherches du RÉSEAU
// (autres espaces volontaires — la liste des tenants est reçue, jamais
// devinée ici).

import type { AdminDb } from '@/utils/admin/serviceContext';
import { DIRECTORY_OPENING_SELECT } from '@/utils/teams/directoryRecruitment';

export type RosterSkill = {
  role?: string | null;
  skill_rating?: number | null;
};

export type DirectoryTeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  country: string | null;
  is_joinable: boolean | null;
  skill_rating: number | null;
  team_members: RosterSkill[] | null;
};

export type SearchRow = {
  team_id: string;
  slots: string[] | null;
  format: string | null;
  note: string | null;
  status: string;
  expires_at: string;
};

export async function listActiveTeams(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('teams')
    .select(
      // Rôles plutôt qu'un agrégat : l'encadrement ne consomme pas de place.
      'id, name, short_name, logo_url, slug, country, is_joinable, skill_rating, team_members(role, skill_rating)'
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  return { teams: (data ?? []) as unknown as DirectoryTeamRow[], error };
}

export async function listActiveSearches(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('scrim_searches')
    .select('team_id, slots, format, note, status, expires_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  return (data ?? []) as unknown as SearchRow[];
}

export async function listTeamRatings(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('team_ratings')
    .select('team_id, rating')
    .eq('tenant_id', tenantId);
  return (data ?? []) as unknown as Array<{
    team_id: string;
    rating: number | null;
  }>;
}

/** Scope espace obligatoire : pas d'annonce d'un homonyme d'ailleurs. */
export async function listRecentOpenings(
  db: AdminDb,
  tenantId: string,
  limit: number
) {
  const { data, error } = await db
    .from('team_openings')
    .select(DIRECTORY_OPENING_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false })
    .limit(limit);
  return { rows: (data ?? []) as unknown[], error };
}

/** Paires (team1, team2) des matchs et scrims récents impliquant l'équipe. */
export async function listRecentEncounterPairs(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  sinceIso: string
) {
  const involvesMe = `team1_id.eq.${teamId},team2_id.eq.${teamId}`;
  const [matchesRes, scrimsRes] = await Promise.all([
    db
      .from('matches')
      .select('team1_id, team2_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('scheduled_at', sinceIso)
      .or(involvesMe),
    db
      .from('scrims')
      .select('team1_id, team2_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('scheduled_date', sinceIso)
      .or(involvesMe),
  ]);
  return [
    ...((matchesRes.data ?? []) as unknown as Array<Record<string, unknown>>),
    ...((scrimsRes.data ?? []) as unknown as Array<Record<string, unknown>>),
  ];
}

export async function listNetworkSearches(db: AdminDb, tenantIds: string[]) {
  const { data, error } = await db
    .from('scrim_searches')
    .select('team_id, tenant_id, slots, format, note, status, expires_at')
    .in('tenant_id', tenantIds)
    .eq('status', 'active');
  return {
    rows: (data ?? []) as unknown as Array<SearchRow & { tenant_id: string }>,
    error,
  };
}

export async function listNetworkTeams(db: AdminDb, teamIds: string[]) {
  const { data, error } = await db
    .from('teams')
    .select(
      'id, tenant_id, name, short_name, logo_url, country, discord, skill_rating, is_active, deleted_at, team_members(role, skill_rating)'
    )
    .in('id', teamIds);
  return {
    rows: (data ?? []) as unknown as Array<Record<string, unknown>>,
    error,
  };
}
