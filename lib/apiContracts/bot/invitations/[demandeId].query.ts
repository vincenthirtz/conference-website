// Paramètres de /api/bot/v1/invitations/[demandeId] (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.invitations/[demandeId].query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../utils/botValidation';

export const invitationQuerySchema = z.object({ demandeId: uuidSchema });
