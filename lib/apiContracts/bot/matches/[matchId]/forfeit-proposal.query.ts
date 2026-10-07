// Paramètres de /api/bot/v1/matches/[matchId]/forfeit-proposal/{confirm,decline}.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/forfeit-proposal.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import * as z from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const forfeitProposalQuerySchema = z.object({ matchId: uuidSchema });
