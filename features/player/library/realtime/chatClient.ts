// features/player/library/realtime/chatClient.ts — appels typés du chat de la
// Women's Library (lot 6) : lire le fil, écrire, masquer, mettre en sourdine,
// signaler. Les URLs vivent ici ; `ui/` ne touche pas le réseau.
//
// Routes « soi seulement » : aucune portée `?as=`. Une erreur HTTP lève
// `PlayerHttpError` (`code` stable, `payload` complet : `until` d'une
// sourdine, `retryAfterMs` du rythme, `max` de la longueur).
//
// TOUT PASSE PAR L'API : elle identifie l'autrice par sa session, applique
// les droits de la salle, la sourdine, le rythme et le filtre, puis diffuse
// elle-même. Rien n'est écrit de navigateur à navigateur.

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  LibraryChatHideResponse,
  LibraryChatListResponse,
  LibraryChatMuteResponse,
  LibraryChatReportResponse,
  LibraryChatSendResponse,
} from '../chat/responses';
import type {
  LibraryChatMuteInput,
  LibraryChatReportInput,
} from '../chat/schemas';

const room = (roomId: string) =>
  `/api/player/library/rooms/${encodeURIComponent(roomId)}`;

export const libraryChatUrls = {
  messages: (roomId: string) => `${room(roomId)}/messages`,
  hide: (roomId: string, messageId: string) =>
    `${room(roomId)}/messages/${encodeURIComponent(messageId)}/hide`,
  report: (roomId: string, messageId: string) =>
    `${room(roomId)}/messages/${encodeURIComponent(messageId)}/report`,
  mutes: (roomId: string) => `${room(roomId)}/mutes`,
} as const;

export const libraryChatClient = {
  /** Le fil (≈ 50 derniers) et l'état du chat pour moi. */
  list: (roomId: string) =>
    playerRequest<LibraryChatListResponse>(libraryChatUrls.messages(roomId)),
  /** 201 ; refus : `chat_muted`, `chat_too_fast`, `chat_filtered`… */
  send: (roomId: string, body: string) =>
    playerRequest<LibraryChatSendResponse>(libraryChatUrls.messages(roomId), {
      method: 'POST',
      json: { body },
      idempotent: true,
    }),
  hide: (roomId: string, messageId: string) =>
    playerRequest<LibraryChatHideResponse>(
      libraryChatUrls.hide(roomId, messageId),
      { method: 'POST', idempotent: true }
    ),
  mute: (roomId: string, input: LibraryChatMuteInput) =>
    playerRequest<LibraryChatMuteResponse>(libraryChatUrls.mutes(roomId), {
      method: 'POST',
      json: input,
      idempotent: true,
    }),
  report: (roomId: string, messageId: string, input: LibraryChatReportInput) =>
    playerRequest<LibraryChatReportResponse>(
      libraryChatUrls.report(roomId, messageId),
      { method: 'POST', json: input, idempotent: true }
    ),
};

export type LibraryChatClient = typeof libraryChatClient;
