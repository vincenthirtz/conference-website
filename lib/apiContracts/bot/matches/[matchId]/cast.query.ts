// Paramètres de /api/bot/v1/matches/[matchId]/cast (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/cast.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// Multi-méthode aux bodies divergents : POST = { actorDiscordUserId, castMemberId,
// briefingAt? } et DELETE = { actorDiscordUserId, assignmentId? | castMemberId? }
// (au moins un des deux, sémantique « ou exclusif » modélisée par des checks
// inline). Pas de discriminant propre pour un z.union, donc on valide seulement
// la query et on conserve la validation body inline dans handleAssign/handleUnassign.
export const castQuerySchema = z.object({ matchId: uuidSchema });
