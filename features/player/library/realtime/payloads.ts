// features/player/library/realtime/payloads.ts — ce qui circule ENTRE
// NAVIGATEURS sur `library:room:<id>` (lot 5 de docs/PLAN-womens-library.md) :
//   - la présence : `{ userId, nickname, avatarId, gx, gy, dir, look? }` ;
//   - les broadcasts : `move { userId, gx, gy, at }`, `emote { userId, emote }`,
//     `phrase { userId, phraseId }`.
//
// TOUT PAYLOAD REÇU EST SUSPECT. Il vient d'un autre navigateur, que la policy
// a seulement admis dans la salle : elle ne lit pas le contenu des messages.
// Chaque payload est donc borné en taille AVANT d'être lu, puis validé par
// zod ; un payload inconnu, trop gros ou mal formé est JETÉ sans bruit.
//
// ⚠️ `userId` N'EST PAS UNE PREUVE D'IDENTITÉ. Une cliente admise peut annoncer
// le `userId` d'une autre dans sa présence ou ses déplacements. On s'en sert
// pour AFFICHER (placer un avatar, son pseudo) ; aucune décision de
// modération ne s'y fonde — bloquer, signaler, expulser passent par l'API,
// qui identifie l'appelante par sa session et vérifie la cible en base.

import * as z from 'zod';
import {
  decodeLibraryLook,
  LIBRARY_LOOK_CODE_MAX,
} from '@/config/library/avatarLook';
import {
  isLibraryEmote,
  isLibraryPhrase,
  type LibraryEmoteId,
  type LibraryPhraseId,
} from './social';

/** Au-delà, un payload n'est même pas lu (JSON sérialisé, en caractères). */
export const LIBRARY_PAYLOAD_MAX_CHARS = 512;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userId = z.string().regex(UUID_RE);
/** Une case : entier positif, borné bien au-delà de la plus grande salle. */
const tile = z.number().int().min(0).max(400);

export const LibraryPresencePayload = z.object({
  userId,
  // Même gabarit que la base (3 à 20) ; le contenu n'est qu'affiché.
  nickname: z.string().min(1).max(20),
  avatarId: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  gx: tile,
  gy: tile,
  /** Direction 0..7 (0 = haut de l'écran, sens horaire). */
  dir: z.number().int().min(0).max(7),
  /**
   * Look composé (lot 13), FACULTATIF : la forme compacte de
   * config/library/avatarLook.ts (7 caractères). Hors des listes fermées, il
   * est ignoré — pas la présence : l'avatar retombe sur `avatarId`.
   */
  look: z
    .string()
    .max(LIBRARY_LOOK_CODE_MAX)
    .refine((v) => decodeLibraryLook(v) !== null)
    .optional()
    .catch(undefined),
});
export type LibraryPresencePayload = z.infer<typeof LibraryPresencePayload>;

export const LibraryMovePayload = z.object({
  userId,
  gx: tile,
  gy: tile,
  /** Horloge de l'émettrice (ms) : sert à ordonner, jamais à décider. */
  at: z.number().int().min(0),
});
export type LibraryMovePayload = z.infer<typeof LibraryMovePayload>;

export const LibraryEmotePayload = z.object({
  userId,
  emote: z.custom<LibraryEmoteId>((v) => isLibraryEmote(v)),
});
export type LibraryEmotePayload = z.infer<typeof LibraryEmotePayload>;

export const LibraryPhrasePayload = z.object({
  userId,
  phraseId: z.custom<LibraryPhraseId>((v) => isLibraryPhrase(v)),
});
export type LibraryPhrasePayload = z.infer<typeof LibraryPhrasePayload>;

/** Noms des broadcasts ENTRE JOUEUSES. */
export const LIBRARY_PEER_EVENTS = {
  move: 'move',
  emote: 'emote',
  phrase: 'phrase',
} as const;

/** Trop gros pour être lu ? (taille du JSON, sans le désérialiser deux fois). */
export function isOversized(payload: unknown): boolean {
  try {
    const text = JSON.stringify(payload);
    return typeof text !== 'string' || text.length > LIBRARY_PAYLOAD_MAX_CHARS;
  } catch {
    // Cycle, BigInt… : pas un payload JSON, donc pas lu.
    return true;
  }
}

/** Taille bornée puis zod : le payload validé, ou `null` (jeté). */
export function parsePeerPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown
): T | null {
  if (isOversized(payload)) return null;
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
