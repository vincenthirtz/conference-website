// features/admin/diffusion/repository.ts — lectures de la barre Diffusion,
// toutes scopées par l'espace DU staff (pas celui du chemin de l'URL).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { TWITCH_CHANNEL_COLUMNS } from './schemas';

type TwitchChannelInsert =
  Database['public']['Tables']['twitch_channels']['Insert'];
type TwitchChannelUpdate =
  Database['public']['Tables']['twitch_channels']['Update'];

export async function findLiveRun(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('event_runs')
    .select('id, name, started_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'live')
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return { run: data ?? null, error };
}

export async function listActiveTwitchChannels(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('twitch_channels')
    .select('channel, label')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  return {
    rows: data ?? [],
    error,
  };
}

export async function listOverlayHeartbeats(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('overlay_heartbeats')
    .select('source, last_seen_at')
    .eq('tenant_id', tenantId)
    .limit(500);
  return {
    rows: data ?? [],
    error,
  };
}

/* ---- Édition de la liste des chaînes (permission manage_broadcast) ---- */

export async function listTwitchChannels(
  db: AdminDb,
  tenantId: string,
  opts: { limit: number; includeInactive: boolean }
) {
  let query = db
    .from('twitch_channels')
    .select(TWITCH_CHANNEL_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(opts.limit);
  if (!opts.includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

export async function getTwitchChannel(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('twitch_channels')
    .select(TWITCH_CHANNEL_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function maxTwitchSortOrder(
  db: AdminDb,
  tenantId: string
): Promise<number> {
  const { data } = await db
    .from('twitch_channels')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.sort_order ?? 0;
}

export async function insertTwitchChannel(
  db: AdminDb,
  row: TwitchChannelInsert
) {
  const { data, error } = await db
    .from('twitch_channels')
    .insert(row)
    .select(TWITCH_CHANNEL_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function updateTwitchChannel(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TwitchChannelUpdate
) {
  const { data, error } = await db
    .from('twitch_channels')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(TWITCH_CHANNEL_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deleteTwitchChannel(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { error } = await db
    .from('twitch_channels')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
