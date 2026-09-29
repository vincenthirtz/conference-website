// features/player/tcg/repository/trades.ts — accès directs des échanges de
// cartes (lot P14). La base est REÇUE, toujours scopée tenant.
//
// Proposer et accepter passent par les fonctions SQL (`tcg_propose_trade`,
// `tcg_accept_trade`) qui portent TOUTES les règles (possession, engagements,
// plafonds, âge des comptes, transfert atomique des cartes). Refuser / annuler
// est une mise à jour CONDITIONNELLE (`status = 'pending'` et non expirée) :
// deux clics ne peuvent pas résoudre deux fois.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { TRADE_COLUMNS, type TradeRow } from '@/utils/tcg/trades';

/** Une page de ma boîte, ordre (created_at DESC, id DESC), `limit + 1` lignes. */
export async function readTradesPage(
  db: AdminDb,
  k: {
    tenantId: string;
    userId: string;
    box: 'received' | 'sent';
    state: 'open' | 'closed';
    after: { grantedAt: string; id: string } | null;
    limit: number;
  }
) {
  let q = db
    .from('tcg_trades')
    .select(TRADE_COLUMNS)
    .eq('tenant_id', k.tenantId)
    .eq(k.box === 'received' ? 'recipient_id' : 'proposer_id', k.userId);
  q =
    k.state === 'open' ? q.eq('status', 'pending') : q.neq('status', 'pending');
  if (k.after) {
    q = q.or(
      `created_at.lt.${k.after.grantedAt},and(created_at.eq.${k.after.grantedAt},id.lt.${k.after.id})`
    );
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(k.limit + 1);
  return { rows: (data ?? []) as unknown as TradeRow[], error };
}

/** Proposer : UNE transaction, qui rend `{ status, … }`. */
export async function proposeTradeRpc(
  db: AdminDb,
  args: {
    p_tenant_id: string;
    p_proposer_id: string;
    p_recipient_id: string;
    p_offered: unknown;
    p_requested: unknown;
    p_ttl_hours: number;
    p_max_cards: number;
    p_max_pending_sent: number;
    p_max_pending_received: number;
    p_decline_cooldown_hours: number;
    p_min_account_age_days: number;
    p_min_collection_age_days: number;
  }
) {
  // Offert / demandé sont des tableaux validés par `proposeTradeSchema` ; la
  // signature générée les type `Json`.
  const { data, error } = await db.rpc('tcg_propose_trade', args as never);
  return { result: (data ?? {}) as Record<string, unknown>, error };
}

/** Accepter : UNE transaction (transfert des cartes compris). */
export async function acceptTradeRpc(
  db: AdminDb,
  args: {
    p_tenant_id: string;
    p_trade_id: string;
    p_user_id: string;
    p_max_accepted_per_day: number;
    p_min_account_age_days: number;
    p_min_collection_age_days: number;
  }
) {
  const { data, error } = await db.rpc('tcg_accept_trade', args);
  return { result: (data ?? {}) as Record<string, unknown>, error };
}

/**
 * Refuser / annuler : n'aboutit que sur une proposition EN ATTENTE, non
 * expirée, dont je suis la bonne partie (`actorColumn`).
 */
export async function resolvePendingTrade(
  db: AdminDb,
  k: {
    tenantId: string;
    tradeId: string;
    userId: string;
    actorColumn: 'recipient_id' | 'proposer_id';
    targetStatus: 'declined' | 'cancelled';
    resolutionReason: string | null;
    nowIso: string;
  }
) {
  const { data, error } = await db
    .from('tcg_trades')
    .update({
      status: k.targetStatus,
      resolved_at: k.nowIso,
      resolution_reason: k.resolutionReason,
    })
    .eq('id', k.tradeId)
    .eq('tenant_id', k.tenantId)
    .eq(k.actorColumn, k.userId)
    .eq('status', 'pending')
    .gt('expires_at', k.nowIso)
    .select(TRADE_COLUMNS);
  return { changed: (data ?? []) as unknown as TradeRow[], error };
}

/** La proposition telle qu'elle est (relecture après une résolution sans effet). */
export async function readMyTrade(
  db: AdminDb,
  k: {
    tenantId: string;
    tradeId: string;
    userId: string;
    actorColumn: 'recipient_id' | 'proposer_id';
  }
) {
  const { data, error } = await db
    .from('tcg_trades')
    .select(TRADE_COLUMNS)
    .eq('id', k.tradeId)
    .eq('tenant_id', k.tenantId)
    .eq(k.actorColumn, k.userId)
    .maybeSingle();
  return { trade: data as unknown as TradeRow | null, error };
}

/** Combien de propositions EN ATTENTE (non expirées) j'ai envoyées / reçues. */
export async function countPendingTrades(
  db: AdminDb,
  k: {
    tenantId: string;
    userId: string;
    side: 'proposer_id' | 'recipient_id';
    nowIso: string;
  }
) {
  const { count, error } = await db
    .from('tcg_trades')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', k.tenantId)
    .eq(k.side, k.userId)
    .eq('status', 'pending')
    .gt('expires_at', k.nowIso);
  return { count, error };
}

/** Pose ma préférence « j'accepte les propositions ». */
export async function upsertTradeSettings(
  db: AdminDb,
  k: {
    tenantId: string;
    userId: string;
    acceptsProposals: boolean;
    nowIso: string;
  }
) {
  const { error } = await db.from('tcg_trade_settings').upsert(
    {
      tenant_id: k.tenantId,
      user_id: k.userId,
      accepts_proposals: k.acceptsProposals,
      updated_at: k.nowIso,
    },
    { onConflict: 'tenant_id,user_id' }
  );
  return { error };
}

/** À la désactivation : annule mes propositions REÇUES en attente. */
export async function cancelReceivedPending(
  db: AdminDb,
  k: { tenantId: string; userId: string; nowIso: string }
) {
  const { data, error } = await db
    .from('tcg_trades')
    .update({
      status: 'cancelled',
      resolution_reason: 'trading_disabled',
      resolved_at: k.nowIso,
    })
    .eq('tenant_id', k.tenantId)
    .eq('recipient_id', k.userId)
    .eq('status', 'pending')
    .select('id, proposer_id, recipient_id');
  return { rows: data ?? [], error };
}

/** À la désactivation : retire mes propositions ENVOYÉES en attente. */
export async function cancelSentPending(
  db: AdminDb,
  k: { tenantId: string; userId: string; nowIso: string }
) {
  const { data, error } = await db
    .from('tcg_trades')
    .update({
      status: 'cancelled',
      resolution_reason: 'proposer_cancelled',
      resolved_at: k.nowIso,
    })
    .eq('tenant_id', k.tenantId)
    .eq('proposer_id', k.userId)
    .eq('status', 'pending')
    .select('id');
  return { rows: data ?? [], error };
}

/** Les volontaires de l'espace (hors moi), bornés. */
export async function readTradeVolunteers(
  db: AdminDb,
  k: { tenantId: string; userId: string; limit: number }
) {
  const { data, error } = await db
    .from('tcg_trade_settings')
    .select('user_id')
    .eq('tenant_id', k.tenantId)
    .eq('accepts_proposals', true)
    .neq('user_id', k.userId)
    .limit(k.limit);
  return { ids: (data ?? []).map((r) => r.user_id), error };
}

/** Mes blocages, du plus récent au plus ancien. */
export async function readTradeBlocks(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { data, error } = await db
    .from('tcg_trade_blocks')
    .select('blocked_user_id, created_at')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

export async function upsertTradeBlock(
  db: AdminDb,
  k: { tenantId: string; userId: string; target: string }
) {
  const { error } = await db
    .from('tcg_trade_blocks')
    .upsert(
      { tenant_id: k.tenantId, user_id: k.userId, blocked_user_id: k.target },
      { onConflict: 'tenant_id,user_id,blocked_user_id' }
    );
  return { error };
}

export async function deleteTradeBlock(
  db: AdminDb,
  k: { tenantId: string; userId: string; target: string }
) {
  const { error } = await db
    .from('tcg_trade_blocks')
    .delete()
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .eq('blocked_user_id', k.target);
  return { error };
}
