// features/player/tcg/service/recycle.ts — recycler un DOUBLON contre des
// pièces (lot P14, extrait tel quel de pages/api/player/tcg/recycle.ts :
// mêmes contrôles, même ordre, mêmes refus).
//
// UN DOUBLON, JAMAIS LE DERNIER EXEMPLAIRE (`not_a_duplicate`, explicite).
//
// DEUX GARDE-FOUS INDÉPENDANTS CONTRE LE DOUBLE RECYCLAGE, portés PAR LE
// SCHÉMA (cf. `repository.ts`) : réservation atomique (`recycled_at IS NULL`)
// et registre unique par source (`<pack_id>:<position>`). L'Idempotency-Key de
// la route s'y AJOUTE, elle ne les remplace pas.
//
// ON MARQUE AVANT DE CRÉDITER : mieux vaut une carte retirée sans crédit
// (réparable, et le marquage est relâché) qu'un crédit sans carte retirée —
// de la monnaie créée à partir de rien. LA CARTE N'EST PAS SUPPRIMÉE, elle
// est marquée : le crédit reste EXPLICABLE dans l'historique.
//
// ERREUR DE LECTURE ≠ ABSENCE : un recompte illisible ANNULE le recyclage
// (500), il ne vaut jamais « il reste des exemplaires ».

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import { RECYCLE_REFUND_COINS } from '@/utils/tcg/economy';
import { refreshBalance } from '@/utils/tcg/grantVictoryRewards';
import { cardSubjectKey, type TcgCardKind } from '@/utils/tcg/subjectKey';
import {
  readCardsOfPacks,
  readOpenedPackIds,
} from '@/utils/tcg/readOwnedCards';
import * as repo from '../repository/core';
import { RecycleCardBody } from '../schemas';
import { parseOrRefuse, refuse } from './errors';
import type { TcgServiceContext } from './context';

type CardRow = {
  pack_id: string;
  position: number;
  subject_kind: TcgCardKind;
  card_user_id: string | null;
  card_team_id: string | null;
  card_map_slug: string | null;
  card_fanart_id?: string | null;
  card_mascot_slug?: string | null;
};

const ONLY_COPY = 'Cette carte est ton seul exemplaire.';

