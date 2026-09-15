// Paramètres de /api/bot/v1/teams/[teamId] (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.teams/[teamId].query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

// querySchema seulement : teamId est un id-OU-slug (pas un UUID strict) et le
// body PATCH a une sémantique trop riche pour un schéma zod sans changer le
// contrat (clés alias shortName/short_name & isJoinable/is_joinable, null/'' =
// clear, website nettoyé via sanitizeUrl puis stocké, message 400 par champ,
// règle "au moins un champ"). On garde donc la validation inline du body et on
// n'ajoute qu'un querySchema. actorDiscordUserId reste lu via requireBotPlayer/
// requireBotStaff (body brut).
export const teamQuerySchema = z.object({
  teamId: z.string().optional(),
  includeMembers: z.string().optional(),
});
