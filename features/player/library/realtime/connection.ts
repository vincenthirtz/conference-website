// features/player/library/realtime/connection.ts — la connexion d'une joueuse
// aux canaux PRIVÉS d'une salle de la Women's Library (lot 5 de
// docs/PLAN-womens-library.md). Aucun import réseau : le client Realtime est
// REÇU (`LibraryRealtimeClient`), un faux canal suffit aux tests ; le hook
// `./useLibraryRoomChannel.ts` lui passe le vrai (supabase-js).
//
// QUATRE SUJETS, tous `config: { private: true }` (policy `library_can_join`) :
//   - `room`   : Presence (clé = mon userId, payload = ma case et MON JETON
//                de présence signé, lot 14a) + broadcasts des joueuses
//                (`move`, `emote`, `phrase`). ÉCRIT PAR LES CLIENTES : on n'y
//                écoute QUE ces trois événements, validés ; un `kicked` qui y
//                passerait est un faux et n'est même pas écouté. Une présence
//                n'est montrée que si son jeton se vérifie
//                (`./presenceVerifier.ts`), sous le pseudo et le look DU JETON ;
//   - `chat`   : le canal SERVEUR de la salle — `kicked` (et le chat, lot 6) ;
//   - `tenant` : les événements système de l'espace — `banned` ;
//   - `user`   : ma boîte — `hide` / `unhide` (blocages), en silence.
// Seuls les trois derniers, écrits avec la clé service role, décident de
// quelque chose (quitter, masquer).
//
// MODE DISCRET (Grande salle de lecture, `discreetByDefault`) : on reçoit
// tout, on n'envoie RIEN — pas de `track()`, pas de déplacement, pas
// d'emote. Devenir visible est un geste explicite (`setVisible(true)`).
//
// CADENCES D'ENVOI : un déplacement toutes les 150 ms au plus (le dernier
// demandé part en fin de fenêtre : pas de case visée perdue), une emote ou
// une phrase par seconde (au-delà : refusée), la présence au plus chaque
// seconde.

import {
  LIBRARY_SERVER_EVENTS,
  LibraryBannedPayload,
  LibraryHidePayload,
  LibraryKickedPayload,
  LibraryUnhidePayload,
} from '../realtimeTopics';
import type {
  LibraryEnterResponse,
  LibraryPresenceGrant,
} from '../socialResponses';
import { bindChatEvents, type LibraryChatEvent } from './chatEvents';
import {
  LIBRARY_PEER_EVENTS,
  LibraryEmotePayload,
  LibraryMovePayload,
  LibraryPhrasePayload,
  LibrarySeatRef,
  LibraryUseRef,
  parsePeerPayload,
} from './payloads';
import { createVerifiedPresence } from './presenceVerifier';
import {
  initialRoomState,
  roomSocialReducer,
  type RoomSocialAction,
  type RoomSocialState,
} from './roomState';
import {
  isLibraryEmote,
  isLibraryPhrase,
  socialAllowance,
  type LibraryEmoteId,
  type LibraryPhraseId,
} from './social';
import {
  createGate,
  MOVE_MIN_INTERVAL_MS,
  PRESENCE_MIN_INTERVAL_MS,
  SOCIAL_MIN_INTERVAL_MS,
} from './throttle';

/* ------------------------------------------------- le client, abstrait --- */

export type LibraryChannelMessage = { payload?: unknown };

