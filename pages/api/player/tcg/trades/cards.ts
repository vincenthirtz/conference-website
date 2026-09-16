// pages/api/player/tcg/trades/cards.ts
//
//   GET                  → MES cartes, avec ce que je peux en offrir.
//   GET ?userId=<uuid>   → les DOUBLES échangeables d'une partenaire.
//
// PAR DÉFAUT, ON NE VOIT PAS LA COLLECTION D'UNE AUTRE. Ce qu'une partenaire
// montre se réduit à ses DOUBLES ÉCHANGEABLES — les sujets dont elle a au moins
// deux exemplaires et au moins un issu d'un paquet échangeable. Pas ses cartes
// uniques, pas ses comptes d'exemplaires, pas ses cartes de paquets cadeau.
// C'est le « classeur d'échange » qu'elle expose en activant les échanges, et
// rien de plus :
//   - une demande « à l'aveugle » dans tout le catalogue aurait exigé de lister
//     toutes les joueuses de l'espace (un annuaire, interdit ici) et aurait
//     sondé sa collection proposition après proposition ;
//   - ne demander que des doubles protège aussi la destinataire : on ne lui
//     réclame jamais sa seule carte d'un sujet.
// Réciprocité : l'appelante doit avoir activé les échanges elle aussi.
//
// AUCUNE IMAGE FIGÉE : les faces sont relues par `readCardFaces` (filtre de
// consentement), et la réponse n'est jamais mise en cache.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
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

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-tcg-trade-cards'
    )
  ) {
    return;
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  res.setHeader('Cache-Control', 'private, no-store');

  let targetId: string | null = null;
  if (req.query.userId !== undefined) {
    const parsed = tradeIdSchema.safeParse(req.query.userId);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Identifiant invalide.', code: 'invalid_user_id' });
    }
    targetId = parsed.data === user.id.toLowerCase() ? null : parsed.data;
  }

  if (targetId === null) return myCards(res, tenantId, user.id);

  const [mine, theirs] = await Promise.all([
    readTradeSettings(tenantId, user.id),
    readTradeSettings(tenantId, targetId),
  ]);
  if (!mine.ok || !theirs.ok) {
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!mine.acceptsProposals) {
    return res.status(403).json({
      error: 'Active les échanges pour voir les doubles des autres.',
      code: 'trading_disabled',
    });
  }
  if (!theirs.acceptsProposals) {
    // 404 : n'accepte pas, n'existe pas, ou vit dans un autre espace — la même
    // réponse pour les trois.
    return res
      .status(404)
      .json({ error: 'Partenaire introuvable.', code: 'partner_not_found' });
  }

  const owned = await readOwnedCopies(tenantId, targetId);
  if (!owned.ok) {
    logger.error('[tcg/trades] doubles illisibles: %s', owned.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
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

  return res.status(200).json({
    owner: 'partner',
    displayName: names.get(targetId) ?? null,
    // La rareté montrée est celle de l'exemplaire qui PARTIRAIT (le moins
    // précieux de ses exemplaires échangeables) — pas sa meilleure copie.
    cards: doubles.map((d) =>
      faceOf(
        { kind: d.kind, id: d.subjectId },
        { rarity: d.worstTradeable!.rarity, isFoil: d.worstTradeable!.foil }
      )
    ),
  });
});

async function myCards(res: NextApiResponse, tenantId: string, userId: string) {
  const owned = await readOwnedCopies(tenantId, userId);
  if (!owned.ok) {
    logger.error('[tcg/trades] cartes illisibles: %s', owned.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  // Les exemplaires DÉJÀ promis dans une de mes propositions en attente : ils
  // ne peuvent pas l'être une seconde fois (la fonction SQL le refuse). Lecture
  // partagée avec la collection (`utils/tcg/engagedCards.ts`) ; best-effort,
  // comme avant : illisible, `available` retombe sur les exemplaires
  // échangeables et c'est la fonction SQL qui tranche à la proposition.
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

  return res.status(200).json({
    owner: 'me',
    cards: summaries.map((s) => ({
      ...faceOf(
        { kind: s.kind, id: s.subjectId },
        // La carte qui partirait si je l'offre : mon exemplaire échangeable le
        // moins précieux ; à défaut, ma meilleure rareté pour l'affichage.
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
  });
}
