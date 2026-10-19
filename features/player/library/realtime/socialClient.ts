// features/player/library/realtime/socialClient.ts — appels typés des routes
// « multijoueur et sécurité de base » de la Library (lot 5) : entrer dans une
// salle, bloquer, signaler, expulser. Les URLs vivent ici ; `ui/` ne touche
// pas le réseau.
//
// Routes « soi seulement » (`subject: 'self'`) : aucune portée `?as=`.
// Une erreur HTTP lève `PlayerHttpError` (`code` stable, `payload` complet) :
// `room_kicked` porte `until`, `room_forbidden` ne dit pas pourquoi.
//
// TOUTE DÉCISION DE MODÉRATION PASSE PAR ICI : l'API identifie l'appelante
// par sa session et vérifie la cible en base. Un `userId` lu dans la présence
// d'une autre n'est qu'un identifiant à soumettre, jamais une preuve.

import { playerRequest } from '@/utils/player/playerHttp';
import type { LibraryKickInput, LibraryReportInput } from '../socialSchemas';
import type {
  LibraryBlockResponse,
  LibraryBlocksResponse,
  LibraryEnterResponse,
  LibraryKickResponse,
  LibraryReportResponse,
} from '../socialResponses';

export const librarySocialUrls = {
  enter: (roomId: string) =>
    `/api/player/library/rooms/${encodeURIComponent(roomId)}/enter`,
  blocks: '/api/player/library/blocks',
  reports: '/api/player/library/reports',
  kick: '/api/player/library/apartment/kick',
} as const;

export const librarySocialClient = {
  /** 403 `room_kicked` (`until`) / `room_forbidden` ; 404 `room_not_found`. */
  enter: (roomId: string) =>
    playerRequest<LibraryEnterResponse>(librarySocialUrls.enter(roomId), {
      method: 'POST',
    }),
  blocks: () => playerRequest<LibraryBlocksResponse>(librarySocialUrls.blocks),
  block: (userId: string) =>
    playerRequest<LibraryBlockResponse>(librarySocialUrls.blocks, {
      method: 'POST',
      json: { userId },
      idempotent: true,
    }),
  unblock: (userId: string) =>
    playerRequest<LibraryBlockResponse>(
      `${librarySocialUrls.blocks}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE', idempotent: true }
    ),
  report: (input: LibraryReportInput) =>
    playerRequest<LibraryReportResponse>(librarySocialUrls.reports, {
      method: 'POST',
      json: input,
      idempotent: true,
    }),
  kick: (input: LibraryKickInput) =>
    playerRequest<LibraryKickResponse>(librarySocialUrls.kick, {
      method: 'POST',
      json: input,
      idempotent: true,
    }),
};

export type LibrarySocialClient = typeof librarySocialClient;
