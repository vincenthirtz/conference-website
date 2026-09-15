// Contrat de /api/bot/v1/matches/[matchId]/drafts — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/drafts`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

// gameIndex : entier >= 1. z.coerce reproduit le Number(body.gameIndex) inline
// (accepte "2" comme 2). fearless : booléen optionnel ; un non-booléen est
// ignoré (catch(undefined)) pour préserver le `typeof === 'boolean' ? v : undefined`
// historique qui ne rejetait jamais.
export const draftsBodySchema = z.object({
  gameIndex: z.coerce
    .number()
    .int('gameIndex doit être un entier positif.')
    .min(1, 'gameIndex doit être un entier positif.'),
  fearless: z.boolean().optional().catch(undefined),
});
