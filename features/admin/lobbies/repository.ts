// features/admin/lobbies/repository.ts — accès base des lobbies FFA
// (`lobbies`, `lobby_placements`), scopé par tenant (paramètre OBLIGATOIRE).
//
// FFA est isolé du moteur match team-vs-team : rien ici ne touche `matches`.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

type PlacementInsert =
  Database['public']['Tables']['lobby_placements']['Insert'];

/** Lobby rendu après saisie des placements (`{ lobby }`). */
export const LOBBY_COLUMNS =
  'id, tenant_id, tournament_id, stage_id, name, round_number, best_of, status, created_at' as const;

export async function findLobbyRef(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('lobbies')
    .select('id, tournament_id, stage_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function findLobby(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('lobbies')
    .select(LOBBY_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteLobby(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('lobbies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function updateLobbyStatus(
  db: AdminDb,
  tenantId: string,
  id: string,
  status: string
) {
  const { data, error } = await db
    .from('lobbies')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(LOBBY_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function listStageLobbyIds(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data } = await db
    .from('lobbies')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);
  return (data ?? []).map((l) => l.id);
}

export async function findStage(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, settings')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

/** Équipes de `teamIds` inscrites au tournoi (best-effort : erreur = aucune). */
export async function listRegisteredTeamIds(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamIds: string[]
) {
  const { data } = await db
    .from('tournament_teams')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .in('team_id', teamIds);
  return new Set((data ?? []).map((r) => r.team_id));
}

/** Retire les placements du lobby, sauf ceux des équipes `keepTeamIds`. */
export async function deletePlacements(
  db: AdminDb,
  tenantId: string,
  lobbyId: string,
  keepTeamIds: string[] = []
) {
  let query = db
    .from('lobby_placements')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('lobby_id', lobbyId);
  if (keepTeamIds.length > 0) {
    query = query.not('team_id', 'in', `(${keepTeamIds.join(',')})`);
  }
  const { error } = await query;
  return { error };
}

export async function upsertPlacements(db: AdminDb, rows: PlacementInsert[]) {
  const { error } = await db
    .from('lobby_placements')
    .upsert(rows, { onConflict: 'lobby_id,team_id' });
  return { error };
}

export async function listStagePlacements(
  db: AdminDb,
  tenantId: string,
  lobbyIds: string[]
) {
  const { data } = await db
    .from('lobby_placements')
    .select(
      'team_id, placement, points, score, team:team_id(id, name, logo_url, short_name)'
    )
    .eq('tenant_id', tenantId)
    .in('lobby_id', lobbyIds);
  return data ?? [];
}
