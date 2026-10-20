// features/player/library/realtime/roomState.ts — l'état des AUTRES avatars
// d'une salle, reconstruit de ce que disent les canaux (lot 5 de
// docs/PLAN-womens-library.md). Réducteur PUR : aucune horloge, aucun réseau,
// testé seul ; `./connection.ts` lui passe les événements déjà validés.
//
// LES RÈGLES :
//   - un avatar n'existe que s'il est dans la PRÉSENCE : un `move`, une emote
//     ou une phrase d'un `userId` absent de la présence est jeté (pas
//     d'avatar fantôme par simple broadcast) ;
//   - jamais soi-même, jamais une personne masquée (`hidden` : blocages dans
//     les deux sens) ni écartée (`revoked` : expulsée ou bannie, d'après un
//     événement SERVEUR) — et cela tient même si elle continue d'émettre ;
//   - un `move` plus ancien que le dernier reçu de la même personne est jeté,
//     et deux `move` à moins de `MIN_PEER_MOVE_MS` (heure de RÉCEPTION) aussi :
//     un client qui inonde le canal ne fait pas sauter les avatars ;
//   - une case hors de la salle est jetée ;
//   - (lot 14a) la présence reçue est déjà VÉRIFIÉE (`./presenceVerifier.ts`) :
//     pseudo, avatar et look viennent du jeton ; un avatar dont le jeton
//     échoit disparaît au `tick` suivant.

import type { LibraryEmoteId, LibraryPhraseId } from './social';
import { LIBRARY_BUBBLE_MS } from './social';
import type {
  LibraryEmotePayload,
  LibraryMovePayload,
  LibraryPhrasePayload,
} from './payloads';
import type { VerifiedPresenceEntry } from './presenceVerifier';

/** Écart minimal entre deux déplacements reçus d'une même personne. */
export const MIN_PEER_MOVE_MS = 100;

export type RemoteAvatar = {
  userId: string;
  /** Pseudo, avatar et look : ceux du JETON vérifié (lot 14a). */
  nickname: string;
  avatarId: string;
  /** Look composé (lot 13, forme compacte déjà validée) ; null : `avatarId`. */
  look: string | null;
  /** Son jeton de présence vérifié : ce que portent les gestes de modération. */
  ticket: string;
  /** Échéance du jeton (ms, mon horloge) : au-delà, l'avatar disparaît. */
  expiresAt: number;
  /** Dernière case CONNUE (présence) : là où le moteur la pose en arrivant. */
  gx: number;
  gy: number;
  dir: number;
  /** Dernière case VISÉE (broadcast `move`) : le moteur y fait marcher l'avatar. */
  target: { gx: number; gy: number; receivedAt: number } | null;
  emote: { id: LibraryEmoteId; receivedAt: number } | null;
  phrase: { id: LibraryPhraseId; receivedAt: number } | null;
};

export type RoomSocialState = {
  selfId: string;
  room: { width: number; depth: number };
  /** Les autres avatars visibles, par `userId`. */
  avatars: Record<string, RemoteAvatar>;
  /** Masquées (blocages, deux sens confondus), triées. */
  hidden: string[];
  /** Écartées par un événement serveur : `userId` → fin (ms) ou `null` (sans fin connue). */
  revoked: Record<string, number | null>;
  /** Dernier `at` accepté par personne (ordre des `move`). */
  lastMoveAt: Record<string, number>;
  /** Heure de réception du dernier `move` accepté par personne. */
  lastMoveReceivedAt: Record<string, number>;
};

export type RoomSocialAction =
  | { type: 'presence'; entries: VerifiedPresenceEntry[]; now: number }
  | { type: 'move'; payload: LibraryMovePayload; now: number }
  | { type: 'emote'; payload: LibraryEmotePayload; now: number }
  | { type: 'phrase'; payload: LibraryPhrasePayload; now: number }
  | { type: 'hide'; userId: string }
  | { type: 'unhide'; userId: string }
  | { type: 'revoke'; userId: string; until: number | null }
  | { type: 'tick'; now: number }
  | { type: 'reset' };

export function initialRoomState(args: {
  selfId: string;
  room: { width: number; depth: number };
  hiddenUserIds?: readonly string[];
}): RoomSocialState {
  return {
    selfId: args.selfId,
    room: { width: args.room.width, depth: args.room.depth },
    avatars: {},
    hidden: [...new Set(args.hiddenUserIds ?? [])].sort(),
    revoked: {},
    lastMoveAt: {},
    lastMoveReceivedAt: {},
  };
}

function isRevoked(
  state: RoomSocialState,
  userId: string,
  now: number
): boolean {
  if (!(userId in state.revoked)) return false;
  const until = state.revoked[userId];
  return until === null || until > now;
}

/** Peut-on montrer cette personne ? */
export function isShown(
  state: RoomSocialState,
  userId: string,
  now: number
): boolean {
  return (
    userId !== state.selfId &&
    !state.hidden.includes(userId) &&
    !isRevoked(state, userId, now)
  );
}

function inRoom(state: RoomSocialState, gx: number, gy: number): boolean {
  return gx < state.room.width && gy < state.room.depth;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _gone, ...rest } = record;
  return rest;
}

