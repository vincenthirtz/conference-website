// features/admin/notifications/repository.ts — accès base des Web Push du
// staff.
//
// Exception assumée à la règle « tenantId obligatoire » : ces tables sont
// scopées par COMPTE (`user_id` = auth.users.id, commun joueuses + staff), pas
// par tenant. Chaque fonction exige donc `userId` — une requête non scopée ne
// peut pas s'écrire par accident.

import type { AdminDb } from '@/utils/admin/serviceContext';

export async function listSubscriptionIds(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId);
  return { ids: (data ?? []).map((s) => s.id), error };
}

export async function listSubscriptions(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  return { rows: data ?? [], error };
}

/** Deliveries délivrées et non acquittées (index partiel `idx_web_push_deliveries_unacked`). */
export async function countUnacked(db: AdminDb, subscriptionIds: string[]) {
  const { count, error } = await db
    .from('web_push_deliveries')
    .select('id', { count: 'exact', head: true })
    .in('subscription_id', subscriptionIds)
    .eq('status', 'delivered')
    .is('acked_at', null);
  return { count: count ?? 0, error };
}

export async function ackAll(
  db: AdminDb,
  subscriptionIds: string[],
  nowIso: string
) {
  const { data, error } = await db
    .from('web_push_deliveries')
    .update({ acked_at: nowIso })
    .in('subscription_id', subscriptionIds)
    .is('acked_at', null)
    .select('id');
  return { cleared: data?.length ?? 0, error };
}

export async function deleteSubscriptionByEndpoint(
  db: AdminDb,
  userId: string,
  endpoint: string
) {
  const { data, error } = await db
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .select('id');
  return { deleted: data?.length ?? 0, error };
}

/**
 * Purge des abonnements expirés (404/410 du push service). Les ids viennent
 * d'une lecture scopée `user_id` juste avant.
 */
export async function deleteSubscriptionsByIds(db: AdminDb, ids: string[]) {
  const { data, error } = await db
    .from('push_subscriptions')
    .delete()
    .in('id', ids)
    .select('id');
  return { deleted: data?.length ?? 0, error };
}

export async function listPrefs(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('notification_prefs')
    .select('event_type, enabled')
    .eq('user_id', userId);
  return { rows: data ?? [], error };
}

export async function deletePrefs(
  db: AdminDb,
  userId: string,
  eventTypes: string[]
) {
  const { error } = await db
    .from('notification_prefs')
    .delete()
    .eq('user_id', userId)
    .in('event_type', eventTypes);
  return { error };
}

export async function insertOptOuts(
  db: AdminDb,
  userId: string,
  rows: Array<{ event_type: string; updated_at: string }>
) {
  const { error } = await db
    .from('notification_prefs')
    .insert(rows.map((r) => ({ ...r, user_id: userId, enabled: false })));
  return { error };
}
