// Contrat de /api/bot/v1/free-players/profile — schéma déplacé hors du handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.free-players/profile`, cf.
// lib/apiContracts/index.ts). Module sans effet de bord : zod et utilitaires
// purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
} from '../../../../utils/botValidation';
import {
  FREE_PLAYER_ROLES,
  FREE_PLAYER_LEVELS,
} from '../../../../utils/freePlayers';

/** Note libre : de quoi préciser un créneau, pas d'écrire une annonce. */
export const NOTE_MAX = 280;
export const AVAILABILITY_MAX = 120;

// Body : { discordUserId, roles?, level?, availability?, note? }.
//
// TOUT EST OPTIONNEL SAUF L'IDENTIFIANT, et c'est délibéré : la saisie se fait
// sur Discord, où l'on répond à une question à la fois (un menu pour les
// postes, un autre pour le niveau). Exiger le tout à chaque appel obligerait le
// bot à retenir les réponses précédentes entre deux interactions — un état
// qu'il n'a pas, et qu'il perdrait au redémarrage. Une mise à jour PARTIELLE
// laisse chaque réponse partir seule sans effacer les autres.
//
// `refine` garde la seule invariante qui compte : un appel qui ne change rien
// n'a pas de raison d'être accepté.
// Le VOCABULAIRE vient de `utils/freePlayers` — le même que le formulaire web
// et que `team_members.specialty`. Le recopier ici ferait diverger les deux
// portes du marché au premier poste ajouté.
export const profileBodySchema = z
  .object({
    discordUserId: discordIdSchema,
    roles: z
      .array(z.enum(FREE_PLAYER_ROLES))
      .max(FREE_PLAYER_ROLES.length)
      .optional(),
    level: z.enum(FREE_PLAYER_LEVELS).optional(),
    availability: boundedString(1, AVAILABILITY_MAX).optional(),
    note: boundedString(1, NOTE_MAX).optional(),
  })
  .refine(
    (v) =>
      v.roles !== undefined ||
      v.level !== undefined ||
      v.availability !== undefined ||
      v.note !== undefined,
    { message: 'Au moins un champ de profil doit être fourni.' }
  );
