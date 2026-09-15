// Paramètres de requête de /api/player/discovery/profile — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: player.discovery/profile.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

export const querySchema = z.object({ userId: z.string().uuid() });
