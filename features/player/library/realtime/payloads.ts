// features/player/library/realtime/payloads.ts — ce qui circule ENTRE
// NAVIGATEURS sur `library:room:<id>` (lot 5 de docs/PLAN-womens-library.md) :
//   - la présence : `{ userId, gx, gy, dir, ticket }` ;
//   - les broadcasts : `move { userId, gx, gy, at }`, `emote { userId, emote }`,
//     `phrase { userId, phraseId }`.
//
// TOUT PAYLOAD REÇU EST SUSPECT. Il vient d'un autre navigateur, que la policy
// a seulement admis dans la salle : elle ne lit pas le contenu des messages.
// Chaque payload est donc borné en taille AVANT d'être lu, puis validé par
// zod ; un payload inconnu, trop gros ou mal formé est JETÉ sans bruit.
//
// ⚠️ `userId` SEUL N'EST PAS UNE PREUVE D'IDENTITÉ (lot 14a). Qui est là, sous
// quel pseudo, avec quel avatar et quel look : c'est le JETON DE PRÉSENCE
// (`ticket`, signé par l'API à l'entrée) qui le dit, une fois vérifié
// (`./presenceVerifier.ts`). Un pseudo, un avatar ou un look posés à côté du
// jeton dans le payload sont IGNORÉS. Les déplacements, emotes et phrases
// restent cosmétiques : ils ne valent que pour un avatar déjà vérifié.

import * as z from 'zod';
import { LIBRARY_PRESENCE_TICKET_MAX_CHARS } from '../socialSchemas';
import {
  isLibraryEmote,
  isLibraryPhrase,
  type LibraryEmoteId,
  type LibraryPhraseId,
} from './social';

/** Au-delà, un payload n'est même pas lu (JSON sérialisé, en caractères). */
export const LIBRARY_PAYLOAD_MAX_CHARS = 512;
/** La présence porte un jeton (~360 caractères) : sa borne à elle. */
export const LIBRARY_PRESENCE_MAX_CHARS = 1_280;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userId = z.string().regex(UUID_RE);
/** Une case : entier positif, borné bien au-delà de la plus grande salle. */
const tile = z.number().int().min(0).max(400);

/**
 * La présence : OÙ est l'avatar (case, direction) et le jeton qui dit QUI il
 * est. Le pseudo, l'avatar et le look ne se lisent que dans le jeton vérifié.
 */
export const LibraryPresencePayload = z.object({
  userId,
  gx: tile,
  gy: tile,
  /** Direction 0..7 (0 = haut de l'écran, sens horaire). */
  dir: z.number().int().min(0).max(7),
  /** Jeton de présence (lot 14a, features/player/library/presenceTicket.ts). */
  ticket: z.string().min(1).max(LIBRARY_PRESENCE_TICKET_MAX_CHARS),
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
export function isOversized(
  payload: unknown,
  max = LIBRARY_PAYLOAD_MAX_CHARS
): boolean {
  try {
    const text = JSON.stringify(payload);
    return typeof text !== 'string' || text.length > max;
  } catch {
    // Cycle, BigInt… : pas un payload JSON, donc pas lu.
    return true;
  }
}

/** Taille bornée puis zod : le payload validé, ou `null` (jeté). */
export function parsePeerPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  max = LIBRARY_PAYLOAD_MAX_CHARS
): T | null {
  if (isOversized(payload, max)) return null;
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
