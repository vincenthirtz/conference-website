// features/player/library/realtime/social.ts — les EMOTES et les PHRASES
// PRÉDÉFINIES de la Women's Library (lot 5 de docs/PLAN-womens-library.md).
//
// Des IDENTIFIANTS, jamais du texte : le canal ne transporte que `wave` ou
// `hello`, chaque client affiche la traduction de sa propre langue
// (namespace `playerLibrarySocial`). Rien de libre ne circule entre
// navigateurs — le chat, lui, passe par l'API (lot 6).
//
// La Grande salle de lecture est SILENCIEUSE (plan, lot 8) : pas de phrases,
// seulement des emotes douces.

import type { LibraryRoomKind } from '../socialResponses';

export const LIBRARY_EMOTES = [
  'wave',
  'clap',
  'heart',
  'laugh',
  'dance',
] as const;
export type LibraryEmoteId = (typeof LIBRARY_EMOTES)[number];

export const LIBRARY_PHRASES = [
  'hello',
  'gg',
  'play',
  'thanks',
  'bye',
  'welcome',
] as const;
export type LibraryPhraseId = (typeof LIBRARY_PHRASES)[number];

/** Les emotes « douces » de la Grande salle de lecture. */
export const READING_ROOM_EMOTES: readonly LibraryEmoteId[] = ['wave', 'heart'];

const EMOTES: ReadonlySet<string> = new Set(LIBRARY_EMOTES);
const PHRASES: ReadonlySet<string> = new Set(LIBRARY_PHRASES);

export function isLibraryEmote(value: unknown): value is LibraryEmoteId {
  return typeof value === 'string' && EMOTES.has(value);
}

export function isLibraryPhrase(value: unknown): value is LibraryPhraseId {
  return typeof value === 'string' && PHRASES.has(value);
}

/** Ce qu'une salle permet : emotes proposées, phrases ou non. */
export function socialAllowance(kind: LibraryRoomKind): {
  emotes: readonly LibraryEmoteId[];
  phrases: readonly LibraryPhraseId[];
} {
  if (kind === 'reading_room') {
    return { emotes: READING_ROOM_EMOTES, phrases: [] };
  }
  return { emotes: LIBRARY_EMOTES, phrases: LIBRARY_PHRASES };
}

/** Durée d'affichage d'une bulle d'emote ou de phrase au-dessus d'un avatar. */
export const LIBRARY_BUBBLE_MS = 4_000;
