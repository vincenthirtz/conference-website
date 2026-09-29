// features/player/tcg/service/forge.ts — LA FORGE : trois doublons d'une même
// rareté, plus des pièces GAGNÉES, contre une carte de joueuse d'une rareté
// supérieure qu'on ne possède pas (lot P14, extrait tel quel de
// pages/api/player/tcg/forge.ts : mêmes contrôles, mêmes refus, 201).
//
// TOUTES LES ÉCRITURES SONT DANS UNE TRANSACTION (`tcg_forge_card`) : retirer
// trois cartes, débiter, créer un paquet, y poser la carte — tout ou rien. Le
// module pur (`planForge`) rend un refus UTILE ; la transaction GARANTIT
// l'invariant (une autre requête a pu consommer la même carte entre-temps).
//
// LA FORGE REND UNE CARTE DE JOUEUSE, ET SEULEMENT ÇA (maps et mascottes ont
// une rareté fixe). LE TIRAGE EXCLUT CE QU'ON POSSÈDE DÉJÀ.
//
// ERREUR DE LECTURE ≠ SOLDE 0 : un registre illisible répond 500 (`Solde
// illisible.`), jamais un refus « solde insuffisant ».

import type { Logger } from '@/utils/logger';
import { planForge, type ForgeCandidate } from '@/utils/tcg/forge';
import { cardRarity, type TcgRarity } from '@/utils/tcg/rarity';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';
import {
  readCardsOfPacks,
  readOpenedPackIds,
} from '@/utils/tcg/readOwnedCards';
import { readDrawPool } from '@/utils/tcg/readDrawPool';
import { readPlayerBadges } from '@/utils/rating/readPlayerBadges';
import * as repo from '../repository/core';
import { ForgeBody } from '../schemas';
import { parseOrRefuse, refuse } from './errors';
import type { TcgServiceContext } from './context';

/** Réponse 201 de la forge. */
export type ForgeResult = {
  packId: string;
  userId: string;
  rarity: TcgRarity;
  balance: number;
};

export async function forgeCard(
  ctx: TcgServiceContext,
  rawBody: unknown
): Promise<ForgeResult> {
  const { db, tenantId, userId, logger } = ctx;
  const selection = parseOrRefuse(ForgeBody, rawBody, {
    message: 'Cartes à forger attendues.',
    code: 'invalid_body',
  }).cards;

  const packsRead = await readOpenedPackIds(tenantId, userId);
  if (!packsRead.ok) {
    logger.error('[tcg/forge] paquets illisibles: %s', packsRead.error);
    throw refuse(500, 'Lecture impossible.');
  }
  const cardsRead = await readCardsOfPacks(packsRead.value);
  if (!cardsRead.ok) {
    logger.error('[tcg/forge] cartes illisibles: %s', cardsRead.error);
    throw refuse(500, 'Lecture impossible.');
  }

  const owned: ForgeCandidate[] = [];
  for (const row of cardsRead.value) {
    const subjectKey = cardSubjectKey(row);
    if (!subjectKey) continue;
    owned.push({
      packId: row.pack_id,
      position: row.position,
      rarity: row.rarity,
      subjectKey,
      recycled: false,
    });
  }

  // Le solde, lu au REGISTRE : c'est lui qui fait foi, pas son cache.
  const ledger = await repo.readLedgerAmounts(db, { tenantId, userId });
  if (ledger.error) {
    logger.error('[tcg/forge] solde illisible: %s', ledger.error.message);
    throw refuse(500, 'Solde illisible.');
  }
  const balance = ledger.amounts.reduce((sum, a) => sum + a, 0);

  const plan = planForge({ selection, owned, balance });
  if (!plan.ok) {
    throw refuse(409, refusalMessage(plan.reason), plan.reason);
  }

  const target = await pickForgedPlayer({
    logger,
    tenantId,
    targetRarity: plan.targetRarity,
    ownedSubjectKeys: new Set(
      owned.filter((c) => !c.recycled).map((c) => c.subjectKey)
    ),
  });
  if (!target) {
    throw refuse(
      409,
      'Aucune carte de cette rareté ne te manque pour l’instant.',
      'pool_exhausted'
    );
  }

  const { result, error } = await repo.forgeCardRpc(db, {
    tenantId,
    userId,
    cards: plan.consume.map((c) => ({
      packId: c.packId,
      position: c.position,
    })),
    fee: plan.feeCoins,
    rarity: plan.targetRarity,
    targetUserId: target,
  });
  if (error) {
    const known = knownFailure(error.message);
    if (known) throw refuse(409, known.message, known.code);
    logger.error('[tcg/forge] transaction refusée: %s', error.message);
    throw refuse(500, 'Forge impossible.');
  }
  if (!result.packId) {
    logger.error('[tcg/forge] transaction sans paquet rendu');
    throw refuse(500, 'Forge impossible.');
  }

  return {
    packId: result.packId,
    userId: target,
    rarity: plan.targetRarity,
    balance: result.balance ?? balance - plan.feeCoins,
  };
}

