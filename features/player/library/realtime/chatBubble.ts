// features/player/library/realtime/chatBubble.ts — reconnaître une bulle de
// CHAT au-dessus d'un avatar (lot 6 de docs/PLAN-womens-library.md).
//
// Le moteur ne connaît que des bulles `{ key, glyph, text }` ; la clé d'une
// bulle de chat commence par `chat:` (suivie de l'identifiant du message).
// `engine/avatarOverlays.ts` la dessine alors plus large, élidée sur une
// ligne ; le fil, sous la scène, garde le texte entier. Module PUR, sans
// dépendance : le moteur (chunk `next/dynamic`) et l'écran l'importent tous
// les deux.

export const CHAT_BUBBLE_KEY_PREFIX = 'chat:';

/** La clé d'une bulle de chat pour un message. */
export function chatBubbleKey(messageId: string): string {
  return `${CHAT_BUBBLE_KEY_PREFIX}${messageId}`;
}

export function isChatBubbleKey(key: string): boolean {
  return key.startsWith(CHAT_BUBBLE_KEY_PREFIX);
}