export async function recycleCard(ctx: TcgServiceContext, rawBody: unknown) {
  const { db, tenantId, userId, logger } = ctx;
  const { packId, position } = parseOrRefuse(RecycleCardBody, rawBody, {
    message: 'Carte manquante.',
    code: 'missing_card',
  });

  // Mes paquets OUVERTS : une carte d'un paquet fermé ou d'une autre
  // joueuse n'existe pas pour moi.
  const packsRead = await readOpenedPackIds(tenantId, userId);
  if (!packsRead.ok) {
    logger.error('[tcg/recycle] paquets illisibles: %s', packsRead.error);
    throw refuse(500, 'Lecture impossible.');
  }
  if (packsRead.truncated) {
    logger.warn(
      '[tcg/recycle] plafond de lecture des paquets atteint (%s)',
      userId
    );
  }
  const packIds = packsRead.value;
  if (!packIds.includes(packId)) {
    throw refuse(404, 'Carte introuvable.');
  }

  const cardsRead = await readCardsOfPacks(packIds);
  if (!cardsRead.ok) {
    logger.error('[tcg/recycle] cartes illisibles: %s', cardsRead.error);
    throw refuse(500, 'Lecture impossible.');
  }
  const cards: CardRow[] = cardsRead.value;
  // `readCardsOfPacks` exclut les cartes déjà recyclées : absente = recyclée.
  const target = cards.find(
    (c) => c.pack_id === packId && c.position === position
  );
  if (!target) {
    throw refuse(409, 'Carte déjà recyclée.', 'already_recycled');
  }

  const targetSubject = cardSubjectKey(target);
  if (!targetSubject) {
    logger.error(
      '[tcg/recycle] carte %s:%s sans sujet exploitable',
      packId,
      position
    );
    throw refuse(409, 'Cette carte est illisible.', 'not_a_duplicate');
  }
  const copies = cards.filter((c) => cardSubjectKey(c) === targetSubject);
  if (copies.length < 2) {
    throw refuse(409, ONLY_COPY, 'not_a_duplicate');
  }

  // 1) RÉSERVATION ATOMIQUE.
  const recycledAt = new Date().toISOString();
  const ref = { packIds, packId, position, recycledAt };
  const { marked, error: markError } = await repo.markCardRecycled(db, ref);
  if (markError) {
    logger.error('[tcg/recycle] marquage impossible: %s', markError.message);
    throw refuse(500, 'Recyclage impossible.');
  }
  if (marked.length === 0) {
    throw refuse(409, 'Carte déjà recyclée.', 'already_recycled');
  }

  // 2) RECOMPTE APRÈS RÉSERVATION : deux recyclages simultanés de deux
  //    copies différentes du même sujet passeraient chacun le contrôle
  //    « au moins deux ». Il doit en rester au moins une.
  const recount = await readCardsOfPacks(packIds);
  const remaining = recount.ok
    ? recount.value.filter((c) => cardSubjectKey(c) === targetSubject).length
    : null;
  if (remaining === null || remaining < 1) {
    await releaseOwn(db, logger, ref);
    if (remaining === null) {
      logger.error(
        '[tcg/recycle] recompte illisible, recyclage annulé: %s',
        recount.ok ? '?' : recount.error
      );
      throw refuse(500, 'Recyclage impossible.');
    }
    throw refuse(409, ONLY_COPY, 'not_a_duplicate');
  }

  // 3) LE CRÉDIT, unique par source.
  const credit = { tenantId, userId, sourceRef: `${packId}:${position}` };
  const { error: entryError } = await repo.insertRecycleCredit(db, {
    ...credit,
    amount: RECYCLE_REFUND_COINS,
  });
  if (entryError) {
    await settleFailedCredit(ctx, credit, { packId, position }, entryError);
  }

  await refreshBalance(tenantId, userId);
  return { recycled: { packId, position }, refund: RECYCLE_REFUND_COINS };
}

/** Relâche NOTRE marquage ; un échec est journalisé (carte à réparer). */
async function releaseOwn(
  db: AdminDb,
  logger: Logger,
  ref: Parameters<typeof repo.releaseOwnMark>[1]
) {
  const { error } = await repo.releaseOwnMark(db, ref);
  if (error) {
    logger.error(
      '[tcg/recycle] carte %s:%s réservée mais non relâchée: %s',
      ref.packId,
      ref.position,
      error.message
    );
  }
}

/**
 * L'écriture du crédit a répondu une erreur. Trois issues :
 *   * le crédit EST là (erreur après commit, ou doublon de la contrainte
 *     unique) → recyclage confirmé : on REND la main (succès) ;
 *   * la relecture échoue → état indéterminé, marquage CONSERVÉ, 500 ;
 *   * le crédit n'est pas là → marquage relâché, 500.
 */
async function settleFailedCredit(
  ctx: TcgServiceContext,
  credit: { tenantId: string; userId: string; sourceRef: string },
  card: { packId: string; position: number },
  entryError: { message: string }
): Promise<void> {
  const { db, logger } = ctx;
  const { existing, error: recheckError } = await repo.findRecycleCredit(
    db,
    credit
  );
  if (existing) {
    logger.warn(
      '[tcg/recycle] crédit committé malgré une erreur (%s) — recyclage confirmé',
      entryError.message
    );
    return;
  }
  if (recheckError) {
    logger.error(
      '[tcg/recycle] état indéterminé pour %s:%s — marquage CONSERVÉ: %s',
      card.packId,
      card.position,
      recheckError.message
    );
    throw refuse(500, 'Recyclage impossible.');
  }
  logger.error(
    '[tcg/recycle] crédit échoué, marquage relâché: %s',
    entryError.message
  );
  const { error: releaseError } = await repo.releaseMark(db, card);
  if (releaseError) {
    logger.error(
      '[tcg/recycle] carte %s:%s RETIRÉE sans crédit: %s',
      card.packId,
      card.position,
      releaseError.message
    );
  }
  throw refuse(500, 'Recyclage impossible.');
}
