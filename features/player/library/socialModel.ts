// features/player/library/socialModel.ts — fonctions PURES du multijoueur de
// la Women's Library (lot 5 de docs/PLAN-womens-library.md), partagées par le
// hook `hooks/useLibrarySocialActions.ts` et l'interface `ui/social/**` :
//   - la clé de traduction d'un refus de l'API (`socialErrorKey`) ;
//   - les durées d'expulsion proposées ;
//   - la notice à afficher quand la salle se ferme ou refuse l'entrée
//     (`socialNoticeOf`) ;
//   - pourquoi la barre des signes est éteinte (`emoteBarDisabledReason`).
// Aucun réseau, aucune horloge : testé seul.
//
// LE BLOCAGE EST SILENCIEUX. Une salle refermée par un blocage (`closed`) et
// une entrée refusée (`room_forbidden`, qui couvre aussi une salle privée ou
// d'équipe) mènent à des notices NEUTRES, sans motif.

import { libraryErrorCode } from './model';
import type { LibraryEviction } from './realtime/connection';
import type {
  LibraryRoomPhase,
  LibraryRoomRefusal,
} from './realtime/useLibraryRoomChannel';
import { LIBRARY_SOCIAL_CODES, type LibraryRoomKind } from './socialResponses';
import {
  LIBRARY_KICK_DEFAULT_MINUTES,
  LIBRARY_KICK_MAX_MINUTES,
} from './socialSchemas';

/* -------------------------------------------------- les refus traduits --- */

type LibrarySocialCode =
  (typeof LIBRARY_SOCIAL_CODES)[keyof typeof LIBRARY_SOCIAL_CODES];

/** Une clé de `playerLibrarySocial.codes`. */
export type SocialErrorKey =
  | LibrarySocialCode
  /** 429 : trop de demandes (blocages 30/min, signalements 5/h). */
  | 'rate_limited'
  /** `LIBRARY_BANNED` : bannie pendant la visite. */
  | 'library_banned'
  | 'generic';

const SOCIAL_CODES: ReadonlySet<string> = new Set(
  Object.values(LIBRARY_SOCIAL_CODES)
);

function statusOf(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

/** Le refus d'une route sociale (`PlayerHttpError`) → sa clé de traduction. */
export function socialErrorKey(err: unknown): SocialErrorKey {
  const code = libraryErrorCode(err);
  if (code && SOCIAL_CODES.has(code)) return code as LibrarySocialCode;
  if (code === 'LIBRARY_BANNED') return 'library_banned';
  if (statusOf(err) === 429) return 'rate_limited';
  return 'generic';
}

/** L'issue d'un geste social : la donnée, ou le refus ET sa clé. */
export type SocialActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: unknown; code: SocialErrorKey };

/* --------------------------------------------------------- l'expulsion --- */

export type KickChoiceKey = 'min30' | 'hour1' | 'hours24';

/** Les durées proposées à la propriétaire ; la première est le défaut. */
export const LIBRARY_KICK_CHOICES: ReadonlyArray<{
  key: KickChoiceKey;
  minutes: number;
}> = [
  { key: 'min30', minutes: LIBRARY_KICK_DEFAULT_MINUTES },
  { key: 'hour1', minutes: 60 },
  { key: 'hours24', minutes: LIBRARY_KICK_MAX_MINUTES },
];

/** Expulser n'a de sens que chez soi : un appartement dont on est la propriétaire. */
export function canKickIn(room: {
  kind: LibraryRoomKind;
  isOwner: boolean;
}): boolean {
  return room.kind === 'apartment' && room.isOwner;
}

/* ---------------------------------------------------------- la notice --- */

export type SocialNoticeModel =
  /** Expulsée pendant la visite (canal serveur de la salle). */
  | { kind: 'kicked'; until: string }
  /** Entrée refusée : expulsion en cours (`room_kicked`). */
  | { kind: 'kickedEnter'; until: string | null }
  /** Bannie de la Library (pendant la visite ou à l'entrée). */
  | { kind: 'banned'; until: string | null }
  /** La salle ne m'est plus ouverte — SANS motif (blocage). */
  | { kind: 'closed' }
  /** Entrée refusée (`room_forbidden`) — SANS motif. */
  | { kind: 'forbidden' }
  | { kind: 'notFound' }
  /** Canal en erreur (jonction refusée, réseau). */
  | { kind: 'connection' }
  /** Entrée impossible pour une autre raison. */
  | { kind: 'error' };

export function socialNoticeOf(room: {
  phase: LibraryRoomPhase;
  eviction: LibraryEviction | null;
  refusal: LibraryRoomRefusal | null;
}): SocialNoticeModel | null {
  if (room.phase === 'evicted' && room.eviction) {
    const ev = room.eviction;
    if (ev.kind === 'kicked') return { kind: 'kicked', until: ev.until };
    if (ev.kind === 'banned') return { kind: 'banned', until: ev.until };
    return { kind: 'closed' };
  }
  if (room.phase === 'refused' && room.refusal) {
    const { code, until } = room.refusal;
    switch (code) {
      case LIBRARY_SOCIAL_CODES.roomForbidden:
        return { kind: 'forbidden' };
      case LIBRARY_SOCIAL_CODES.roomKicked:
        return { kind: 'kickedEnter', until: until ?? null };
      case LIBRARY_SOCIAL_CODES.roomNotFound:
        return { kind: 'notFound' };
      case 'LIBRARY_BANNED':
        return { kind: 'banned', until: until ?? null };
      default:
        return { kind: 'error' };
    }
  }
  if (room.phase === 'error') return { kind: 'connection' };
  return null;
}

/* ------------------------------------------------ la barre des signes --- */

export type EmoteBarDisabledReason = 'discreet' | 'hidden' | 'offline';

/**
 * Pourquoi on ne peut pas faire signe, ou `null` (on peut). Discrète dans la
 * Grande salle de lecture : `discreet` (il suffit de se montrer) ; invisible
 * ailleurs (`canBeVisible` faux, réservé) : `hidden`.
 */
export function emoteBarDisabledReason(room: {
  phase: LibraryRoomPhase;
  visible: boolean;
  kind: LibraryRoomKind;
  canBeVisible: boolean;
}): EmoteBarDisabledReason | null {
  if (room.phase !== 'connected') return 'offline';
  if (room.visible) return null;
  return room.kind === 'reading_room' && room.canBeVisible
    ? 'discreet'
    : 'hidden';
}
