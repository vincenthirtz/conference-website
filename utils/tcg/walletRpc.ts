// utils/tcg/walletRpc.ts
//
// Les écritures de SOLDE du TCG qui exigent une transaction : recalcul du
// cache, achat d'un booster, retrait staff. Elles vivent en SQL
// (`database/migrations/tcg_wallet_atomic_balance.sql`) et ce module est la
// seule porte qui y mène.
//
// POURQUOI EN SQL. PostgREST fait une transaction PAR REQUÊTE. Un achat en
// trois requêtes (débit du cache, paquet, registre) laissait un
// `refreshBalance` concurrent relire un registre pas encore débité et écraser le
// cache : 3 boosters pour le prix de 2 (audit du 2026-09-15). Une fonction
// verrouille la ligne de porte-monnaie, relit le solde par `SUM(amount)` et
// écrit, le tout d'un seul tenant. `SUM` côté base lève aussi le second défaut :
// la somme JavaScript d'un `select('amount')` était coupée à 1000 lignes.
//
// MIGRATION ABSENTE : REPLI SÛR, JAMAIS UN ACHAT SANS VERROU.
//   - le recalcul se replie sur une somme PAGINÉE (défaut des 1000 lignes levé,
//     course résiduelle limitée au cache, que le recalcul suivant répare) ;
//   - l'achat et le retrait rendent `unavailable` : la route refuse (503).
// « Absente » = PostgREST ne connaît pas la fonction (`PGRST202`) ou Postgres ne
// trouve pas la signature (`42883`). Toute autre erreur est une PANNE, pas une
// absence : on ne se replie pas sur un chemin moins sûr à cause d'un 504.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** PostgREST coupe à 1000 lignes (`max_rows`) : le repli lit par pages. */
const LEDGER_PAGE_SIZE = 1000;

type PgError = { code?: string; message?: string } | null | undefined;

/** La fonction SQL n'existe pas (migration non appliquée). */
export function isMissingRpc(error: PgError): boolean {
  const code = error?.code ?? '';
  return code === 'PGRST202' || code === '42883';
}

/** Verrou non obtenu ou transaction sérialisée perdue : réessayer est sûr. */
function isContention(error: PgError): boolean {
  const code = error?.code ?? '';
  return code === '55P03' || code === '40001' || code === '40P01';
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

/* -------------------------------------------------------------------------- */
/* Recalcul du cache                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Réécrit `tcg_wallets.balance` depuis le registre et rend le solde écrit, ou
 * `null` si rien n'a pu être écrit. Ne lève jamais.
 */
export async function recomputeWalletBalance(
  tenantId: string,
  userId: string
): Promise<number | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'tcg_refresh_wallet_balance',
      { p_tenant_id: tenantId, p_user_id: userId }
    );
    if (!error) {
      const balance = asInt(data);
      if (balance !== null) return balance;
      // Réponse sans solde : forme inattendue. Le repli, lui, sait écrire.
    } else if (!isMissingRpc(error)) {
      logger.error(
        '[tcg/wallet] recalcul du solde impossible (%s): %s',
        userId,
        error.message
      );
      return null;
    }
  } catch (err) {
    logger.error(
      '[tcg/wallet] recalcul du solde en exception (%s): %s',
      userId,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }

  return recomputeWalletBalanceFallback(tenantId, userId);
}

/**
 * Repli sans la fonction SQL : somme PAGINÉE du registre, puis écriture du
 * cache. Sans verrou — c'est pourquoi l'achat, lui, ne se replie pas.
 */
async function recomputeWalletBalanceFallback(
  tenantId: string,
  userId: string
): Promise<number | null> {
  const sum = await sumLedgerPaginated(tenantId, userId);
  if (sum === null) return null;

  const balance = Math.max(0, sum);
  const { error: writeError } = await supabaseAdmin!.from('tcg_wallets').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      balance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );
  if (writeError) {
    logger.error(
      '[tcg/wallet] solde non écrit (%s): %s',
      userId,
      writeError.message
    );
    return null;
  }
  return balance;
}

/**
 * Somme du registre par pages de 1000, dans un ordre total. `null` si une page
 * est illisible — jamais une somme partielle présentée comme complète.
 */
export async function sumLedgerPaginated(
  tenantId: string,
  userId: string
): Promise<number | null> {
  if (!supabaseAdmin) return null;
  let sum = 0;
  for (let from = 0; ; from += LEDGER_PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .select('id, amount')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE_SIZE - 1);
    if (error) {
      logger.error(
        '[tcg/wallet] registre illisible (%s): %s',
        userId,
        error.message
      );
      return null;
    }
    const rows = (data ?? []) as Array<{ amount: number }>;
    for (const row of rows) {
      if (Number.isFinite(row.amount)) sum += row.amount;
    }
    if (rows.length < LEDGER_PAGE_SIZE) break;
  }
  return sum;
}

