// features/admin/tournaments/repository/ops.ts — accès base de l'exploitation
// d'un tournoi : check-in (délai de grâce, relances), webhooks Discord,
// cagnotte. `tenantId` obligatoire partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  DISCORD_WEBHOOK_COLUMNS,
  PRIZE_POOL_CONTRIBUTION_COLUMNS,
  PRIZE_POOL_ROW_COLUMNS,
  PRIZE_POOL_VIEW_COLUMNS,
} from '../schemas';

/* ---- Check-in ---- */

export async function readGraceMinutes(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournaments')
    .select('checkin_grace_minutes')
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
}

export async function readNoShowReasons(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select('id, no_show_reason')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .not('no_show_reason', 'is', null);
}

export async function writeGraceMinutes(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  minutes: number
) {
  return db
    .from('tournaments')
    .update({ checkin_grace_minutes: minutes })
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId);
}

/** Matchs imminents (fenêtre donnée) encore à jouer, pour la relance. */
export async function upcomingMatchesForNudge(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  untilIso: string
) {
  return db
    .from('matches')
    .select(
      'id, scheduled_at, status, team1_checked_in_at, team2_checked_in_at, team1_checkin_token, team2_checkin_token'
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .in('status', ['pending', 'ongoing'])
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', untilIso)
    .order('scheduled_at', { ascending: true })
    .limit(50);
}

export async function setCheckinTokens(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  tokens: TablesUpdate<'matches'>
) {
  return db
    .from('matches')
    .update(tokens)
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
}

/* ---- Webhooks Discord ---- */

/** Webhooks du tournoi + repli global du tenant (jamais ceux d'un autre). */
export async function listWebhooks(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('discord_webhooks')
    .select(DISCORD_WEBHOOK_COLUMNS)
    .eq('tenant_id', tenantId)
    .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`)
    .order('channel_type', { ascending: true });
}

/** Webhook actif d'un salon : celui du tournoi (id) ou le global (null). */
export async function activeWebhook(
  db: AdminDb,
  tenantId: string,
  tournamentId: string | null,
  channelType: string
) {
  let query = db
    .from('discord_webhooks')
    .select('webhook_url, role_mention, tournament_id');
  query =
    tournamentId === null
      ? query.is('tournament_id', null)
      : query.eq('tournament_id', tournamentId);
  const { data } = await query
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .maybeSingle();
  return data;
}

export async function findWebhookId(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  channelType: string
) {
  const { data } = await db
    .from('discord_webhooks')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType)
    .maybeSingle();
  return data;
}

export async function updateWebhook(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'discord_webhooks'>
) {
  return db
    .from('discord_webhooks')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(DISCORD_WEBHOOK_COLUMNS)
    .maybeSingle();
}

export async function insertWebhook(
  db: AdminDb,
  row: TablesInsert<'discord_webhooks'>
) {
  return db
    .from('discord_webhooks')
    .insert(row)
    .select(DISCORD_WEBHOOK_COLUMNS)
    .maybeSingle();
}

export async function deleteWebhook(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  channelType: string
) {
  return db
    .from('discord_webhooks')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelType);
}

/* ---- Cagnotte ---- */

export async function prizePoolView(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_prize_pools')
    .select(PRIZE_POOL_VIEW_COLUMNS)
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

export async function prizePoolContributions(
  db: AdminDb,
  tenantId: string,
  poolId: string
) {
  return db
    .from('prize_pool_contributions')
    .select(PRIZE_POOL_CONTRIBUTION_COLUMNS)
    .eq('prize_pool_id', poolId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
}

export async function prizePoolId(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_prize_pools')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

export async function updatePrizePool(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'tournament_prize_pools'>
) {
  return db
    .from('tournament_prize_pools')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(PRIZE_POOL_ROW_COLUMNS)
    .maybeSingle();
}

export async function insertPrizePool(
  db: AdminDb,
  row: TablesInsert<'tournament_prize_pools'>
) {
  return db
    .from('tournament_prize_pools')
    .insert(row)
    .select(PRIZE_POOL_ROW_COLUMNS)
    .maybeSingle();
}