/** Le sous-ensemble d'un `RealtimeChannel` (supabase-js) que l'on utilise. */
export interface LibraryChannel {
  on(
    type: 'presence' | 'broadcast',
    filter: { event: string },
    callback: (message: LibraryChannelMessage) => void
  ): LibraryChannel;
  subscribe(callback?: (status: string, err?: Error) => void): unknown;
  presenceState(): Record<string, Array<Record<string, unknown>>>;
  track(payload: Record<string, unknown>): Promise<unknown>;
  untrack(): Promise<unknown>;
  send(message: {
    type: 'broadcast';
    event: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

export type LibraryChannelOptions = {
  config: {
    private: true;
    presence?: { key: string; enabled: boolean };
    broadcast?: { self: boolean };
  };
};

export interface LibraryRealtimeClient {
  channel(topic: string, options: LibraryChannelOptions): LibraryChannel;
  removeChannel(channel: LibraryChannel): unknown;
  /** Transmet le JWT de la session à Realtime (Realtime Authorization). */
  setAuth?: () => Promise<unknown>;
}

/* ---------------------------------------------------------- les types --- */

/** Pourquoi la connexion s'est fermée d'elle-même. */
export type LibraryEviction =
  | { kind: 'kicked'; until: string }
  | { kind: 'banned'; until: string | null }
  /**
   * La salle ne m'est plus ouverte (un blocage avec sa propriétaire). Le motif
   * n'est PAS dit : la personne bloquée n'en est pas avertie.
   */
  | { kind: 'closed' };

export type LibraryConnectionStatus =
  | 'connecting'
  | 'connected'
  /** Jonction refusée (policy) ou canal en erreur. */
  | 'error'
  | 'closed';

/** Ce qu'un avatar fait d'un meuble (lot 15), dans la présence ou un `move`. */
export type LibraryRest = { seat?: LibrarySeatRef; use?: LibraryUseRef };

/** Ma case (assise : ma case d'accès), ma direction et ma posture. */
export type LibraryPosition = {
  gx: number;
  gy: number;
  dir: number;
} & LibraryRest;

export type LibraryEnterContext = Pick<
  LibraryEnterResponse,
  | 'room'
  | 'topics'
  | 'me'
  | 'hiddenUserIds'
  | 'discreetByDefault'
  | 'canBeVisible'
  | 'presence'
>;

export type LibraryConnectionOptions = {
  client: LibraryRealtimeClient;
  enter: LibraryEnterContext;
  /** Case de départ, annoncée dans la présence quand on est visible. */
  position: LibraryPosition;
  /** Visible au départ ? Défaut : `!discreetByDefault` (et `canBeVisible`). */
  visible?: boolean;
  onState: (state: RoomSocialState) => void;
  onEvicted: (eviction: LibraryEviction) => void;
  onStatus?: (status: LibraryConnectionStatus) => void;
  /** Le chat (lot 6) : événements SERVEUR validés, pour cette salle. */
  onChat?: (event: LibraryChatEvent) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type SendMoveResult = 'sent' | 'queued' | 'refused';

export type LibraryRoomConnection = {
  isVisible(): boolean;
  /** Se montrer (`track`) ou redevenir discrète (`untrack`). */
  setVisible(visible: boolean): Promise<void>;
  /** La case où je me trouve (arrivée) : rafraîchit ma présence, au plus chaque seconde. */
  updatePosition(position: LibraryPosition): void;
  /** La case que je vise (un clic = un message) ; `rest` : ce que j'y ferai. */
  sendMove(gx: number, gy: number, rest?: LibraryRest): SendMoveResult;
  sendEmote(emote: LibraryEmoteId): boolean;
  sendPhrase(phrase: LibraryPhraseId): boolean;
  /**
   * Un jeton renouvelé (nouvelle entrée : échéance proche, nouveau look) :
   * ma présence repart avec lui ; une nouvelle clé relit celle des autres.
   */
  renewPresence(grant: LibraryPresenceGrant): void;
  /** Résolue quand les jetons reçus sont tous jugés (tests). */
  presenceSettled(): Promise<void>;
  /** Après MON blocage confirmé par l'API : ne plus la montrer, tout de suite. */
  hideLocally(userId: string): void;
  unhideLocally(userId: string): void;
  /** Efface les bulles échues (appelée à intervalle régulier). */
  tick(): void;
  getState(): RoomSocialState;
  close(): Promise<void>;
};

/**
 * Ma posture telle qu'elle part (lot 15) : `seat` OU `use`, seulement s'il
 * passe le schéma que liront les autres (sinon rien : debout).
 */
function validRest(r: LibraryRest): LibraryRest {
  if (r.seat && LibrarySeatRef.safeParse(r.seat).success)
    return { seat: { item: r.seat.item, spot: r.seat.spot } };
  if (r.use && LibraryUseRef.safeParse(r.use).success)
    return { use: { item: r.use.item } };
  return {};
}

/** Une fin d'expulsion / de bannissement ISO → ms, ou `null` (inconnue / définitif). */
function untilMs(until: string | null): number | null {
  if (until === null) return null;
  const ms = Date.parse(until);
  return Number.isFinite(ms) ? ms : null;
}

export function createLibraryRoomConnection(
  options: LibraryConnectionOptions
): LibraryRoomConnection {
  const { client, enter } = options;
  const now = options.now ?? (() => Date.now());
  const setTimer =
    options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const me = enter.me;
  const allowance = socialAllowance(enter.room.kind);

  let state = initialRoomState({
    selfId: me.userId,
    room: { width: enter.room.width, depth: enter.room.depth },
    hiddenUserIds: enter.hiddenUserIds,
  });
  let visible =
    enter.canBeVisible && (options.visible ?? !enter.discreetByDefault);
  let position: LibraryPosition = { ...options.position };
  let subscribed = false;
  let tracked = false;
  let closed = false;

  const moveGate = createGate(MOVE_MIN_INTERVAL_MS);
  const socialGate = createGate(SOCIAL_MIN_INTERVAL_MS);
  const presenceGate = createGate(PRESENCE_MIN_INTERVAL_MS);
  let pendingMove: ({ gx: number; gy: number } & LibraryRest) | null = null;
  let moveTimer: unknown = null;
  let presenceTimer: unknown = null;

  const channels: LibraryChannel[] = [];

  function dispatch(action: RoomSocialAction) {
    const next = roomSocialReducer(state, action);
    if (next !== state) {
      state = next;
      options.onState(state);
    }
  }

  // Lot 14a — mon jeton part dans ma présence ; ceux des autres sont vérifiés.
  const presence = createVerifiedPresence({
    grant: enter.presence,
    roomId: enter.room.id,
    now,
    onSettled: () => resync(),
  });

  /** Relire la présence : seules les identités vérifiées en sortent. */
  function resync() {
    if (closed) return;
    const entries = presence.read(roomChannel.presenceState());
    dispatch({ type: 'presence', entries, now: now() });
  }

  /** Démasquer, puis relire la présence : elle réapparaît si elle est là. */
  function reveal(userId: string) {
    dispatch({ type: 'unhide', userId });
    if (subscribed) resync();
  }

  function presencePayload(): Record<string, unknown> {
    // Qui je suis, c'est mon jeton qui le dit (pseudo, avatar, look).
    return {
      userId: me.userId,
      gx: position.gx,
      gy: position.gy,
      dir: position.dir,
      ticket: presence.ticket(),
      ...validRest(position),
    };
  }

  function track() {
    if (!subscribed || !visible || closed) return;
    tracked = true;
    presenceGate.tryPass(now());
    void roomChannel.track(presencePayload()).catch(() => {
      /* la présence se renverra au prochain changement de case */
    });
  }

  function untrack() {
    if (!tracked) return Promise.resolve();
    tracked = false;
    return roomChannel.untrack().catch(() => undefined);
  }

  function broadcast(event: string, payload: Record<string, unknown>) {
    void roomChannel
      .send({ type: 'broadcast', event, payload })
      .catch(() => undefined);
  }

  function cancelTimers() {
    if (moveTimer !== null) clearTimer(moveTimer);
    if (presenceTimer !== null) clearTimer(presenceTimer);
    moveTimer = null;
    presenceTimer = null;
    pendingMove = null;
  }

  async function close() {
    if (closed) return;
    closed = true;
    cancelTimers();
    await untrack();
    subscribed = false;
    for (const ch of channels) {
      try {
        await client.removeChannel(ch);
      } catch {
        /* le canal se ferme de toute façon */
      }
    }
    options.onStatus?.('closed');
  }

  function evict(eviction: LibraryEviction) {
    if (closed) return;
    void close().then(() => options.onEvicted(eviction));
  }

  /* ---------------------------------------------- la salle (pairs) --- */

  const roomChannel = client.channel(enter.topics.room, {
    config: {
      private: true,
      presence: { key: me.userId, enabled: true },
      broadcast: { self: false },
    },
  });
  channels.push(roomChannel);
  roomChannel
    .on('presence', { event: 'sync' }, resync)
    .on('broadcast', { event: LIBRARY_PEER_EVENTS.move }, (msg) => {
      const payload = parsePeerPayload(LibraryMovePayload, msg?.payload);
      if (payload) dispatch({ type: 'move', payload, now: now() });
    })
    .on('broadcast', { event: LIBRARY_PEER_EVENTS.emote }, (msg) => {
      const payload = parsePeerPayload(LibraryEmotePayload, msg?.payload);
      if (payload && allowance.emotes.includes(payload.emote)) {
        dispatch({ type: 'emote', payload, now: now() });
      }
    })
    .on('broadcast', { event: LIBRARY_PEER_EVENTS.phrase }, (msg) => {
      const payload = parsePeerPayload(LibraryPhrasePayload, msg?.payload);
      if (payload && allowance.phrases.includes(payload.phraseId)) {
        dispatch({ type: 'phrase', payload, now: now() });
      }
    });

  /* ------------------------------------- les canaux du SERVEUR seul --- */

  const chatChannel = client.channel(enter.topics.chat, {
    config: { private: true },
  });
  channels.push(chatChannel);
  chatChannel.on(
    'broadcast',
    { event: LIBRARY_SERVER_EVENTS.kicked },
    (msg) => {
      const parsed = LibraryKickedPayload.safeParse(msg?.payload);
      if (!parsed.success) return;
      if (parsed.data.userId === me.userId) {
        evict({ kind: 'kicked', until: parsed.data.until });
      } else {
        dispatch({
          type: 'revoke',
          userId: parsed.data.userId,
          until: untilMs(parsed.data.until),
        });
      }
    }
  );

  const tenantChannel = client.channel(enter.topics.tenant, {
    config: { private: true },
  });
  channels.push(tenantChannel);
  tenantChannel.on(
    'broadcast',
    { event: LIBRARY_SERVER_EVENTS.banned },
    (msg) => {
      const parsed = LibraryBannedPayload.safeParse(msg?.payload);
      if (!parsed.success) return;
      if (parsed.data.userId === me.userId) {
        evict({ kind: 'banned', until: parsed.data.until });
      } else {
        dispatch({
          type: 'revoke',
          userId: parsed.data.userId,
          until: untilMs(parsed.data.until),
        });
      }
    }
  );

  const userChannel = client.channel(enter.topics.user, {
    config: { private: true },
  });
  channels.push(userChannel);
  userChannel
    .on('broadcast', { event: LIBRARY_SERVER_EVENTS.hide }, (msg) => {
      const parsed = LibraryHidePayload.safeParse(msg?.payload);
      if (!parsed.success) return;
      dispatch({ type: 'hide', userId: parsed.data.userId });
      if (parsed.data.leaveRoomId === enter.room.id) evict({ kind: 'closed' });
    })
    .on('broadcast', { event: LIBRARY_SERVER_EVENTS.unhide }, (msg) => {
      const parsed = LibraryUnhidePayload.safeParse(msg?.payload);
      if (parsed.success) reveal(parsed.data.userId);
    });

  // Lot 6 — le chat : `message` / `message_hidden` sur le canal serveur de la
  // salle, MA sourdine dans ma boîte (cf. ./chatEvents.ts).
  const onChat = options.onChat;
  if (onChat) {
    bindChatEvents(
      { chat: chatChannel, user: userChannel },
      { roomId: enter.room.id, selfId: me.userId },
      (event) => {
        if (!closed) onChat(event);
      }
    );
  }

  /* --------------------------------------------------- l'abonnement --- */

  options.onStatus?.('connecting');
  void Promise.resolve()
    .then(() => client.setAuth?.())
    .catch(() => undefined)
    .then(() => {
      if (closed) return;
      roomChannel.subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          options.onStatus?.('connected');
          track();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          subscribed = false;
          tracked = false;
          options.onStatus?.('error');
        } else if (status === 'CLOSED') {
          subscribed = false;
          tracked = false;
        }
      });
      chatChannel.subscribe();
      tenantChannel.subscribe();
      userChannel.subscribe();
    });

  /* ----------------------------------------------------- les envois --- */

  function flushMove() {
    moveTimer = null;
    if (!pendingMove || closed || !visible || !subscribed) {
      pendingMove = null;
      return;
    }
    const t = now();
    if (!moveGate.tryPass(t)) {
      moveTimer = setTimer(flushMove, moveGate.waitFor(t));
      return;
    }
    const { gx, gy } = pendingMove;
    const rest = validRest(pendingMove);
    pendingMove = null;
    broadcast(LIBRARY_PEER_EVENTS.move, {
      userId: me.userId,
      gx,
      gy,
      at: t,
      ...rest,
    });
  }

  function flushPresence() {
    presenceTimer = null;
    if (closed || !visible || !subscribed) return;
    const t = now();
    if (!presenceGate.tryPass(t)) {
      presenceTimer = setTimer(flushPresence, presenceGate.waitFor(t));
      return;
    }
    tracked = true;
    void roomChannel.track(presencePayload()).catch(() => undefined);
  }

  function canSend(): boolean {
    return !closed && visible && subscribed;
  }

  return {
    isVisible: () => visible,

    async setVisible(next) {
      if (closed) return;
      const wanted = next && enter.canBeVisible;
      if (wanted === visible) return;
      visible = wanted;
      if (visible) {
        track();
      } else {
        cancelTimers();
        await untrack();
      }
    },

    updatePosition(next) {
      position = { ...next };
      if (!canSend() || presenceTimer !== null) return;
      const t = now();
      if (presenceGate.waitFor(t) === 0) flushPresence();
      else presenceTimer = setTimer(flushPresence, presenceGate.waitFor(t));
    },

    sendMove(gx, gy, rest) {
      if (!canSend()) return 'refused';
      if (
        !Number.isInteger(gx) ||
        !Number.isInteger(gy) ||
        gx < 0 ||
        gy < 0 ||
        gx >= enter.room.width ||
        gy >= enter.room.depth
      ) {
        return 'refused';
      }
      pendingMove = { gx, gy, ...rest };
      if (moveTimer !== null) return 'queued';
      const t = now();
      if (moveGate.waitFor(t) === 0) {
        flushMove();
        return 'sent';
      }
      moveTimer = setTimer(flushMove, moveGate.waitFor(t));
      return 'queued';
    },

    sendEmote(emote) {
      if (!canSend() || !isLibraryEmote(emote)) return false;
      if (!allowance.emotes.includes(emote)) return false;
      if (!socialGate.tryPass(now())) return false;
      broadcast(LIBRARY_PEER_EVENTS.emote, { userId: me.userId, emote });
      return true;
    },

    sendPhrase(phraseId) {
      if (!canSend() || !isLibraryPhrase(phraseId)) return false;
      if (!allowance.phrases.includes(phraseId)) return false;
      if (!socialGate.tryPass(now())) return false;
      broadcast(LIBRARY_PEER_EVENTS.phrase, { userId: me.userId, phraseId });
      return true;
    },

    renewPresence(next) {
      if (closed) return;
      if (presence.renew(next)) resync();
      if (tracked) track();
    },

    presenceSettled: () => presence.idle(),

    hideLocally(userId) {
      dispatch({ type: 'hide', userId });
    },

    unhideLocally(userId) {
      reveal(userId);
    },

    tick() {
      dispatch({ type: 'tick', now: now() });
    },

    getState: () => state,

    close,
  };
}
