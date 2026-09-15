// Paramètres de /api/bot/v1/matches/[matchId]/resolve-dispute (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/resolve-dispute.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// Body conservé inline : la validation est fortement cross-champs et non
// modélisable proprement en un seul schéma sans changer le comportement —
// `hasScoreOverride` exige team1Score ET team2Score entiers >=0, `forfeitTeamId`
// non-UUID est silencieusement ignoré (jamais 400), `winnerTeamId` "" = absent
// mais non-vide non-UUID = 400, et l'obligation score|forfeit dépend de
// resumeStatus. On valide donc seulement la query ici. actorDiscordUserId reste
// validé par requireBotStaff.
export const resolveDisputeQuerySchema = z.object({ matchId: uuidSchema });
