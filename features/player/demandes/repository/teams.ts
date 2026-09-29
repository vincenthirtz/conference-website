// features/player/demandes/repository/teams.ts — lectures d'équipe, de
// roster et de tournoi dont les demandes ont besoin (lot P11). Scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';

export type TeamLookup = {
  id: string;
  name: string;
  is_joinable?: boolean | null;
  is_active?: boolean | null;
  captain_id?: string | null;
};

/**
 * Équipe du tenant. `activeOnly` filtre `is_active = true` (équipe ciblée par
 * une demande) ; sans lui, l'appelant lit `is_active` et tranche.
 */
export async function readTeam(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  columns: string,
  opts: { activeOnly?: boolean } = {}
) {
  let q = db.from('teams').select(columns).eq('id', teamId);
  if (opts.activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q.eq('tenant_id', tenantId).maybeSingle();
  return { team: data as unknown as TeamLookup | null, error };
}

/** Ligne de roster de `userId` dans `teamId`. */
export async function readTeamMembership(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('id, team_id, role, battle_tag')
    .eq('user_id', userId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return {
    membership: data as {
      id: string;
      team_id: string;
      role: string | null;
      battle_tag: string | null;
    } | null,
    error,
  };
}

/**
 * Effectif retenu pour `min_players` : seul le rôle `coach` est exclu (PAS
 * `manager`) — comportement historique, partagé par la photo d'inscription
 * et la candidature pour qu'elles ne se contredisent jamais.
 */
export async function countRegistrationMembers(
  db: AdminDb,
  tenantId: string,
  teamId: string
): Promise<number> {
  const { count } = await db
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .neq('role', 'coach');
  return count ?? 0;
}

/** Nombre d'équipes déjà inscrites au tournoi (plafond `max_teams`). */
export async function countRegisteredTeams(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
): Promise<number> {
  const { count } = await db
    .from('tournament_teams')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
  return count ?? 0;
}

export type TournamentForRegistration = {
  id: string;
  name: string;
  status: string | null;
  max_teams: number | null;
  min_players: number | null;
  registration_fields: unknown;
};

export async function readTournamentForRegistration(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('tournaments')
    .select('id, name, status, max_teams, min_players, registration_fields')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return {
    tournament: data as unknown as TournamentForRegistration | null,
    error,
  };
}

/** Inscription confirmée de l'équipe au tournoi, s'il y en a une. */
export async function readTournamentRegistration(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamId: string
) {
  const { data } = await db
    .from('tournament_teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data as { id: string } | null;
}

/**
 * Toutes les candidatures de l'ÉQUIPE au tournoi (pas seulement celles de
 * l'appelant : dans une équipe à deux encadrants, celle de l'autre compte).
 */
export async function listTeamRegistrationDemandes(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamId: string
) {
  const { data } = await db
    .from('demandes')
    .select('id, status, created_at')
    .eq('team_id', teamId)
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .eq('type', 'team_registration')
    .order('created_at', { ascending: false });
  return (data ?? []) as { id: string; status: string; created_at: string }[];
}
