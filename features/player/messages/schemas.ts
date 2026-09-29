// features/player/messages/schemas.ts — messagerie entre capitaines (lot P4).
// Zod seul : importé par la route (chemin RELATIF tant qu'elle n'est pas
// migrée — `@/features/player/` marque une route migrée pour la règle 6 de
// playerBoundariesGuard, la matrice de permissions et les contrats), le
// registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';

const EMPTY = 'Le message ne peut pas etre vide.';
const TARGET = 'Equipe cible requise.';

/** Corps de POST /api/player/messages — messages historiques, dans l'ordre. */
export const SendMessageBody = z.object({
  content: z
    .string({ error: EMPTY })
    .trim()
    .min(1, EMPTY)
    .max(2000, 'Message trop long (max 2000 caracteres).'),
  targetTeamId: z.string({ error: TARGET }).trim().min(1, TARGET),
});
export type SendMessageInput = z.infer<typeof SendMessageBody>;

/**
 * Formulaire de rédaction (lot P15) : les valeurs des CHAMPS, puis le corps
 * partagé — mêmes règles et mêmes messages côté client et serveur.
 */
export const ComposeForm = z
  .object({ content: z.string(), targetTeamId: z.string() })
  .pipe(SendMessageBody);

/* ------------------------------------------------------------------ *
 * Réponses (lot P15)
 * ------------------------------------------------------------------ */

/** Ligne `demandes` d'un message entre capitaines. */
export type CaptainMessageRow = {
  id: string;
  user_id: string;
  team_id: string;
  comment: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

/** Une conversation de la boîte de réception (GET /api/player/messages). */
export type ConversationSummary = {
  conversationId: string;
  otherTeamId: string;
  otherTeamName: string;
  /** Le plus récent de la conversation. */
  lastMessage: CaptainMessageRow;
  messageCount: number;
  unreadCount: number;
};

export type ConversationsResponse = { conversations: ConversationSummary[] };

/** Réponse 201 de POST /api/player/messages. */
export type SendMessageResponse = {
  success: true;
  message: Record<string, unknown> | null;
  conversationId: string;
};

export type ConversationMessage = {
  id: string;
  content: string | null;
  senderId: string;
  senderTeamId: unknown;
  senderName: unknown;
  fromTeamName: unknown;
  isRead: boolean;
  createdAt: string;
};

export type ConversationOtherTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

/** GET /api/player/messages/{conversationId}. */
export type ConversationDetail = {
  conversationId: string;
  myTeamId: string;
  otherTeam: ConversationOtherTeam;
  messages: ConversationMessage[];
};

/** PATCH /api/player/messages/{conversationId} — messages entrants lus. */
export type MarkReadResponse = { success: true; markedRead: number };
