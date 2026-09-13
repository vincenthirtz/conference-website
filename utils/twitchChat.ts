// utils/twitchChat.ts
//
// Envoyer un message dans le chat d'une chaîne connectée.
//
// POURQUOI CE MODULE EXISTE. L'envoi vivait uniquement dans
// `pages/api/admin/twitch/chat.ts`, derrière une session staff : le webhook de
// drop ne pouvait donc rien dire à une spectatrice, alors que c'est précisément
// le moment où elle a besoin d'une explication — elle vient de dépenser ses
// points et voit son échange annulé sans savoir pourquoi. Extraire l'appel le
// rend utilisable par les deux, sans dupliquer la résolution de jeton ni la
// vérification de scope.
//
// ON NE MENTIONNE JAMAIS PERSONNE. Annoncer publiquement « untel n'a pas
// rattaché son compte » exposerait un échec individuel devant toute la chaîne,
// et transformerait une aide en petite humiliation. Les messages composés
// ici s'adressent au chat en général : celle qui vient de cliquer se
// reconnaîtra, les autres y verront une information utile. C'est aussi
// pourquoi cette fonction ne prend PAS de pseudo en paramètre — la tentation
// serait trop simple.
//
// NE LÈVE JAMAIS. Un message de chat est un confort ; le faire échouer
// remonterait dans un webhook dont l'acquittement conditionne la survie de la
// souscription EventSub. Le pire cas acceptable est le silence.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getValidBroadcasterToken,
  helixFetch,
  hasScope,
} from '@/utils/twitchBroadcaster';
import { logger } from '@/utils/logger';

/** Scope que la chaîne doit avoir accordé pour qu'on puisse écrire. */
export const CHAT_WRITE_SCOPE = 'user:write:chat';

/** Twitch refuse au-delà ; on tronque plutôt que de faire rejeter l'envoi. */
const MAX_MESSAGE = 500;

export type ChatSendResult =
  | { sent: true }
  | { sent: false; reason: 'NOT_CONNECTED' | 'MISSING_SCOPE' | 'FAILED' };

/**
 * Poste un message dans le chat de la chaîne du tenant.
 *
 * `sender_id` vaut le diffuseur lui-même : le message apparaît donc sous le nom
 * de la chaîne, pas sous un compte de bot — nous n'en avons pas côté Twitch, et
 * en créer un demanderait une seconde identité à gérer.
 */
export async function sendTwitchChatMessage(
  admin: SupabaseClient,
  tenantId: string,
  message: string
): Promise<ChatSendResult> {
  const text = message.trim().slice(0, MAX_MESSAGE);
  if (!text) return { sent: false, reason: 'FAILED' };

  try {
    const token = await getValidBroadcasterToken(admin, tenantId);
    if (!token) return { sent: false, reason: 'NOT_CONNECTED' };
    if (!hasScope(token.scope, CHAT_WRITE_SCOPE)) {
      return { sent: false, reason: 'MISSING_SCOPE' };
    }

    const upstream = await helixFetch(token.accessToken, '/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        broadcaster_id: token.broadcasterId,
        sender_id: token.broadcasterId,
        message: text,
      }),
    });

    if (!upstream.ok) {
      logger.warn('[twitchChat] envoi refusé (HTTP %s)', upstream.status);
      return { sent: false, reason: 'FAILED' };
    }
    return { sent: true };
  } catch (err) {
    logger.warn('[twitchChat] envoi impossible', err);
    return { sent: false, reason: 'FAILED' };
  }
}
