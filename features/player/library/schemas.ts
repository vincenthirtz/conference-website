// features/player/library/schemas.ts — corps des routes de la Women's Library
// (lot 2 de docs/PLAN-womens-library.md, conference-website).
//
// Zod seul. Importé par les routes (`./routes/*`), par le registre OpenAPI
// (lib/apiContracts/player/features.ts, comparaison par IDENTITÉ d'objet) et,
// demain, par le client du site.
//
// LA FORME ICI, LES RÈGLES DANS LE SERVICE. Un pseudo de 3 à 20 caractères, en
// alphabet latin, hors liste de refus ; une clé de meuble du catalogue ; un
// avatar de la liste : ces règles rendent chacune un `code` stable que
// l'interface traduit (`nickname_invalid`, `unknown_furniture`…). Les répéter
// ici ferait répondre `validation` à la place, pour la même faute.

import * as z from 'zod';
import { looseUuid } from '../_shared/zod';

/**
 * POST /api/player/library/attest-adult — « j'ai 18 ans ou plus ». La case
 * cochée est ENVOYÉE : une attestation ne part pas d'un appel sans corps.
 */
export const AttestAdultBody = z.object({
  adult: z.literal(true, {
    error: 'Coche « j’ai 18 ans ou plus » pour entrer.',
  }),
});
export type AttestAdultInput = z.infer<typeof AttestAdultBody>;

/**
 * POST /api/player/library/furniture/buy — la clé du meuble. Le PRIX vient du
 * catalogue (`config/library/furniture.ts`), jamais du client.
 */
export const BuyFurnitureBody = z.object({
  key: z
    .string({ error: 'Meuble invalide.' })
    .min(1, { error: 'Meuble invalide.' })
    .max(64, { error: 'Meuble invalide.' }),
});
export type BuyFurnitureInput = z.infer<typeof BuyFurnitureBody>;

/** PUT /api/player/library/avatar — l'un des deux au moins. */
export const UpdateAvatarBody = z.object({
  nickname: z.string({ error: 'Pseudo invalide.' }).max(64).optional(),
  avatarId: z.string({ error: 'Avatar invalide.' }).max(16).optional(),
});
export type UpdateAvatarInput = z.infer<typeof UpdateAvatarBody>;

/* ------------------------------------------- Mon appartement (lot 4) --- */

/**
 * Meubles posés au plus par enregistrement : un appartement de 14 × 12 cases
 * n'en tient pas autant, même en comptant les tapis et les cadres.
 */
export const LIBRARY_ROOM_ITEMS_MAX = 300;

/**
 * Bornes de FORME d'une coordonnée. Les bornes de la SALLE (une case hors de
 * l'appartement) sont une règle du service : elles rendent `out_of_bounds`
 * meuble par meuble, pas un `validation` global.
 */
const COORD = z
  .number({ error: 'Position invalide.' })
  .int({ error: 'Position invalide.' })
  .min(-1000, { error: 'Position invalide.' })
  .max(1000, { error: 'Position invalide.' });

const ApartmentItemBody = z.object({
  inventoryId: looseUuid('Meuble invalide.'),
  gx: COORD,
  gy: COORD,
  rotation: z
    .number({ error: 'Rotation invalide.' })
    .int({ error: 'Rotation invalide.' })
    .min(0, { error: 'Rotation invalide.' })
    .max(3, { error: 'Rotation invalide.' }),
});

/**
 * PUT /api/player/library/apartment/items — l'ÉTAT COMPLET des meubles posés
 * (un meuble absent est rangé) et la `version` lue avec lui.
 */
export const SaveApartmentItemsBody = z.object({
  version: z
    .number({ error: 'Version invalide.' })
    .int({ error: 'Version invalide.' })
    .min(0, { error: 'Version invalide.' }),
  items: z
    .array(ApartmentItemBody, { error: 'Liste de meubles invalide.' })
    .max(LIBRARY_ROOM_ITEMS_MAX, { error: 'Trop de meubles.' }),
});
export type SaveApartmentItemsInput = z.infer<typeof SaveApartmentItemsBody>;

/**
 * PATCH /api/player/library/apartment — nom, accès, liste du hall, décor. Un
 * champ absent ne change pas ; `name: null` rend le nom par défaut. Le nom
 * (2 à 40 caractères, liste de refus) et le décor (liste en code) sont des
 * règles du service.
 */
export const UpdateApartmentBody = z.object({
  name: z.string({ error: 'Nom invalide.' }).max(120).nullable().optional(),
  access: z.enum(['private', 'open'], { error: 'Accès invalide.' }).optional(),
  listed: z.boolean({ error: 'Valeur invalide.' }).optional(),
  decor: z
    .object({
      floor: z.string({ error: 'Sol invalide.' }).max(32).optional(),
      wall: z.string({ error: 'Murs invalides.' }).max(32).optional(),
    })
    .optional(),
});
export type UpdateApartmentInput = z.infer<typeof UpdateApartmentBody>;
