// features/player/library/roomStageModel.ts — fonctions PURES de l'écran d'une
// salle de la Women's Library (lot 5 phase B de docs/PLAN-womens-library.md),
// partagées par `ui/room/**`, l'appartement et la page :
//   - l'état temps réel (`RemoteAvatar`) → ce que le moteur dessine
//     (`RemoteAvatarInput`, textes DÉJÀ traduits : le moteur n'a pas d'i18n) ;
//   - la bulle de mon propre signe ;
//   - où poser le menu d'un avatar pour qu'il reste à l'écran ;
//   - la case de départ annoncée dans ma présence ;
//   - le paramètre `?room=` de `/player/library` et le lien à partager ;
//   - (lot 7) la SCÈNE d'une salle : une salle commune (hall, Grande salle de
//     lecture) prend son décor fixe (`layouts/*`), et `?place=`.
// Aucun réseau, aucune horloge, aucun import de VALEUR du moteur (il reste
// dans son chunk `next/dynamic`) : testé seul.

import {
  apartmentStartTile,
  type RoomShape,
  type RoomWithItems,
} from './apartmentModel';
import type { RoomDecor } from './engine/decor';
import type { Direction } from './engine/motion';
import type { Tile } from './engine/projection';
import type { BubbleContent, RemoteAvatarInput } from './engine/remotes';
import { fixedLayoutOf } from './layouts';
import type { PlacementSpec } from './placement';
import type { LibraryPosition } from './realtime/connection';
import type { RemoteAvatar } from './realtime/roomState';
import type { LibraryEmoteId, LibraryPhraseId } from './realtime/social';
import type { LibraryApartmentItem } from './responses';
import type { LibraryRoomKind } from './socialResponses';

/** Les mots d'un signe, dans la langue de l'interface. */
export type SignWords = {
  emotes: Readonly<Record<LibraryEmoteId, string>>;
  phrases: Readonly<Record<LibraryPhraseId, string>>;
  glyphs: Readonly<Record<LibraryEmoteId, string>>;
};

export type Sign =
  | { type: 'emote'; id: LibraryEmoteId }
  | { type: 'phrase'; id: LibraryPhraseId };

/** La bulle d'un signe : pictogramme + mot (emote), mot seul (phrase). */
export function bubbleContentOf(
  sign: Sign,
  words: SignWords,
  key: string
): BubbleContent {
  return sign.type === 'emote'
    ? { key, glyph: words.glyphs[sign.id], text: words.emotes[sign.id] }
    : { key, glyph: null, text: words.phrases[sign.id] };
}

/** La bulle d'une autre joueuse : son signe le plus récent, s'il y en a un. */
export function remoteBubbleOf(
  a: Pick<RemoteAvatar, 'userId' | 'emote' | 'phrase'>,
  words: SignWords
): RemoteAvatarInput['bubble'] {
  const { emote, phrase } = a;
  const sign: (Sign & { at: number }) | null =
    emote && (!phrase || emote.receivedAt >= phrase.receivedAt)
      ? { type: 'emote', id: emote.id, at: emote.receivedAt }
      : phrase
        ? { type: 'phrase', id: phrase.id, at: phrase.receivedAt }
        : null;
  if (!sign) return null;
  return {
    ...bubbleContentOf(sign, words, `${a.userId}:${sign.type}:${sign.at}`),
    shownAt: sign.at,
  };
}

const toDirection = (dir: number): Direction =>
  Math.min(7, Math.max(0, Math.round(dir))) as Direction;

/** L'état temps réel → les autres joueuses du moteur (même ordre). */
export function toRemoteInputs(
  avatars: readonly RemoteAvatar[],
  words: SignWords
): RemoteAvatarInput[] {
  return avatars.map((a) => ({
    id: a.userId,
    nickname: a.nickname,
    avatarId: a.avatarId,
    look: a.look ?? null,
    tile: { i: a.gx, j: a.gy },
    dir: toDirection(a.dir),
    target: a.target
      ? {
          tile: { i: a.target.gx, j: a.target.gy },
          receivedAt: a.target.receivedAt,
        }
      : null,
    bubble: remoteBubbleOf(a, words),
  }));
}

/** Gabarit du menu d'un avatar à partir de `sm` (w-72 ; étape la plus haute). */
export const AVATAR_MENU_SIZE = { width: 288, height: 300 } as const;

/**
 * Le coin haut-gauche du menu, gardé dans `frame` (px CSS) : à droite de la
 * tête visée, rabattu à gauche ou vers le haut s'il déborde. Un cadre trop
 * petit pour le menu le colle à la marge.
 */
