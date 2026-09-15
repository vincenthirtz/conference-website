// Paramètres de requête de /api/admin/tcg/overview — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: admin.tcg/overview.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

/** Sujets les plus distribués rendus par défaut. */
export const DEFAULT_TOP = 10;

// Le seul paramètre accepté. Validé par schéma plutôt que par un `if` : la
// borne haute est ici une garantie, pas une intention — `?top=100000` ne doit
// pas pouvoir dicter la taille de la réponse ni le nombre de faces à résoudre.
export const querySchema = z.object({
  top: z.coerce.number().int().min(1).max(25).default(DEFAULT_TOP),
});
