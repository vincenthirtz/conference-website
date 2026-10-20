// features/player/library/chat/responses.ts — réponses des routes du chat de
// la Women's Library (lot 6 de docs/PLAN-womens-library.md,
// conference-website), lues par le site (copie synchronisée).
//
// Types et constantes PURS : le site ne tire jamais un `service/` ni un
// `repository/` (apiOwnershipGuard).

/** Un message tel que le fil le montre. Texte BRUT : jamais interprété. */
export type LibraryChatMessage = {
  id: string;
  userId: string;
  /** Pseudo de l'autrice dans la Library. */
  nickname: string;
  /** 200 caractères au plus ; coordonnées déjà masquées (« [•••] »). */
  body: string;
  createdAt: string;
};

/**
 * Le chat d'une salle, pour l'appelante. Rendu par `POST rooms/:id/enter`
 * (champ `chat`) et par `GET rooms/:id/messages`.
 */
export type LibraryChatState = {
  /**
   * Le chat est ouvert ici : interrupteur de l'espace allumé, et pas la
   * Grande salle de lecture (silencieuse). Fermé : seules les emotes.
   */
  enabled: boolean;
  /** Elle peut écrire (ouvert, pas en sourdine, membre au QG). */
  canWrite: boolean;
  /** Elle peut modérer quelque chose ici (`canHide` ou `canMute`). */
  canModerate: boolean;
  /** Masquer un message : staff `moderate_support`, capitaine ou manager au QG. */
  canHide: boolean;
  /** Mettre en sourdine ici : staff `moderate_support`, propriétaire chez elle. */
  canMute: boolean;
  /** Fin de SA sourdine en cours (ici ou partout), sinon `null`. */
  mutedUntil: string | null;
};

/** `GET /api/player/library/rooms/{roomId}/messages`. */
export type LibraryChatListResponse = {
  /** Du plus ancien au plus récent ; sans messages masqués ni bloquées. */
  messages: LibraryChatMessage[];
  chat: LibraryChatState;
};

/** `POST /api/player/library/rooms/{roomId}/messages` (201). */
export type LibraryChatSendResponse = {
  message: LibraryChatMessage;
  /** Une coordonnée (e-mail, téléphone) a été masquée avant l'envoi. */
  masked: boolean;
};

/** `POST …/messages/{messageId}/hide`. */
export type LibraryChatHideResponse = { id: string; hidden: true };

/** `POST /api/player/library/rooms/{roomId}/mutes` (201). */
export type LibraryChatMuteResponse = {
  userId: string;
  /** La salle de la sourdine (ici `roomId` ; `null` = toute la Library). */
  roomId: string | null;
  until: string;
};

/** `POST …/messages/{messageId}/report` (201). */
export type LibraryChatReportResponse = {
  reported: true;
  /** Les 8 premiers caractères du ticket : à citer à l'équipe de modération. */
  referenceShort: string;
};

/** Codes des refus que l'interface traduit. */
export const LIBRARY_CHAT_CODES = {
  /** Interrupteur de l'espace éteint : seules les emotes. */
  chatDisabled: 'chat_disabled',
  /** La Grande salle de lecture est silencieuse. */
  silentRoom: 'chat_silent_room',
  /** Au QG, seules les membres écrivent (le staff lit et modère). */
  readOnly: 'chat_read_only',
  /** En sourdine (`until` rendu). */
  muted: 'chat_muted',
  /** Plus de 5 messages en 10 s (`retryAfterMs` rendu). */
  tooFast: 'chat_too_fast',
  /** Le même message, dans la même salle, il y a moins d'une minute. */
  duplicate: 'chat_duplicate',
  /** Vide une fois nettoyé. */
  empty: 'chat_empty',
  /** Plus de 200 caractères (`max` rendu). */
  tooLong: 'chat_too_long',
  /** Insulte ou injure haineuse : refusé, le mot n'est pas dit. */
  filtered: 'chat_filtered',
  messageNotFound: 'message_not_found',
  /** Masquer / mettre en sourdine sans en avoir le droit ici. */
  moderationForbidden: 'chat_moderation_forbidden',
  cannotMuteSelf: 'cannot_mute_self',
  cannotReportOwn: 'cannot_report_own_message',
  playerNotFound: 'player_not_found',
  reportFailed: 'report_failed',
} as const;
export type LibraryChatCode =
  (typeof LIBRARY_CHAT_CODES)[keyof typeof LIBRARY_CHAT_CODES];

/** Le chat fermé : la Grande salle de lecture, l'interrupteur éteint. */
export const LIBRARY_CHAT_CLOSED: LibraryChatState = {
  enabled: false,
  canWrite: false,
  canModerate: false,
  canHide: false,
  canMute: false,
  mutedUntil: null,
};