export function clampMenuAnchor(
  head: { x: number; y: number },
  frame: { width: number; height: number },
  menu: { width: number; height: number } = AVATAR_MENU_SIZE,
  margin = 8
): { x: number; y: number } {
  const offset = 12;
  let x = head.x + offset;
  if (x + menu.width > frame.width - margin) x = head.x - offset - menu.width;
  const maxX = frame.width - margin - menu.width;
  const maxY = frame.height - margin - menu.height;
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(head.y, maxY)),
  };
}

/**
 * Ma case de départ dans une salle (celle où le moteur me pose) : l'arrivée
 * du décor fixe d'une salle commune ; sinon libre, la plus proche du centre.
 * Une entrée (`POST enter`) ou l'appartement.
 */
export function roomStartPosition(
  room: {
    room: RoomShape & { kind?: LibraryRoomKind };
    items: RoomWithItems['items'];
  },
  specs: ReadonlyMap<string, PlacementSpec>
): LibraryPosition {
  const fixed = room.room.kind ? fixedLayoutOf(room.room.kind) : null;
  const t = fixed ? fixed.playerStart : apartmentStartTile(room, specs);
  return { gx: t.i, gy: t.j, dir: 4 };
}

/** Ce que la vue reçoit d'une salle commune au lieu du décor d'appartement. */
export type FixedScene = { decor: RoomDecor; wallHeight: number; start: Tile };

/**
 * La SCÈNE d'une salle où l'on entre. Une salle commune (décor fixe) : ses
 * dimensions, ses meubles (id = celui du décor, rendu en `inventoryId`) et
 * `fixed` (décor, murs, arrivée). Les autres : la salle et ses meubles tels
 * qu'`enter` les rend, `fixed: null`.
 */
export function sceneOf<
  R extends RoomShape & { kind: LibraryRoomKind },
>(enter: {
  room: R;
  items: readonly LibraryApartmentItem[];
}): {
  room: R;
  items: readonly LibraryApartmentItem[];
  fixed: FixedScene | null;
} {
  const layout = fixedLayoutOf(enter.room.kind);
  if (!layout) return { room: enter.room, items: enter.items, fixed: null };
  const { room, playerStart } = layout;
  return {
    room: { ...enter.room, width: room.w, depth: room.d },
    items: room.items.map((i) => ({
      inventoryId: i.id,
      key: i.key,
      gx: i.gx,
      gy: i.gy,
      rotation: i.r,
    })),
    fixed: room.decor
      ? { decor: room.decor, wallHeight: room.wallHeight, start: playerStart }
      : null,
  };
}

/** Les lieux communs qu'on ouvre par `?place=` (lot 7). */
export type LibraryPlace = 'hall' | 'reading_room';

/**
 * `?place=` de `/player/library` : `hall` ou `reading_room`, sinon null (rien,
 * plusieurs valeurs, autre chose).
 */
export function parsePlaceParam(value: unknown): LibraryPlace | null {
  return value === 'hall' || value === 'reading_room' ? value : null;
}

/** L'adresse d'un lieu commun (`/player/library?place=…`). */
export function placeHref(place: LibraryPlace): string {
  return `/player/library?place=${place}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `?room=` de `/player/library` : l'identifiant d'une salle à visiter
 * (minuscules), ou null — rien, plusieurs valeurs, autre chose qu'un UUID —
 * et c'est alors l'appartement qui s'affiche.
 */
export function parseRoomParam(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

/** Ce que montre `/player/library`, selon son adresse. */
export type LibraryView =
  | { kind: 'apartment' }
  | { kind: 'room'; roomId: string }
  | { kind: 'place'; place: LibraryPlace };

/**
 * `?room=<uuid>` (une salle par son adresse) l'emporte sur `?place=` (un lieu
 * commun par son nom) ; ni l'un ni l'autre lisible : mon appartement.
 */
export function libraryViewOf(query: {
  room?: unknown;
  place?: unknown;
}): LibraryView {
  const roomId = parseRoomParam(query.room);
  if (roomId) return { kind: 'room', roomId };
  const place = parsePlaceParam(query.place);
  return place ? { kind: 'place', place } : { kind: 'apartment' };
}

/** L'adresse d'une salle à partager (`/player/library?room=<id>`). */
export function roomShareUrl(origin: string, roomId: string): string {
  return `${origin.replace(/\/+$/, '')}/player/library?room=${encodeURIComponent(roomId)}`;
}
