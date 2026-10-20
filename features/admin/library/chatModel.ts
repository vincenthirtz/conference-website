// features/admin/library/chatModel.ts — réponses de la modération du chat de
// la Women's Library (`/api/admin/library/messages`, `…/messages/hide`,
// `…/mutes`, `…/chat-settings` ; lot 6 de docs/PLAN-womens-library.md,
// conference-website), lues par l'onglet « Library » du hub de modération
// (copie synchronisée). Types PURS.

/** Un message, tel que le staff le voit : masqué compris, avec sa salle. */
export type AdminLibraryChatMessage = {
  id: string;
  roomId: string;
  /** `hall` | `team_hq` | `apartment` (`reading_room` : jamais de message). */
  roomKind: string;
  /** Nom choisi de la salle, sinon `null`. */
  roomName: string | null;
  /** Appartement : le pseudo de sa propriétaire, sinon `null`. */
  roomOwnerNickname: string | null;
  userId: string;
  /** `null` si son avatar n'existe plus. */
  nickname: string | null;
  body: string;
  createdAt: string;
  /** Masqué (par le staff, une capitaine, une manager) ; sinon `null`. */
  hiddenAt: string | null;
};

/** GET /api/admin/library/messages. */
export type AdminLibraryChatMessagesResponse = {
  items: AdminLibraryChatMessage[];
  /** À repasser en `cursor` pour la page suivante ; `null` = fin. */
  nextCursor: string | null;
  /** L'interrupteur de l'espace (rappel : fermé, personne n'écrit). */
  chatEnabled: boolean;
};

/** POST /api/admin/library/messages/hide. */
export type AdminLibraryChatHideResponse = {
  id: string;
  hidden: true;
  /** Il l'était déjà : rien n'a changé, rien n'a été diffusé. */
  alreadyHidden: boolean;
};

/** Une sourdine. */
export type AdminLibraryMuteItem = {
  id: string;
  userId: string;
  nickname: string | null;
  /** `null` = toute la Library. */
  roomId: string | null;
  roomKind: string | null;
  until: string;
  reason: string | null;
  createdAt: string;
  /** Compte (staff ou propriétaire) qui l'a posée ; `null` s'il est parti. */
  byUserId: string | null;
};

/** GET /api/admin/library/mutes — sourdines EN COURS. */
export type AdminLibraryMuteListResponse = { items: AdminLibraryMuteItem[] };

/** POST /api/admin/library/mutes (201). */
export type AdminLibraryMuteCreateResponse = { mute: AdminLibraryMuteItem };

/** DELETE /api/admin/library/mutes?id=. */
export type AdminLibraryMuteLiftResponse = { id: string; lifted: boolean };

/** GET / PUT /api/admin/library/chat-settings. */
export type LibraryChatSettingsResponse = { enabled: boolean };

/** Codes des refus que le panneau traduit. */
export const LIBRARY_CHAT_ADMIN_CODES = {
  playerNotFound: 'player_not_found',
  roomNotFound: 'room_not_found',
  messageNotFound: 'message_not_found',
  /** Pas de sourdine « dans » la Grande salle de lecture : on n'y écrit pas. */
  silentRoom: 'chat_silent_room',
} as const;
