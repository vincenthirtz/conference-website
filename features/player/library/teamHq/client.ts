// features/player/library/teamHq/client.ts — appels typés des routes « QG
// d'équipe » de la Women's Library (lot 9 de docs/PLAN-womens-library.md).
// Les URLs vivent ici ; `ui/` ne touche pas le réseau.
//
// Routes « soi seulement » (`subject: 'self'`) : aucune portée `?as=`.
// Une erreur HTTP lève `PlayerHttpError` (`code` stable, `payload` complet).
//
//   - OUVRIR un QG est un lire-ou-créer : pas d'Idempotency-Key, la rejouer
//     rend la même salle ;
//   - PRÊTER (ou déplacer) envoie la place voulue, ou aucune (l'API choisit
//     la première libre) : pas d'Idempotency-Key, la rejouer repose le meuble
//     au même endroit ;
//   - RENDRE porte une Idempotency-Key : un nouvel essai réseau rend la
//     réponse du premier, pas un 404 `item_not_lent`.

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  LibraryTeamHqLendResponse,
  LibraryTeamHqListResponse,
  LibraryTeamHqOpenResponse,
  LibraryTeamHqReturnResponse,
  LibraryTeamHqSummaryResponse,
} from '../teamHqResponses';
import type { LibraryTeamHqLendInput } from '../teamHqSchemas';

const BASE = '/api/player/library/team-hq';

export const teamHqUrls = {
  list: BASE,
  summary: (roomId: string) => `${BASE}/${encodeURIComponent(roomId)}`,
  items: (roomId: string) => `${BASE}/${encodeURIComponent(roomId)}/items`,
} as const;

export const teamHqClient = {
  /** Les QG de mes équipes (créés ou non), mes meubles prêtés. */
  list: () => playerRequest<LibraryTeamHqListResponse>(teamHqUrls.list),
  /** 403 `room_forbidden`, 404 `team_not_found`. */
  open: (teamId: string) =>
    playerRequest<LibraryTeamHqOpenResponse>(teamHqUrls.list, {
      method: 'POST',
      json: { teamId },
    }),
  /** 403 `room_forbidden`, 404 `room_not_found`. */
  summary: (roomId: string) =>
    playerRequest<LibraryTeamHqSummaryResponse>(teamHqUrls.summary(roomId)),
  /** 400 `placement_invalid` (`issues`), 409 `item_placed_elsewhere`… */
  lend: (roomId: string, input: LibraryTeamHqLendInput) =>
    playerRequest<LibraryTeamHqLendResponse>(teamHqUrls.items(roomId), {
      method: 'PUT',
      json: input,
    }),
  /** 403 `return_forbidden`, 404 `item_not_lent`. */
  giveBack: (roomId: string, inventoryId: string) =>
    playerRequest<LibraryTeamHqReturnResponse>(
      `${teamHqUrls.items(roomId)}?inventoryId=${encodeURIComponent(inventoryId)}`,
      { method: 'DELETE', idempotent: true }
    ),
};

export type TeamHqClient = typeof teamHqClient;
