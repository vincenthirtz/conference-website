// features/player/profile/schemas.ts — profil de la joueuse (lot P4).
// Zod seul : importé par la route en chemin RELATIF (non migrée), par le
// registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';
import { stringOrIgnored } from '../_shared/zod';
import {
  HERO_PREFERENCE_SLOTS,
  isOverwatchHero,
} from '../../../utils/heroes/overwatch';

/**
 * Corps de POST /api/player/update-profile. Seules les clés PRÉSENTES sont
 * appliquées ; une valeur non textuelle de `display_name`, `battle_tag` ou
 * `avatar_url` est ignorée (historique). Le format du BattleTag, le SR, le
 * poste, la chaîne Twitch (et `clear_twitch`) et l'hébergeur d'avatar sont
 * vérifiés par la route, avec leurs messages et codes.
 */
export const UpdatePlayerProfileBody = z.object({
  display_name: stringOrIgnored(
    z
      .string()
      .trim()
      .max(50, 'Le nom affiche ne peut pas depasser 50 caracteres.')
  ),
  battle_tag: stringOrIgnored(z.string()),
  avatar_url: stringOrIgnored(z.string()),
  skill_rating: z.unknown().optional(),
  specialty: z.unknown().optional(),
  twitch: z.unknown().optional(),
  clear_twitch: z.unknown().optional(),
});
export type UpdatePlayerProfileInput = z.infer<typeof UpdatePlayerProfileBody>;

/**
 * Une liste de héros : bornée, sans doublon, et ne contenant que des héros qui
 * existent. `refine` plutôt qu'un `Set` en aval — un message d'erreur ciblé vaut
 * mieux qu'un rejet global qui ne dit pas laquelle des deux listes fautait.
 */
const heroList = z
  .array(z.string().trim().min(1).max(64))
  .max(HERO_PREFERENCE_SLOTS)
  .default([])
  .refine((list) => new Set(list).size === list.length, {
    message: 'Doublon dans la liste.',
  })
  .refine((list) => list.every(isOverwatchHero), {
    message: 'Héros inconnu.',
  });

/**
 * Corps de PUT /api/player/hero-preferences (les DEUX listes d'un bloc). La
 * route et la carte « Mes héros » (lot P6, `.pipe()` du formulaire) partagent
 * ce schéma : mêmes règles, mêmes messages, même champ (`bans`) en faute.
 */
export const HeroPreferencesBody = z
  .object({ picks: heroList, bans: heroList })
  // La base porte déjà cette règle, mais un 400 explicite vaut mieux qu'un 500
  // sur violation de contrainte : la joueuse doit savoir CE qui ne va pas.
  .refine((d) => !d.picks.some((p) => d.bans.includes(p)), {
    message: 'Un héros ne peut pas être à la fois préféré et banni.',
    path: ['bans'],
  });
export type HeroPreferencesInput = z.infer<typeof HeroPreferencesBody>;

/**
 * Formulaire de la carte « Mes héros » : ses valeurs SONT le corps (deux
 * listes), le `.pipe()` applique les règles de la route avant l'envoi.
 */
export const HeroPreferencesForm = z
  .object({
    // `optional` côté formulaire pour s'aligner sur l'entrée du corps
    // (`default([])`) — la carte envoie toujours les deux listes.
    picks: z.array(z.string()).optional(),
    bans: z.array(z.string()).optional(),
  })
  .pipe(HeroPreferencesBody);
