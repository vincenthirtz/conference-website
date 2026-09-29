// features/player/_shared/errorMessage.ts — message affichable d'une erreur
// d'API joueuse (lot P4). Pur, sans fetch : le client typé (`playerHttp`,
// P5) et les écrans l'appellent avec le namespace `playerErrors`.
//
// Règle : un `code` du catalogue (utils/player/errors.ts) → son message
// traduit ; sinon (code historique, pas de code, corps illisible) → le texte
// serveur `error` en repli ; à défaut, le message générique `internal`.

import {
  isPlayerErrorCode,
  type PlayerErrorCode,
} from '../../../utils/player/errors';

export type PlayerErrorMessages = Record<PlayerErrorCode, string>;

export function playerErrorMessage(
  body: unknown,
  messages: PlayerErrorMessages
): string {
  const b =
    body && typeof body === 'object'
      ? (body as { error?: unknown; code?: unknown })
      : {};
  if (isPlayerErrorCode(b.code)) return messages[b.code];
  if (typeof b.error === 'string' && b.error.trim()) return b.error;
  return messages.internal;
}