/**
 * Une joueuse du vivier, de la rareté visée, absente de la collection.
 *
 * Tirage UNIFORME parmi les candidates : à ce stade la rareté est déjà fixée
 * par la forge, et pondérer davantage reviendrait à reprendre d'une main la
 * certitude qu'on vend de l'autre.
 */
async function pickForgedPlayer(input: {
  logger: Logger;
  tenantId: string;
  targetRarity: TcgRarity;
  ownedSubjectKeys: ReadonlySet<string>;
}): Promise<string | null> {
  const pool = await readDrawPool(input.tenantId);
  if (!pool.ok) {
    input.logger.error('[tcg/forge] vivier illisible: %s', pool.error);
    return null;
  }
  const candidates = pool.value.playerIds.filter(
    (id) => !input.ownedSubjectKeys.has(id)
  );
  if (candidates.length === 0) return null;

  // `readPlayerBadges` LÈVE sur erreur : ici, sans badges, on ne peut pas
  // distinguer les raretés, donc on ne forge pas — plutôt que de rendre une
  // `common` à quelqu'un qui vient de payer pour mieux.
  let badges: Map<string, unknown[]>;
  try {
    badges = (await readPlayerBadges(input.tenantId, candidates)) as Map<
      string,
      unknown[]
    >;
  } catch (err) {
    input.logger.error(
      '[tcg/forge] badges illisibles: %s',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }

  const matching = candidates.filter(
    (id) =>
      cardRarity((badges.get(id) ?? []) as Parameters<typeof cardRarity>[0]) ===
      input.targetRarity
  );
  if (matching.length === 0) return null;
  return matching[Math.floor(Math.random() * matching.length)] ?? null;
}

function refusalMessage(reason: string): string {
  switch (reason) {
    case 'not_enough':
      return 'Il faut trois doublons différents.';
    case 'mixed_rarity':
      return 'Les trois cartes doivent être de la même rareté.';
    case 'top_rarity':
      return 'Il n’y a rien au-dessus de légendaire.';
    case 'not_a_duplicate':
      return 'Une de ces cartes est ton seul exemplaire.';
    case 'insufficient_funds':
      return 'Solde insuffisant.';
    default:
      return 'Forge impossible.';
  }
}

/**
 * Les refus que la transaction lève elle-même.
 *
 * Ils DOUBLENT les contrôles du module pur, et c'est voulu : entre la lecture
 * et l'écriture, une autre requête a pu consommer la même carte. Le premier
 * jeu de contrôles rend un message utile, le second garantit l'invariant.
 */
function knownFailure(
  message: string
): { code: string; message: string } | null {
  if (message.includes('forge_cards_unavailable')) {
    return {
      code: 'already_used',
      message: 'Une de ces cartes vient d’être utilisée ailleurs.',
    };
  }
  if (message.includes('forge_would_empty_subject')) {
    return {
      code: 'not_a_duplicate',
      message: 'Une de ces cartes est ton seul exemplaire.',
    };
  }
  if (message.includes('forge_insufficient_funds')) {
    return { code: 'insufficient_funds', message: 'Solde insuffisant.' };
  }
  return null;
}
