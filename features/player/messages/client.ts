// features/player/messages/client.ts — appels typés de la messagerie entre
// capitaines (lot P15).
//
// Portée : l'ÉQUIPE active seulement (`?teamId=`). Jamais de `?as=` : l'écran
// n'est pas rendu en inspection, et le fil (`subject: 'self'`) le refuserait.
// 401 → reconnexion qui RAMÈNE sur la page (conversation ouverte comprise),
// comportement par défaut de `playerRequest`.

import { playerRequest, SELF_SCOPE } from '@/utils/player/playerHttp';
import type {
  ConversationDetail,
  ConversationsResponse,
  MarkReadResponse,
  SendMessageInput,
  SendMessageResponse,
} from './schemas';

export const messagesUrls = {
  inbox: '/api/player/messages',
  conversation: (id: string) =>
    `/api/player/messages/${encodeURIComponent(id)}`,
};

/** Équipe proposée comme destinataire (annuaire public /api/teams). */
export type RecipientTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
};

const teamScope = (teamId: string | null) => ({ ...SELF_SCOPE, teamId });

export const messagesClient = {
  inbox: (teamId: string | null) =>
    playerRequest<ConversationsResponse>(messagesUrls.inbox, {
      scope: teamScope(teamId),
    }),
  conversation: (teamId: string | null, id: string) =>
    playerRequest<ConversationDetail>(messagesUrls.conversation(id), {
      scope: teamScope(teamId),
    }),
  markRead: (teamId: string | null, id: string) =>
    playerRequest<MarkReadResponse>(messagesUrls.conversation(id), {
      method: 'PATCH',
      scope: teamScope(teamId),
    }),
  send: (teamId: string | null, body: SendMessageInput) =>
    playerRequest<SendMessageResponse>(messagesUrls.inbox, {
      method: 'POST',
      json: body,
      scope: teamScope(teamId),
      idempotent: true,
    }),
  /** Annuaire PUBLIC des équipes (sans session) : 50 au plus. */
  recipientTeams: async (search: string): Promise<RecipientTeam[]> => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    params.set('limit', '50');
    const res = await fetch(`/api/teams?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { teams?: RecipientTeam[] };
    return data.teams || [];
  },
};
