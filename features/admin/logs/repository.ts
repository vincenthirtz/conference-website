// features/admin/logs/repository.ts — lectures des journaux, TOUTES scopées
// par le tenant reçu.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';

/**
 * Client non typé : filtres et table (`bot_player_actions` /
 * `bot_event_outbox`) choisis à l'exécution, que le type généré ne suit pas.
 */
function untyped(db: AdminDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

export type StaffLogFilters = {
  staffId?: string;
  tournamentId?: string;
  /** Couple (entity_type, entity_id) remappé depuis matchId / stageId… */
  entity?: [string, string];
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
  /** Clauses `.or()` déjà échappées. */
  or?: string;
  ascending: boolean;
  range: [number, number];
  withTotal: boolean;
};

export async function queryStaffLogs(
  db: AdminDb,
  tenantId: string,
  f: StaffLogFilters
) {
  // Pas de relation FK exploitable côté PostgREST : noms staff résolus à part.
  let query = untyped(db)
    .from('staff_logs')
    .select(
      'id, created_at, staff_id, action, entity_type, entity_id, payload, tournament_id, tenant_id',
      { count: f.withTotal ? 'exact' : undefined }
    )
    .eq('tenant_id', tenantId);

  if (f.staffId) query = query.eq('staff_id', f.staffId);
  if (f.tournamentId) query = query.eq('tournament_id', f.tournamentId);
  if (f.entity) {
    query = query.eq('entity_type', f.entity[0]).eq('entity_id', f.entity[1]);
  } else if (f.entityType) {
    query = query.eq('entity_type', f.entityType);
  }
  if (f.action) query = query.eq('action', f.action);
  if (f.from) query = query.gte('created_at', f.from);
  if (f.to) query = query.lte('created_at', f.to);
  if (f.or) query = query.or(f.or);

  const { data, error, count } = await query
    .order('created_at', { ascending: f.ascending })
    .range(f.range[0], f.range[1]);
  return { rows: (data ?? []) as unknown[], error, count };
}

export async function listStaffNames(db: AdminDb, ids: string[]) {
  const { data, error } = await db
    .from('staff')
    .select('id, display_name, email')
    .in('id', ids);
  return { rows: data ?? [], error };
}

export type DiscordLogFilters = {
  source: 'player' | 'event';
  action?: string;
  entityType?: string;
  actorDiscordUserId?: string;
  targetDiscordUserId?: string;
  status?: string;
  from?: string;
  to?: string;
  or?: string;
  range: [number, number];
  withTotal: boolean;
};

const OUTBOX_COLUMNS =
  'id, created_at, event_id, event_name, status, push_attempts, last_push_error, delivered_at, payload';
const PLAYER_ACTION_COLUMNS = `id, created_at, action, entity_type, entity_id, actor_auth_user_id,
           actor_discord_user_id, target_auth_user_id, target_discord_user_id, payload`;

export async function queryDiscordLogs(
  db: AdminDb,
  tenantId: string,
  f: DiscordLogFilters
) {
  const isEvent = f.source === 'event';
  let query = untyped(db)
    .from(isEvent ? 'bot_event_outbox' : 'bot_player_actions')
    .select(isEvent ? OUTBOX_COLUMNS : PLAYER_ACTION_COLUMNS, {
      count: f.withTotal ? 'exact' : undefined,
    })
    .eq('tenant_id', tenantId);

  if (f.action) query = query.eq(isEvent ? 'event_name' : 'action', f.action);
  if (f.from) query = query.gte('created_at', f.from);
  if (f.to) query = query.lte('created_at', f.to);

  if (isEvent) {
    if (f.status) query = query.eq('status', f.status);
  } else {
    if (f.entityType) query = query.eq('entity_type', f.entityType);
    if (f.actorDiscordUserId) {
      query = query.eq('actor_discord_user_id', f.actorDiscordUserId);
    }
    if (f.targetDiscordUserId) {
      query = query.eq('target_discord_user_id', f.targetDiscordUserId);
    }
  }
  if (f.or) query = query.or(f.or);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(f.range[0], f.range[1]);
  return { rows: (data ?? []) as unknown[], error, count };
}

export async function listEntityHistory(
  db: AdminDb,
  tenantId: string,
  entityType: string,
  entityId: string,
  limit: number
) {
  const { data, error } = await untyped(db)
    .from('staff_logs')
    .select(
      `
      id, created_at, staff_id, action, entity_type, entity_id,
      tournament_id, payload,
      staff:staff!fk_staff_logs_staff(id, auth_user_id, role, display_name, avatar_url)
      `
    )
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { rows: (data ?? []) as unknown[], error };
}
