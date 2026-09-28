// features/admin/diffusion/repository.ts — lectures de la barre Diffusion,
// toutes scopées par l'espace DU staff (pas celui du chemin de l'URL).

import type { AdminDb } from '@/utils/admin/serviceContext';

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