/* -------------------------------------------------------------------------- */
/* Achat d'un booster                                                          */
/* -------------------------------------------------------------------------- */

export type BoosterPurchaseOutcome =
  | { kind: 'ok'; packId: string; balance: number }
  | { kind: 'insufficient_funds'; balance: number }
  /** Verrou non obtenu : un autre mouvement tient le porte-monnaie. */
  | { kind: 'contended' }
  /** Migration non appliquée : on REFUSE plutôt que d'acheter sans verrou. */
  | { kind: 'unavailable' }
  /**
   * Panne, résultat INCONNU. La transaction a pu être validée avant que la
   * réponse se perde : on ne rembourse rien, on ne supprime rien — il n'y a
   * d'ailleurs rien à défaire, tout ou rien ayant été écrit.
   */
  | { kind: 'error' };

export async function purchaseBoosterAtomic(input: {
  tenantId: string;
  userId: string;
  price: number;
}): Promise<BoosterPurchaseOutcome> {
  if (!supabaseAdmin) return { kind: 'unavailable' };
  try {
    const { data, error } = await supabaseAdmin.rpc('tcg_purchase_booster', {
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_price: input.price,
    });
    if (error) {
      if (isMissingRpc(error)) {
        logger.error(
          '[tcg/wallet] tcg_purchase_booster absente — achat refusé (migration tcg_wallet_atomic_balance.sql)'
        );
        return { kind: 'unavailable' };
      }
      if (isContention(error)) return { kind: 'contended' };
      logger.error('[tcg/wallet] achat impossible: %s', error.message);
      return { kind: 'error' };
    }
    const row = (data ?? null) as Record<string, unknown> | null;
    const status = row?.status;
    const balance = asInt(row?.balance);
    if (status === 'ok' && typeof row?.pack_id === 'string') {
      return { kind: 'ok', packId: row.pack_id, balance: balance ?? 0 };
    }
    if (status === 'insufficient_funds') {
      return { kind: 'insufficient_funds', balance: Math.max(0, balance ?? 0) };
    }
    logger.error(
      '[tcg/wallet] réponse d’achat inattendue: %s',
      JSON.stringify(row)
    );
    return { kind: 'error' };
  } catch (err) {
    logger.error(
      '[tcg/wallet] achat en exception: %s',
      err instanceof Error ? err.message : String(err)
    );
    return { kind: 'error' };
  }
}

/* -------------------------------------------------------------------------- */
/* Retrait staff                                                               */
/* -------------------------------------------------------------------------- */

export type AdminDebitOutcome =
  | { kind: 'ok'; entryId: string; balance: number }
  | { kind: 'insufficient'; balance: number }
  /** 23505 : la clé d'idempotence a déjà servi (requête concurrente ou rejeu). */
  | { kind: 'duplicate' }
  | { kind: 'contended' }
  | { kind: 'unavailable' }
  /** Panne, résultat INCONNU : l'appelant relit par la clé. */
  | { kind: 'error'; message: string };

export async function adminDebitAtomic(input: {
  tenantId: string;
  userId: string;
  cost: number;
  sourceRef: string;
  note: string;
}): Promise<AdminDebitOutcome> {
  if (!supabaseAdmin) return { kind: 'unavailable' };
  try {
    const { data, error } = await supabaseAdmin.rpc('tcg_admin_debit', {
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_cost: input.cost,
      p_source_ref: input.sourceRef,
      p_note: input.note,
    });
    if (error) {
      if (isMissingRpc(error)) return { kind: 'unavailable' };
      if ((error as { code?: string }).code === '23505') {
        return { kind: 'duplicate' };
      }
      if (isContention(error)) return { kind: 'contended' };
      return { kind: 'error', message: error.message ?? '?' };
    }
    const row = (data ?? null) as Record<string, unknown> | null;
    const balance = asInt(row?.balance);
    if (row?.status === 'ok' && typeof row.entry_id === 'string') {
      return { kind: 'ok', entryId: row.entry_id, balance: balance ?? 0 };
    }
    if (row?.status === 'insufficient') {
      return { kind: 'insufficient', balance: Math.max(0, balance ?? 0) };
    }
    return { kind: 'error', message: 'réponse inattendue' };
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
