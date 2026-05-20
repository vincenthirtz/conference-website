// utils/bracket/snapshot.ts
//
// Capture / restauration de l'état complet d'un bracket. Complète le
// rollback in-memory existant (cf. snapshotPropagationSlots dans
// propagate.ts) en persistant l'état pour permettre un rollback large
// (admin) après plusieurs mutations.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

export type SnapshotMatchRow = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  status: string;
  completed_at: string | null;
  forfeit_team_id: string | null;
};

export type SnapshotReason =
  | 'apply_score'
  | 'auto_seed'
  | 'manual_seed'
  | 'advance_teams'
  | 'bracket_propagation'
  | 'manual';

export type CreateSnapshotInput = {
  stageId: string;
  reason: SnapshotReason | string;
  staffId?: string | null;
  /**
   * Tenant courant. S5b : accepte optionnel pour ne pas casser les call sites
   * publics non encore migres. S7 / Phase 3 : rendra obligatoire.
   */
  tenantId?: string | null;
};

export type CreatedSnapshot = {
  id: number;
  matchCount: number;
};

/**
 * Capture l'état actuel de tous les matches d'un stage et persiste un
 * snapshot en DB. Best-effort : si l'insert échoue (table absente, etc.),
 * on log et on retourne null sans bloquer le caller.
 */
export async function createBracketSnapshot(
  input: CreateSnapshotInput
): Promise<CreatedSnapshot | null> {
  if (!supabaseAdmin) return null;

  let matchesQuery = supabaseAdmin
    .from('matches')
    .select(
      'id, team1_id, team2_id, team1_score, team2_score, winner_team_id, status, completed_at, forfeit_team_id'
    )
    .eq('stage_id', input.stageId);
  if (input.tenantId) {
    matchesQuery = matchesQuery.eq('tenant_id', input.tenantId);
  }
  const { data: matches, error: fetchErr } = await matchesQuery;
  if (fetchErr) {
    logger.error('[bracket/snapshot] fetch matches error', fetchErr);
    return null;
  }
  const rows: SnapshotMatchRow[] = matches ?? [];

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('bracket_snapshots')
    .insert({
      stage_id: input.stageId,
      reason: input.reason,
      taken_by_staff_id: input.staffId ?? null,
      matches_snapshot: rows,
      match_count: rows.length,
      // Si pas de tenantId fourni (call site pas encore migre S5b), on stocke
      // null et on resoudra plus tard via le stage. S7 : rendre non-null.
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    })
    .select('id')
    .maybeSingle();
  if (insErr) {
    logger.error('[bracket/snapshot] insert error', insErr);
    return null;
  }
  return { id: inserted!.id as number, matchCount: rows.length };
}

/**
 * Restaure l'état des matches du stage à partir d'un snapshot donné.
 * Pour chaque match du snapshot, UPDATE ses champs. Les matches qui
 * n'existent plus dans la DB (supprimés depuis le snapshot) sont ignorés.
 */
export async function restoreBracketSnapshot(
  snapshotId: number
): Promise<{ restored: number; missing: number } | null> {
  if (!supabaseAdmin) return null;

  const { data: snap, error } = await supabaseAdmin
    .from('bracket_snapshots')
    .select('id, stage_id, matches_snapshot')
    .eq('id', snapshotId)
    .maybeSingle();
  if (error || !snap) {
    logger.error('[bracket/snapshot] restore lookup error', error);
    return null;
  }

  const rows = (snap.matches_snapshot as SnapshotMatchRow[] | null) ?? [];
  let restored = 0;
  let missing = 0;

  for (const row of rows) {
    const { error: updErr, count } = await supabaseAdmin
      .from('matches')
      .update(
        {
          team1_id: row.team1_id,
          team2_id: row.team2_id,
          team1_score: row.team1_score,
          team2_score: row.team2_score,
          winner_team_id: row.winner_team_id,
          status: row.status,
          completed_at: row.completed_at,
          forfeit_team_id: row.forfeit_team_id,
          updated_at: new Date().toISOString(),
        },
        { count: 'exact' }
      )
      .eq('id', row.id);
    if (updErr) {
      logger.error(
        `[bracket/snapshot] restore update error for match ${row.id}`,
        updErr
      );
      missing++;
      continue;
    }
    if ((count ?? 0) > 0) {
      restored++;
    } else {
      missing++;
    }
  }

  return { restored, missing };
}
