// features/player/onboarding/repository/teamCreation.ts — écritures et
// lectures de la création d'équipe anonyme (lot P11). Scopé tenant ; aucune
// décision ici (les étapes du service tranchent).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { RegistrationAnswers } from '@/utils/registrationFields';

export type CreatedTeamRow = {
  id: string;
  name: string;
  slug: string | null;
  is_joinable: boolean | null;
  discord_role_id: string | null;
};

/** Définitions des champs d'inscription d'un tournoi (validation préalable). */
export async function readTournamentFieldDefs(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id, status, registration_fields')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data as {
    id: string;
    status: string | null;
    registration_fields: unknown;
  } | null;
}

/**
 * Insert unique : le slug est désambiguïsé par le trigger `teams_set_slug()`
 * (suffixes -2, -3…), une collision de slug ne fait donc jamais échouer.
 */
export async function insertTeam(
  db: AdminDb,
  payload: Record<string, unknown>
) {
  const { data, error } = await db
    .from('teams')
    .insert(payload as never)
    .select('id, name, slug, is_joinable, discord_role_id')
    .maybeSingle();
  return { team: data as CreatedTeamRow | null, error };
}

/** Siège direct (créatrice ou manager) : son propre geste, accepté d'office. */
export async function insertTeamMember(
  db: AdminDb,
  row: {
    team_id: string;
    user_id: string;
    role: string;
    battle_tag: string | null;
    specialty: string | null;
    tenant_id: string;
  }
) {
  const { data, error } = await db
    .from('team_members')
    .insert({ ...row, accepted_at: new Date().toISOString() } as never)
    .select('id')
    .maybeSingle();
  return { memberId: (data as { id?: string } | null)?.id ?? null, error };
}

/** Supprime une équipe orpheline et son roster (retour arrière). */
export async function deleteTeamAndMembers(db: AdminDb, teamId: string) {
  const { error: membersError } = await db
    .from('team_members')
    .delete()
    .eq('team_id', teamId);
  const { error: teamError } = await db.from('teams').delete().eq('id', teamId);
  return { membersError, teamError };
}

export async function setTeamCaptain(
  db: AdminDb,
  teamId: string,
  captainId: string
) {
  const { error } = await db
    .from('teams')
    .update({ captain_id: captainId } as never)
    .eq('id', teamId);
  return { error };
}

export type TournamentForAutoRegistration = {
  id: string;
  name: string;
  status: string | null;
  max_teams: number | null;
  min_players: number | null;
  solo_mode: boolean | null;
  pooled_teams: boolean | null;
};

export async function readTournamentForAutoRegistration(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id, name, status, max_teams, min_players, solo_mode, pooled_teams')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .single();
  return data as TournamentForAutoRegistration | null;
}

/** Équipes distinctes déjà rattachées à une phase du tournoi. */
export async function countTournamentStageTeams(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
): Promise<number> {
  const { data } = await db
    .from('stage_teams')
    .select('team_id, tournament_stages!inner(tournament_id)')
    .eq('tenant_id', tenantId)
    .eq('tournament_stages.tournament_id', tournamentId);
  const rows = (data ?? []) as { team_id: string }[];
  return new Set(rows.map((t) => t.team_id)).size;
}

export async function listTournamentStageIds(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
): Promise<string[]> {
  const { data } = await db
    .from('tournament_stages')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
  return ((data ?? []) as { id: string }[]).map((s) => s.id);
}

export async function insertStageTeams(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  stageIds: string[]
) {
  const { error } = await db.from('stage_teams').insert(
    stageIds.map((stageId) => ({
      stage_id: stageId,
      team_id: teamId,
      tenant_id: tenantId,
    })) as never
  );
  return { error };
}

/** Table d'inscription canonique (statut + réponses aux champs custom). */
export async function upsertTournamentTeam(
  db: AdminDb,
  row: {
    tenant_id: string;
    tournament_id: string;
    team_id: string;
    field_values: RegistrationAnswers;
  }
) {
  const { error } = await db
    .from('tournament_teams')
    .upsert({ ...row, status: 'registered' } as never, {
      onConflict: 'tournament_id,team_id',
    });
  return { error };
}

/** Candidature `team_registration` déposée par le wizard. */
export async function insertRegistrationApplication(
  db: AdminDb,
  tenantId: string,
  row: {
    user_id: string;
    team_id: string;
    tournament_id: string;
    payload: Record<string, unknown>;
  }
) {
  const { data, error } = await db
    .from('demandes')
    .insert({
      ...row,
      type: 'team_registration',
      status: 'pending',
      source: 'website',
      tenant_id: tenantId,
    } as never)
    .select('id')
    .maybeSingle();
  return { demandeId: (data as { id?: string } | null)?.id ?? null, error };
}
