// Paramètres de /api/bot/v1/matches/[matchId]/veto (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/veto.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// Multi-méthode aux bodies divergents : POST = { actorDiscordUserId, mapName,
// action, teamId?, mapType? } avec normalisation (action.toLowerCase(), trims),
// DELETE = { actorDiscordUserId } seul. Un z.union ne discrimine pas proprement
// (pas de champ discriminant) et perdrait la normalisation casse de `action`.
// On valide donc seulement la query ici et on conserve la validation body inline
// dans handlePost/handleDelete. actorDiscordUserId reste validé par requireBotStaff.
export const vetoQuerySchema = z.object({ matchId: uuidSchema });
