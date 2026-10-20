// features/admin/library/chatClient.ts — appels typés de la modération du chat
// de la Women's Library, onglet « Library » de /admin/moderation (lot 6 de
// docs/PLAN-womens-library.md).
//
//   GET    /api/admin/library/messages?roomId=&cursor=&limit= → { items, nextCursor, chatEnabled }
//   POST   /api/admin/library/messages/hide                    → { id, hidden, alreadyHidden }
//   GET    /api/admin/library/mutes                            → { items }
//   POST   /api/admin/library/mutes                            → 201 { mute }
//   DELETE /api/admin/library/mutes?id=                        → { id, lifted }
//   GET    /api/admin/library/chat-settings                    → { enabled }
//   PUT    /api/admin/library/chat-settings                    → { enabled }
//
// Routes gardées `moderate_support` côté conference-api. Ce fichier est PROPRE
// au site : `chatModel.ts` et `chatSchemas.ts`, à côté, sont des copies
// synchronisées (`.api-sync-manifest.json`) qu'on n'édite pas ici.

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  AdminLibraryChatHideResponse,
  AdminLibraryChatMessagesResponse,
  AdminLibraryMuteCreateResponse,
  AdminLibraryMuteLiftResponse,
  AdminLibraryMuteListResponse,
  LibraryChatSettingsResponse,
} from './chatModel';
import type { LibraryChatAdminMuteInput } from './chatSchemas';

const BASE = '/api/admin/library';

export type LibraryChatMessagesQuery = {
  roomId?: string;
  cursor?: string;
  limit?: number;
};

function messagesUrl(q: LibraryChatMessagesQuery): string {
  const params = new URLSearchParams();
  if (q.roomId) params.set('roomId', q.roomId);
  if (q.cursor) params.set('cursor', q.cursor);
  if (q.limit) params.set('limit', String(q.limit));
  const qs = params.toString();
  return `${BASE}/messages${qs ? `?${qs}` : ''}`;
}

export const libraryChatAdminClient = {
  /** Messages récents (masqués compris), du plus récent au plus ancien. */
  messages: (q: LibraryChatMessagesQuery = {}) =>
    adminRequest<AdminLibraryChatMessagesResponse>(messagesUrl(q)),
  hide: (messageId: string) =>
    adminRequest<AdminLibraryChatHideResponse>(`${BASE}/messages/hide`, {
      method: 'POST',
      json: { messageId },
      idempotent: true,
    }),
  /** Sourdines EN COURS. */
  mutes: () => adminRequest<AdminLibraryMuteListResponse>(`${BASE}/mutes`),
  mute: (body: LibraryChatAdminMuteInput) =>
    adminRequest<AdminLibraryMuteCreateResponse>(`${BASE}/mutes`, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  lift: (id: string) =>
    adminRequest<AdminLibraryMuteLiftResponse>(
      `${BASE}/mutes?id=${encodeURIComponent(id)}`,
      { method: 'DELETE', idempotent: true }
    ),
  settings: () =>
    adminRequest<LibraryChatSettingsResponse>(`${BASE}/chat-settings`),
  setEnabled: (enabled: boolean) =>
    adminRequest<LibraryChatSettingsResponse>(`${BASE}/chat-settings`, {
      method: 'PUT',
      json: { enabled },
      idempotent: true,
    }),
};
