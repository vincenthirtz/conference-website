// features/player/library/teamHqSchemas.ts — corps et paramètres des routes
// « QG d'équipe » de la Women's Library (lot 9 de docs/PLAN-womens-library.md,
// conference-website) : ouvrir le QG d'une équipe, prêter un meuble, le
// reprendre.
//
// Zod seul (copie synchronisée vers le site). À part de `./schemas.ts` et de
// `./socialSchemas.ts` : un lot, un fichier, pas d'édition croisée.
//
// LA FORME ICI, LES RÈGLES DANS LE SERVICE : « une position à moitié donnée »,
// « un meuble d'une autre », « hors de la salle » rendent un `code` stable que
// l'interface traduit (`invalid_body`, `placement_invalid`…).

import * as z from 'zod';
import { looseUuid } from '../_shared/zod';

const ROOM_ID = looseUuid('Salle invalide.');
const INVENTORY_ID = looseUuid('Meuble invalide.');

/**
 * Bornes de FORME d'une coordonnée (comme l'appartement) : les bornes de la
 * SALLE sont une règle du service (`out_of_bounds`).
 */
const COORD = z
  .number({ error: 'Position invalide.' })
  .int({ error: 'Position invalide.' })
  .min(-1000, { error: 'Position invalide.' })
  .max(1000, { error: 'Position invalide.' });

const ROTATION = z
  .number({ error: 'Rotation invalide.' })
  .int({ error: 'Rotation invalide.' })
  .min(0, { error: 'Rotation invalide.' })
  .max(3, { error: 'Rotation invalide.' });

/** `POST /api/player/library/team-hq` — ouvrir (et créer au besoin) le QG d'une équipe. */
export const LibraryTeamHqOpenBody = z.object({
  teamId: looseUuid('Équipe invalide.'),
});
export type LibraryTeamHqOpenInput = z.infer<typeof LibraryTeamHqOpenBody>;

/** `GET /api/player/library/team-hq/{roomId}` — le QG visé. */
export const LibraryTeamHqRoomQuery = z.object({ roomId: ROOM_ID });
export type LibraryTeamHqRoomQueryInput = z.infer<
  typeof LibraryTeamHqRoomQuery
>;

/**
 * `PUT /api/player/library/team-hq/{roomId}/items` — prêter un meuble de MON
 * inventaire au QG, ou déplacer un meuble que j'y ai déjà prêté.
 *   - `gx` et `gy` donnés : la case d'origine voulue (coin minimal de
 *     l'empreinte tournée) ;
 *   - `gx` et `gy` absents : l'API choisit la première place libre (avec
 *     `rotation` si elle est donnée, sinon la première qui tient).
 * Une position à moitié donnée est refusée (`invalid_body`).
 */
export const LibraryTeamHqLendBody = z.object({
  inventoryId: INVENTORY_ID,
  gx: COORD.optional(),
  gy: COORD.optional(),
  rotation: ROTATION.optional(),
});
export type LibraryTeamHqLendInput = z.infer<typeof LibraryTeamHqLendBody>;

/**
 * `DELETE /api/player/library/team-hq/{roomId}/items?inventoryId=` — rendre un
 * meuble prêté à sa propriétaire (elle-même, ou la capitaine / une manager de
 * l'équipe).
 */
export const LibraryTeamHqReturnQuery = z.object({
  roomId: ROOM_ID,
  inventoryId: INVENTORY_ID,
});
export type LibraryTeamHqReturnInput = z.infer<typeof LibraryTeamHqReturnQuery>;
