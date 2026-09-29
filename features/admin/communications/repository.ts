// features/admin/communications/repository.ts — accès base des campagnes
// email côté staff.
//
// PORTÉE : `email_campaigns`, `broadcast_schedules` et `broadcast_recipients`
// n'ont PAS de colonne `tenant_id` (donnée d'association, PK = campaign_id) :
// ces fonctions sont scopées par campagne, pas par tenant — c'est le schéma,
// pas un oubli. Seul le journal (`staff_logs`) est lu par tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';

/* ---- Stats de la liste ---- */

/** Journal des envois (entity_type='broadcast') pour les campagnes de la page. */
export async function listBroadcastLogs(
  db: AdminDb,
  tenantId: string,
  campaignIds: string[]
) {
  const { data, error } = await db
    .from('staff_logs')
    .select('created_at, payload')
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'broadcast')
    .in('payload->>campaign', campaignIds)
    .order('created_at', { ascending: false })
    .limit(500);
  return { rows: data, error };
}

export async function listSchedules(db: AdminDb, campaignIds: string[]) {
  const { data, error } = await db
    .from('broadcast_schedules')
    .select('campaign_id, wave_size, status, last_wave_at, total_recipients')
    .in('campaign_id', campaignIds);
  return { rows: data, error };
}

export async function listRecipientStatuses(
  db: AdminDb,
  campaignIds: string[]
) {
  const { data, error } = await db
    .from('broadcast_recipients')
    .select('campaign_id, status')
    .in('campaign_id', campaignIds);
  return { rows: data, error };
}

/* ---- Campagnes ---- */

export async function insertCampaign(
  db: AdminDb,
  row: TablesInsert<'email_campaigns'>
) {
  const { error } = await db.from('email_campaigns').insert(row);
  return { error };
}

export async function updateCampaign(
  db: AdminDb,
  campaignId: string,
  patch: TablesUpdate<'email_campaigns'>
) {
  const { error } = await db
    .from('email_campaigns')
    .update(patch)
    .eq('id', campaignId);
  return { error };
}

/** Supprime la campagne ET son planning + snapshot (sinon orphelins). */
export async function deleteCampaignCascade(db: AdminDb, campaignId: string) {
  await db.from('broadcast_recipients').delete().eq('campaign_id', campaignId);
  await db.from('broadcast_schedules').delete().eq('campaign_id', campaignId);
  const { error } = await db
    .from('email_campaigns')
    .delete()
    .eq('id', campaignId);
  return { error };
}

/* ---- Programmation par vagues ---- */

export async function getSchedule(db: AdminDb, campaignId: string) {
  const { data, error } = await db
    .from('broadcast_schedules')
    .select(
      'campaign_id, wave_size, status, last_wave_at, total_recipients, created_at, updated_at'
    )
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return { row: data, error };
}

export async function hasSchedule(db: AdminDb, campaignId: string) {
  const { data } = await db
    .from('broadcast_schedules')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return Boolean(data);
}

export async function listCampaignRecipientStatuses(
  db: AdminDb,
  campaignId: string
) {
  const { data, error } = await db
    .from('broadcast_recipients')
    .select('status', { count: 'exact', head: false })
    .eq('campaign_id', campaignId);
  return { rows: data, error };
}

/** Snapshot `pending` (ON CONFLICT DO NOTHING : les statuts existants restent). */
export async function snapshotRecipients(
  db: AdminDb,
  rows: TablesInsert<'broadcast_recipients'>[]
) {
  const { error, count } = await db.from('broadcast_recipients').upsert(rows, {
    onConflict: 'campaign_id,user_id',
    ignoreDuplicates: true,
    count: 'exact',
  });
  return { error, count };
}

export async function upsertSchedule(
  db: AdminDb,
  row: TablesInsert<'broadcast_schedules'>
) {
  const { error } = await db
    .from('broadcast_schedules')
    .upsert(row, { onConflict: 'campaign_id' });
  return { error };
}

/** Annulation : retire les `pending` (l'historique sent/failed reste). */
export async function deletePendingRecipients(db: AdminDb, campaignId: string) {
  const { error, count } = await db
    .from('broadcast_recipients')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');
  return { error, count };
}

export async function deleteSchedule(db: AdminDb, campaignId: string) {
  const { error } = await db
    .from('broadcast_schedules')
    .delete()
    .eq('campaign_id', campaignId);
  return { error };
}
