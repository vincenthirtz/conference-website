// features/admin/lobbies/schemas.ts — entrées des routes staff des lobbies FFA
// (`/api/admin/lobbies/**`).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import { looseBody, uuidPathParam } from '../../../utils/admin/pathParams';
import { z } from 'zod';

/** `[lobbyId]` : absent ou mal formé → 400 `Invalid lobbyId` (message d'origine). */
export const LobbyIdQuery = z.object({
  lobbyId: uuidPathParam('Invalid lobbyId'),
});

/**
 * Corps du PUT des placements : `{ entries: { team_id, placement, score? }[],
 * status? }`. Champs NOMMÉS pour la spec ; la validation entrée par entrée
 * (messages d'origine, dans l'ordre) est faite par le service.
 */
export const PlacementsDoc = looseBody(['entries', 'status']);
