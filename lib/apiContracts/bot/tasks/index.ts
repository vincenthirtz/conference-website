// Contrat de POST /api/bot/v1/tasks — création de carte Kanban depuis Discord.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tasks/index`).
//
// Même corps que la route admin (`createTaskBodySchema`, partagé), plus
// l'acteur Discord : c'est lui que `requireBotStaff` résout en staff, et la
// sous-limite `perActor` se clé dessus. Le déclarer ici le fait valider AVANT
// le handler (400 INVALID_BODY avec `fields`, comme les autres routes bot) au
// lieu d'être lu hors schéma.

import { discordIdSchema } from '../../../../utils/botValidation';
import { createTaskBodySchema } from '../../../../utils/taskBoardSchemas';

export const botCreateTaskBodySchema = createTaskBodySchema.extend({
  actorDiscordUserId: discordIdSchema.meta({
    description:
      'Compte Discord de la personne qui agit ; doit être lié à un staff admin ou owner.',
  }),
});
