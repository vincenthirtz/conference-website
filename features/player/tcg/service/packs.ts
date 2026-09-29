// features/player/tcg/service/packs.ts — GET /api/player/tcg/packs : mes
// paquets, mon solde, le barème (lot P14, extrait de
// pages/api/player/tcg/packs.ts, même contrat).
//
// PAGINATION PAR CURSEUR, RÉTROCOMPATIBLE : sans paramètre, les 200 plus
// récents plus `nextCursor`. `status=unopened` : l'espace joueuse n'affiche
// QUE les paquets à ouvrir — sans ce filtre, un paquet fermé plus ancien que
// les 200 derniers ne pourrait jamais s'ouvrir.
//
// ERREUR DE LECTURE ≠ SOLDE 0 (écart assumé du lot P14) : le solde en cache
// illisible répondait `balance: 0` — l'écran annonçait une perte qui n'avait
// pas eu lieu. Il répond désormais 500, comme la liste. L'ABSENCE de ligne de
// porte-monnaie reste un solde nul : état normal de qui n'a rien gagné.
//
// Le prix et TOUT le barème sont rendus par l'API : l'interface les affiche
// sans les connaître (les recopier les ferait mentir au premier réglage, et
// importer `economy.ts` côté client traînerait le moteur de rating).

import {
  BATTLENET_VERIFIED_COINS,
  CHECKIN_STREAK_COINS,
  CHECKIN_STREAK_LENGTH,
  COLLECTION_SET_COINS,
  MATCH_PREDICTION_COINS,
  PLACEMENT_TIERS,
  earnReward,
  TWITCH_DROP_COINS,
  WELCOME_GIFT_COINS,
} from '@/utils/tcg/earnSources';
import {
  decodePacksCursor,
  encodePacksCursor,
  parsePageLimit,
  type PacksCursor,
} from '@/utils/tcg/pageCursor';
import {
  BOOSTER_PRICE_COINS,
  MATCH_WIN_COINS,
  SCRIM_WIN_COINS,
  RECYCLE_REFUND_COINS,
} from '@/utils/tcg/economy';
import type { AdminDb } from '@/utils/admin/serviceContext';
import * as repo from '../repository/core';
import { refuse } from './errors';
import type { TcgServiceContext } from './context';

/** Taille de page par défaut : l'ancienne borne fixe (rétrocompatible). */
const DEFAULT_PACKS_LIMIT = 200;

export type PacksQuery = {
  limit?: unknown;
  cursor?: unknown;
  status?: unknown;
};

export async function listPacks(ctx: TcgServiceContext, query: PacksQuery) {
  const { db, tenantId, userId, logger } = ctx;

  const limitParam = parsePageLimit(query.limit);
  if (limitParam === 'invalid') {
    throw refuse(400, 'Paramètre limit invalide.', 'invalid_limit');
  }
  const limit = limitParam ?? DEFAULT_PACKS_LIMIT;

  let cursor: PacksCursor | null = null;
  if (query.cursor !== undefined) {
    cursor = decodePacksCursor(query.cursor);
    if (!cursor) throw refuse(400, 'Curseur invalide.', 'invalid_cursor');
  }

  const status = query.status;
  if (status !== undefined && status !== 'unopened' && status !== 'opened') {
    throw refuse(400, 'Paramètre status invalide.', 'invalid_status');
  }

  const [packsRes, walletRes, unopenedRes] = await Promise.all([
    repo.readPacksPage(db, { tenantId, userId, status, after: cursor, limit }),
    repo.readWalletBalance(db, { tenantId, userId }),
    // Un COMPTE, pas le filtrage de la page lue.
    repo.countUnopenedPacks(db, { tenantId, userId }),
  ]);

  if (packsRes.error) {
    logger.error('[tcg/packs] lecture impossible: %s', packsRes.error.message);
    throw refuse(500, 'Lecture impossible.');
  }
  if (walletRes.error) {
    logger.error('[tcg/packs] solde illisible: %s', walletRes.error.message);
    throw refuse(500, 'Lecture impossible.');
  }

  const rows = packsRes.rows;
  const hasMore = rows.length > limit;
  const packs = hasMore ? rows.slice(0, limit) : rows;
  const last = packs[packs.length - 1];
  const nextCursor =
    hasMore && last
      ? encodePacksCursor({ grantedAt: last.granted_at, id: last.id })
      : null;

  // Compte illisible : on retombe sur la page lue plutôt que de faire échouer
  // l'écran pour un chiffre d'appoint (jamais « 0 » inventé : la page EST lue).
  const unopened =
    !unopenedRes.error && typeof unopenedRes.count === 'number'
      ? unopenedRes.count
      : packs.filter((p) => !p.opened_at).length;

  return {
    packs: packs.map((p) => ({
      id: p.id,
      source: p.source_kind,
      grantedAt: p.granted_at,
      openedAt: p.opened_at,
    })),
    unopened,
    nextCursor,
    // Pas de ligne de porte-monnaie = solde nul (rien gagné encore).
    balance: walletRes.balance ?? 0,
    boosterPrice: BOOSTER_PRICE_COINS,
    earn: {
      matchWin: MATCH_WIN_COINS,
      scrimWin: SCRIM_WIN_COINS,
      // Inconditionnels : des barèmes, pas des promesses.
      welcomeGift: WELCOME_GIFT_COINS,
      checkinStreak: {
        length: CHECKIN_STREAK_LENGTH,
        coins: CHECKIN_STREAK_COINS,
        packs: earnReward('checkin_streak').packs,
      },
      placement: PLACEMENT_TIERS.map((tier) => ({
        maxRank: tier.maxRank,
        coins: tier.coins,
        packs: tier.packs,
      })),
      battlenetVerified: {
        coins: BATTLENET_VERIFIED_COINS,
        packs: earnReward('battlenet_verified').packs,
      },
      collectionSet: {
        coins: COLLECTION_SET_COINS,
        packs: earnReward('collection_set').packs,
      },
      matchPrediction: {
        coins: MATCH_PREDICTION_COINS,
        packs: earnReward('match_prediction').packs,
      },
      // Le drop n'est annoncé QUE s'il est réellement branché.
      ...(await twitchDropReward(db, tenantId)),
    },
    recycleRefund: RECYCLE_REFUND_COINS,
  };
}

/**
 * Le barème du drop Twitch, ou rien. Ne lève jamais : une lecture en échec
 * fait TAIRE l'annonce (une promesse en moins), elle ne casse pas l'écran.
 */
async function twitchDropReward(
  db: AdminDb,
  tenantId: string
): Promise<{ twitchDrop?: number }> {
  try {
    const { rewardId, error } = await repo.readTwitchTcgRewardId(db, tenantId);
    if (error) return {};
    return typeof rewardId === 'string' && rewardId.length > 0
      ? { twitchDrop: TWITCH_DROP_COINS }
      : {};
  } catch {
    return {};
  }
}
