// features/player/tcg/service/wallet.ts — « D'où viennent mes pièces ? »
// (lot P14, extrait de pages/api/player/tcg/wallet.ts, même contrat).
//
// `tcg_wallets.balance` est un CACHE ; la vérité est `tcg_wallet_entries`, qui
// justifie le solde ligne à ligne. BORNÉE, PAS PAGINÉE : 50 lignes couvrent une
// saison. L'API rend le FAIT (`sourceKind` brut), l'interface le formule. Le
// total est recalculé depuis les lignes rendues, jamais lu dans le cache.
//
// ERREUR DE LECTURE ≠ REGISTRE VIDE : un échec répond 500, jamais `entries: []`.

import { LegacyAdminError } from '@/utils/admin/errors';
import * as repo from '../repository/core';
import type { TcgServiceContext } from './context';

/** Mouvements rendus. Une borne, pas une pagination. */
export const WALLET_MAX_ENTRIES = 50;

export async function readWallet(ctx: TcgServiceContext) {
  const { rows, error } = await repo.readWalletEntries(ctx.db, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    limit: WALLET_MAX_ENTRIES,
  });
  if (error) {
    ctx.logger.error('[tcg/wallet] registre illisible: %s', error.message);
    throw new LegacyAdminError(500, 'Lecture impossible.');
  }

  // Un montant non fini (corruption) n'entre pas dans le total : il le
  // rendrait `NaN` et masquerait tout le reste.
  const shownTotal = rows.reduce(
    (sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0),
    0
  );

  return {
    entries: rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      sourceKind: r.source_kind,
      sourceRef: r.source_ref,
      // Le motif d'une correction de l'équipe, et seulement d'elle : les
      // autres sources n'ont rien à dire que `sourceKind` ne dise déjà.
      note: r.source_kind === 'admin_grant' ? (r.note ?? null) : null,
      createdAt: r.created_at,
    })),
    shownTotal,
    // La borne atteinte : il existe peut-être des mouvements plus anciens.
    truncated: rows.length === WALLET_MAX_ENTRIES,
  };
}