export function roomSocialReducer(
  state: RoomSocialState,
  action: RoomSocialAction
): RoomSocialState {
  switch (action.type) {
    case 'presence': {
      // La présence fait foi pour QUI est là ; on garde ce que les broadcasts
      // ont appris depuis (case visée, bulles).
      const next: Record<string, RemoteAvatar> = {};
      for (const entry of action.entries) {
        if (!isShown(state, entry.userId, action.now)) continue;
        if (!inRoom(state, entry.gx, entry.gy)) continue;
        if (entry.expiresAt <= action.now) continue;
        const known = state.avatars[entry.userId];
        next[entry.userId] = {
          userId: entry.userId,
          nickname: entry.nickname,
          avatarId: entry.avatarId,
          look: entry.look,
          ticket: entry.ticket,
          expiresAt: entry.expiresAt,
          gx: entry.gx,
          gy: entry.gy,
          dir: entry.dir,
          target: known?.target ?? null,
          emote: known?.emote ?? null,
          phrase: known?.phrase ?? null,
        };
      }
      return { ...state, avatars: next };
    }

    case 'move': {
      const { payload, now } = action;
      const avatar = state.avatars[payload.userId];
      if (!avatar || !isShown(state, payload.userId, now)) return state;
      if (!inRoom(state, payload.gx, payload.gy)) return state;
      const lastAt = state.lastMoveAt[payload.userId];
      if (lastAt !== undefined && payload.at <= lastAt) return state;
      const lastRx = state.lastMoveReceivedAt[payload.userId];
      if (lastRx !== undefined && now - lastRx < MIN_PEER_MOVE_MS) return state;
      return {
        ...state,
        avatars: {
          ...state.avatars,
          [payload.userId]: {
            ...avatar,
            target: { gx: payload.gx, gy: payload.gy, receivedAt: now },
          },
        },
        lastMoveAt: { ...state.lastMoveAt, [payload.userId]: payload.at },
        lastMoveReceivedAt: {
          ...state.lastMoveReceivedAt,
          [payload.userId]: now,
        },
      };
    }

    case 'emote': {
      const avatar = state.avatars[action.payload.userId];
      if (!avatar || !isShown(state, action.payload.userId, action.now)) {
        return state;
      }
      return {
        ...state,
        avatars: {
          ...state.avatars,
          [avatar.userId]: {
            ...avatar,
            emote: { id: action.payload.emote, receivedAt: action.now },
          },
        },
      };
    }

    case 'phrase': {
      const avatar = state.avatars[action.payload.userId];
      if (!avatar || !isShown(state, action.payload.userId, action.now)) {
        return state;
      }
      return {
        ...state,
        avatars: {
          ...state.avatars,
          [avatar.userId]: {
            ...avatar,
            phrase: { id: action.payload.phraseId, receivedAt: action.now },
          },
        },
      };
    }

    case 'hide': {
      if (action.userId === state.selfId) return state;
      const hidden = state.hidden.includes(action.userId)
        ? state.hidden
        : [...state.hidden, action.userId].sort();
      return {
        ...state,
        hidden,
        avatars: without(state.avatars, action.userId),
      };
    }

    case 'unhide': {
      if (!state.hidden.includes(action.userId)) return state;
      // Elle réapparaît à la prochaine synchronisation de présence.
      return {
        ...state,
        hidden: state.hidden.filter((u) => u !== action.userId),
      };
    }

    case 'revoke': {
      if (action.userId === state.selfId) return state;
      return {
        ...state,
        revoked: { ...state.revoked, [action.userId]: action.until },
        avatars: without(state.avatars, action.userId),
      };
    }

    case 'tick': {
      // Les bulles échues s'effacent ; les expulsions échues sont oubliées ;
      // un avatar au jeton échu disparaît (lot 14a).
      let changed = false;
      const avatars: Record<string, RemoteAvatar> = {};
      for (const [id, a] of Object.entries(state.avatars)) {
        if (a.expiresAt <= action.now) {
          changed = true;
          continue;
        }
        const emote =
          a.emote && action.now - a.emote.receivedAt >= LIBRARY_BUBBLE_MS
            ? null
            : a.emote;
        const phrase =
          a.phrase && action.now - a.phrase.receivedAt >= LIBRARY_BUBBLE_MS
            ? null
            : a.phrase;
        if (emote !== a.emote || phrase !== a.phrase) changed = true;
        avatars[id] =
          emote !== a.emote || phrase !== a.phrase
            ? { ...a, emote, phrase }
            : a;
      }
      const revoked: Record<string, number | null> = {};
      for (const [id, until] of Object.entries(state.revoked)) {
        if (until !== null && until <= action.now) changed = true;
        else revoked[id] = until;
      }
      return changed ? { ...state, avatars, revoked } : state;
    }

    case 'reset':
      return { ...state, avatars: {}, lastMoveAt: {}, lastMoveReceivedAt: {} };
  }
}

/** Les avatars à dessiner, triés par `userId` (ordre stable). */
export function visibleAvatars(state: RoomSocialState): RemoteAvatar[] {
  return Object.values(state.avatars).sort((a, b) =>
    a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
  );
}
