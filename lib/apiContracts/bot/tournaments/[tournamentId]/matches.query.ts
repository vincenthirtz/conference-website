// Paramètres de /api/bot/v1/tournaments/[tournamentId]/matches (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.tournaments/[tournamentId]/matches.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// Le body (single { match } | batch { matches }) garde sa validation inline :
// elle produit des erreurs indexées par élément (`match[i]: ...`) que ni un
// z.union ni un z.discriminatedUnion ne reproduiraient à l'identique. On ne
// migre donc que la query du path param ici.
export const matchesQuerySchema = z.object({ tournamentId: uuidSchema });
