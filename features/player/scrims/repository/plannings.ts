// features/player/scrims/repository/plannings.ts — sessions de planning
// (`scrim_plannings`) et peintures (`scrim_planning_availabilities`), côté
// joueuse. Toujours scopé tenant ; jamais d'attribution nominative renvoyée
// telle quelle (le service anonymise la heatmap).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type {
  PlanningParty,
  ScrimPlanningDetailDto,
  ScrimPlanningSummaryDto,
} from '../schemas';

const SUMMARY_COLUMNS =
  'id, title, game, status, team1_id, team2_id, horizon_start, horizon_days, validated_slot, scrim_id';

/**
 * Colonnes explicites (P4) : celles que lit l'écran de la session. L'ancien
 * `*` renvoyait aussi `created_by`, `source_demande_id`,
 * `reminder_pinged_at`, `scrim_id`, `is_public`, `deleted_at`, `tenant_id`.
 */
const DETAIL_COLUMNS =
  'id, status, title, team1_id, team2_id, horizon_start, horizon_days, slot_minutes, day_start_min, day_end_min, timezone, staff_required, validated_slot';

/** Statut, équipes, grille : ce qu'il faut pour peindre ou suggérer. */
const GRID_COLUMNS =
  'id, status, team1_id, team2_id, horizon_start, horizon_days, slot_minutes, day_start_min, day_end_min, timezone';

export type PlanningGridRow = {
  id: string;
  status: string;
  team1_id: string;
  team2_id: string;
  horizon_start: string;
  horizon_days: number;
  slot_minutes: number;
  day_start_min: number;
  day_end_min: number;
  timezone: string;
};

export async function listOpenPlannings(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('scrim_plannings')
    .select(SUMMARY_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return {
    plannings: (data ?? []) as unknown as ScrimPlanningSummaryDto[],
    error,
  };
}

/** Mes peintures sur une liste de sessions, en un seul appel. */
export async function listMyAvailabilities(
  db: AdminDb,
  tenantId: string,
  userId: string,
  planningIds: string[]
) {
  const { data } = await db
    .from('scrim_planning_availabilities')
    .select('planning_id, slots')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .in('planning_id', planningIds);
  return (data ?? []) as unknown as Array<{
    planning_id: string;
    slots: unknown;
  }>;
}

export async function readPlanningDetail(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('scrim_plannings')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return { planning: data as unknown as ScrimPlanningDetailDto | null, error };
}

export async function readPlanningGrid(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('scrim_plannings')
    .select(GRID_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return { planning: data as unknown as PlanningGridRow | null, error };
}

export type AvailabilityRow = {
  user_id: string;
  party: PlanningParty;
  display_name: string | null;
  slots: unknown;
};

export async function listPlanningAvailabilities(
  db: AdminDb,
  tenantId: string,
  planningId: string
) {
  const { data } = await db
    .from('scrim_planning_availabilities')
    .select('user_id, party, display_name, slots')
    .eq('tenant_id', tenantId)
    .eq('planning_id', planningId);
  return (data ?? []) as unknown as AvailabilityRow[];
}

/** Dernières peintures de l'appelante sur d'AUTRES sessions (récentes d'abord). */
export async function listMyPastAvailabilities(
  db: AdminDb,
  tenantId: string,
  userId: string,
  excludePlanningId: string
) {
  const { data } = await db
    .from('scrim_planning_availabilities')
    .select('slots, updated_at, planning_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .neq('planning_id', excludePlanningId)
    .order('updated_at', { ascending: false })
    .limit(10);
  return (data ?? []) as unknown as Array<{ slots: unknown }>;
}

export async function upsertMyAvailability(
  db: AdminDb,
  row: {
    tenant_id: string;
    planning_id: string;
    party: PlanningParty;
    user_id: string;
    display_name: string | null;
    slots: string[];
    updated_at: string;
  }
) {
  const { error } = await db
    .from('scrim_planning_availabilities')
    .upsert(row as never, { onConflict: 'planning_id,user_id' });
  return { error };
}

export async function readMemberDisplayName(
  db: AdminDb,
  tenantId: string,
  userId: string
): Promise<string | null> {
  const { data } = await db
    .from('team_members')
    .select('display_name')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return ((data as { display_name?: string | null } | null)?.display_name ??
    null) as string | null;
}
