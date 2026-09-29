// features/player/profile/schemas.ts — profil de la joueuse (lot P4).
// Zod seul : importé par la route en chemin RELATIF (non migrée), par le
// registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';
import { stringOrIgnored } from '../_shared/zod';

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
