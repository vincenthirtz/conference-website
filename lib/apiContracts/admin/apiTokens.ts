// Corps de l'émission d'une clé d'API publique, partagé par
// `POST /api/admin/api-tokens` (espace ACTIF) et
// `POST /api/admin/tenants/{id}/api-tokens` (espace NOMMÉ). Validé par
// `utils/apiTokens/mintTenantApiToken.ts` ; référencé par la spec
// (`x-zod: admin.apiTokens.mint`).

import { z } from 'zod';

export const mintTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).min(1).meta({
    description:
      'Portées `resource:action` (`tournaments`, `matches`, `teams`, `players` × `read`, `write`). Une portée inconnue → 400 `INVALID_SCOPES` (avec `validScopes`).',
  }),
  /**
   * Exemption partenaire : la clé bypasse le gate de plan (accès gratuit).
   * Poser `true` exige le rôle `owner` — un simple admin ne peut pas
   * s'auto-exempter du modèle payant.
   */
  comp: z.boolean().optional().default(false).meta({
    description:
      'Clé partenaire : ni plan ni quota. `true` exige le rôle `owner` (403 `FORBIDDEN_COMP`).',
  }),
  /** Note libre traçant le partenaire / la raison de l'exemption. */
  comp_note: z.string().trim().max(500).optional().meta({
    description: 'Note libre ; ignorée si `comp` n’est pas `true`.',
  }),
  /**
   * Durée de vie optionnelle, en jours. null / absent => pas d'expiration.
   * On accepte des jours (pas un timestamp arbitraire) pour que l'échéance soit
   * toujours calculée serveur, jamais dictée par le client.
   */
  expires_in_days: z
    .number()
    .int()
    .positive()
    .max(3650)
    .nullable()
    .optional()
    .meta({
      description:
        'Durée de vie en jours ; absent ou `null` = sans expiration. Une clé expirée répond 401, comme une clé révoquée.',
    }),
});
