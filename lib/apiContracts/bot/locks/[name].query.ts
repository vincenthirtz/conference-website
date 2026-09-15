// Paramètres de /api/bot/v1/locks/[name] (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.locks/[name].query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { boundedString } from '../../../../utils/botValidation';

export const NAME_MAX_LEN = 64;

// name (path) : string non vide ≤ 64 (trim). holder (body) : string non vide
// ≤ 100 (trim). ttlSeconds / action : sémantique historique PERMISSIVE — pas
// de rejet, `ttlSeconds` est coercé via Number() (défaut 60 si non fini) et
// `action` vaut 'release' seulement si === 'release', sinon 'claim'. On les
// laisse donc en z.unknown() pour ne rejeter aucun type que l'ancien code
// tolérait.
export const lockQuerySchema = z.object({
  name: boundedString(1, NAME_MAX_LEN),
});
