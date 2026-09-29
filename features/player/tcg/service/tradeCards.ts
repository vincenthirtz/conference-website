// features/player/tcg/service/tradeCards.ts — les cartes d'un échange
// (lot P14, extrait de pages/api/player/tcg/trades/cards.ts, même contrat).
//
//   sans `userId` → MES cartes, avec ce que je peux en offrir ;
//   `userId`      → les DOUBLES ÉCHANGEABLES d'une partenaire, et rien de plus
//                   (pas ses cartes uniques, pas ses comptes d'exemplaires).
//
// RÉCIPROCITÉ : l'appelante doit avoir activé les échanges elle aussi. AUCUNE
// IMAGE FIGÉE : faces relues par `readCardFaces` (filtre de consentement).
//
// Les engagements (exemplaires promis ailleurs) sont BEST-EFFORT : illisibles,
// `available` retombe sur les exemplaires échangeables — la fonction SQL de
// proposition revérifie de toute façon.

import { compareCollectionOrder } from '@/utils/tcg/pageCursor';
import { tradeIdSchema } from '@/utils/tcg/tradeRules';
import { readEngagedCopies } from '@/utils/tcg/engagedCards';
import {
  readCollectorNames,
  readOwnedCopies,
  readSubjectFaces,
  readTradeSettings,
  summarizeCopies,
  type CopySummary,
} from '@/utils/tcg/trades';
import { refuse } from './errors';
import type { TcgServiceContext } from './context';

export async function readTradeCards(
  ctx: TcgServiceContext,
  rawUserId: unknown
) {
  const { tenantId, userId, logger } = ctx;
  let targetId: string | null = null;
  if (rawUserId !== undefined) {
    const parsed = tradeIdSchema.safeParse(rawUserId);
    if (!parsed.success) {
      throw refuse(400, 'Identifiant invalide.', 'invalid_user_id');
    }
    targetId = parsed.data === userId.toLowerCase() ? null : parsed.data;
  }

  if (targetId === null) return myCards(ctx);

  const [mine, theirs] = await Promise.all([
    readTradeSettings(tenantId, userId),
    readTradeSettings(tenantId, targetId),
  ]);
  if (!mine.ok || !theirs.ok) throw refuse(500, 'Lecture impossible.');
  if (!mine.acceptsProposals) {
    throw refuse(
      403,
      'Active les échanges pour voir les doubles des autres.',
      'trading_disabled'
    );
  }
  // Même réponse qu'un compte inexistant : on ne dit pas qui refuse.
  if (!theirs.acceptsProposals) {
    throw refuse(404, 'Partenaire introuvable.', 'partner_not_found');
  }

  const owned = await readOwnedCopies(tenantId, targetId);
  if (!owned.ok) {
    logger.error('[tcg/trades] doubles illisibles: %s', owned.error);
    throw refuse(500, 'Lecture impossible.');
  }

  const doubles = [...summarizeCopies(owned.value).values()]
    .filter((s) => s.copies >= 2 && s.worstTradeable !== null)
    .sort((a, b) =>
      compareCollectionOrder(
        { rarity: a.worstTradeable!.rarity, key: a.key },
        { rarity: b.worstTradeable!.rarity, key: b.key }
      )
    );

  const [faceOf, names] = await Promise.all([
    readSubjectFaces(
      tenantId,
      doubles.map((d) => ({ kind: d.kind, id: d.subjectId }))
    ),
    readCollectorNames(tenantId, [targetId]),
  ]);

  return {
    owner: 'partner' as const,
    displayName: names.get(targetId) ?? null,
    cards: doubles.map((d) =>
      faceOf(
        { kind: d.kind, id: d.subjectId },
        { rarity: d.worstTradeable!.rarity, isFoil: d.worstTradeable!.foil }
      )
    ),
  };
}

async function myCards(ctx: TcgServiceContext) {
  const { tenantId, userId, logger } = ctx;
  const owned = await readOwnedCopies(tenantId, userId);
  if (!owned.ok) {
    logger.error('[tcg/trades] cartes illisibles: %s', owned.error);
    throw refuse(500, 'Lecture impossible.');
  }

  const engaged = await readEngagedCopies(tenantId, userId);
  if (!engaged.ok) {
    logger.warn('[tcg/trades] cartes engagées illisibles: %s', engaged.error);
  }
  const engagedBySubject = engaged.bySubject;

  const summaries: CopySummary[] = [
    ...summarizeCopies(owned.value).values(),
  ].sort((a, b) =>
    compareCollectionOrder(
      { rarity: a.bestRarity, key: a.key },
      { rarity: b.bestRarity, key: b.key }
    )
  );

  const faceOf = await readSubjectFaces(
    tenantId,
    summaries.map((s) => ({ kind: s.kind, id: s.subjectId }))
  );

  return {
    owner: 'me' as const,
    cards: summaries.map((s) => ({
      ...faceOf(
        { kind: s.kind, id: s.subjectId },
        s.worstTradeable
          ? { rarity: s.worstTradeable.rarity, isFoil: s.worstTradeable.foil }
          : { rarity: s.bestRarity, isFoil: false }
      ),
      copies: s.copies,
      tradeableCopies: s.tradeableCopies,
      /** Exemplaires échangeables pas encore promis ailleurs. */
      available: Math.max(
        0,
        s.tradeableCopies - (engagedBySubject.get(s.key) ?? 0)
      ),
    })),
  };
}
