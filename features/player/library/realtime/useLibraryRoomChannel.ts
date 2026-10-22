// features/player/library/realtime/useLibraryRoomChannel.ts — entrer dans une
// salle de la Women's Library et y voir les autres (lot 5 de
// docs/PLAN-womens-library.md).
//
//   const room = useLibraryRoomChannel(roomId, { position: spawn });
//   room.avatars        // les AUTRES avatars visibles (jamais soi, jamais
//                       // une personne bloquée — dans un sens ou l'autre —,
//                       // expulsée ou bannie)
//   room.sendMove(gx, gy) / sendEmote('wave') / sendPhrase('gg')
//   room.setVisible(true) // Grande salle de lecture : on entre discrète
//
// 1. `POST rooms/:id/enter` (l'API refuse ce que la policy refuserait, et
//    rend les sujets, ma présence, les personnes masquées, le mode discret) ;
// 2. la connexion aux quatre canaux privés (`./connection.ts`).
// Une expulsion, un bannissement ou une salle refermée FERMENT la connexion
// (`phase: 'evicted'`, `eviction`) : l'écran affiche la notice qui convient
// (`ui/social/SocialNotice.tsx`) — aucune pour un blocage, la salle est
// simplement « fermée ».
//
// Lot 14a : mon jeton de présence (rendu par l'entrée) est RENOUVELÉ par une
// nouvelle entrée, `PRESENCE_RENEW_MARGIN_MS` avant son échéance, et dès que
// mon look change (le jeton porte le look enregistré). Un échec réessaie une
// minute plus tard ; au pire, mon jeton échoit et les autres ne me voient
// plus, sans autre effet.
//
// Le client Realtime et le client HTTP sont injectables (tests, page de
// développement) ; par défaut, supabase-js du navigateur et l'API.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient } from '@/utils/supabaseBrowser';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import type {
  LibraryEnterResponse,
  LibraryPresenceGrant,
} from '../socialResponses';
import {
  clearLibraryChat,
  publishLibraryChatContext,
  publishLibraryChatEvent,
} from './chatBus';
import {
  createLibraryRoomConnection,
  type LibraryChannel,
  type LibraryEviction,
  type LibraryPosition,
  type LibraryRealtimeClient,
  type LibraryRest,
  type LibraryRoomConnection,
  type SendMoveResult,
} from './connection';
import { visibleAvatars, type RemoteAvatar } from './roomState';
import type { LibraryEmoteId, LibraryPhraseId } from './social';
import { librarySocialClient, type LibrarySocialClient } from './socialClient';

/** Adapte le client supabase-js du navigateur à `LibraryRealtimeClient`. */
export function supabaseRealtimeClient(
  client: SupabaseClient
): LibraryRealtimeClient {
  return {
    channel: (topic, options) =>
      client.channel(topic, options) as unknown as LibraryChannel,
    removeChannel: (channel) =>
      client.removeChannel(
        channel as unknown as Parameters<SupabaseClient['removeChannel']>[0]
      ),
    setAuth: () => client.realtime.setAuth(),
  };
}

export type LibraryRoomPhase =
  | 'idle'
  | 'entering'
  | 'connecting'
  | 'connected'
  /** Canal en erreur (jonction refusée par la policy, réseau). */
  | 'error'
  /** L'entrée a été refusée par l'API (`refusal`). */
  | 'refused'
  /** Expulsée, bannie, ou salle refermée pendant la visite (`eviction`). */
  | 'evicted';

export type LibraryRoomRefusal = {
  /** `room_forbidden`, `room_kicked`, `room_not_found`, `LIBRARY_BANNED`… */
  code: string;
  /** Fin d'une expulsion (`room_kicked`). */
  until?: string;
};

export type UseLibraryRoomChannelOptions = {
  enabled?: boolean;
  /**
   * Case de départ, lue à la connexion (ensuite : `updatePosition`). Une
   * fonction la calcule d'après l'entrée (meubles, dimensions de la salle).
   */
  position:
    | LibraryPosition
    | ((enter: LibraryEnterResponse) => LibraryPosition);
  realtime?: LibraryRealtimeClient;
  social?: Pick<LibrarySocialClient, 'enter'>;
  onEvicted?: (eviction: LibraryEviction) => void;
  /** Effacement des bulles échues (ms). */
  tickMs?: number;
  /**
   * Mon look composé (lot 13, forme compacte). Ma présence porte celui de mon
   * JETON (lu en base à l'entrée) : un changement renouvelle le jeton.
   */
  look?: string | null;
};

/** Le jeton est renouvelé à cette marge de son échéance. */
export const PRESENCE_RENEW_MARGIN_MS = 15 * 60_000;
/** Après un renouvellement manqué (réseau), on réessaie après ce délai. */
const PRESENCE_RENEW_RETRY_MS = 60_000;

export type LibraryRoomChannel = {
  phase: LibraryRoomPhase;
  enter: LibraryEnterResponse | null;
  refusal: LibraryRoomRefusal | null;
  eviction: LibraryEviction | null;
  avatars: RemoteAvatar[];
  visible: boolean;
  setVisible: (visible: boolean) => void;
  /** Ma case, ma direction et ma posture (lot 15 : `seat` / `use`). */
  updatePosition: (position: LibraryPosition) => void;
  /** La case visée ; `rest` : ce que j'y ferai (lot 15). */
  sendMove: (gx: number, gy: number, rest?: LibraryRest) => SendMoveResult;
  sendEmote: (emote: LibraryEmoteId) => boolean;
  sendPhrase: (phrase: LibraryPhraseId) => boolean;
  /** Après un blocage confirmé par l'API (`librarySocialClient.block`). */
  hideLocally: (userId: string) => void;
  unhideLocally: (userId: string) => void;
};

function refusalOf(err: unknown): LibraryRoomRefusal {
  if (err instanceof PlayerHttpError) {
    const payload = (err.payload ?? {}) as { code?: unknown; until?: unknown };
    return {
      code: typeof payload.code === 'string' ? payload.code : 'enter_failed',
      ...(typeof payload.until === 'string' ? { until: payload.until } : {}),
    };
  }
  return { code: 'enter_failed' };
}

let defaultRealtime: LibraryRealtimeClient | null = null;
function browserRealtime(): LibraryRealtimeClient {
  defaultRealtime ??= supabaseRealtimeClient(
    supabaseClient as unknown as SupabaseClient
  );
  return defaultRealtime;
}

export function useLibraryRoomChannel(
  roomId: string | null,
  options: UseLibraryRoomChannelOptions
): LibraryRoomChannel {
  const enabled = options.enabled ?? true;
  const [phase, setPhase] = useState<LibraryRoomPhase>('idle');
  const [enter, setEnter] = useState<LibraryEnterResponse | null>(null);
  const [refusal, setRefusal] = useState<LibraryRoomRefusal | null>(null);
  const [eviction, setEviction] = useState<LibraryEviction | null>(null);
  const [avatars, setAvatars] = useState<RemoteAvatar[]>([]);
  const [visible, setVisibleState] = useState(false);
  const connectionRef = useRef<LibraryRoomConnection | null>(null);

  // Lus à la connexion seulement : les changer ne recrée pas les canaux.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  /** Renouveler mon jeton de présence maintenant (lot 14a). */
  const renewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !roomId) {
      setPhase('idle');
      return undefined;
    }
    let cancelled = false;
    let connection: LibraryRoomConnection | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;
    setPhase('entering');
    setRefusal(null);
    setEviction(null);
    setAvatars([]);

    const social = optionsRef.current.social ?? librarySocialClient;
    // Lot 14a : une nouvelle entrée renouvelle mon jeton de présence.
    const scheduleRenew = (grant: LibraryPresenceGrant | null) => {
      if (renewTimer) clearTimeout(renewTimer);
      const life = grant
        ? Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt)
        : Number.NaN;
      const wait = Number.isFinite(life)
        ? Math.max(PRESENCE_RENEW_RETRY_MS, life - PRESENCE_RENEW_MARGIN_MS)
        : PRESENCE_RENEW_RETRY_MS;
      renewTimer = setTimeout(renew, wait);
    };
    const renew = () => {
      if (renewTimer) clearTimeout(renewTimer);
      renewTimer = null;
      social
        .enter(roomId)
        .then((again) => {
          if (cancelled || !connection) return;
          connection.renewPresence(again.presence);
          scheduleRenew(again.presence);
        })
        .catch(() => {
          if (!cancelled) scheduleRenew(null);
        });
    };
    social
      .enter(roomId)
      .then((entered) => {
        if (cancelled) return;
        setEnter(entered);
        // Lot 6 : le fil et les bulles du chat s'abonnent au relais de la
        // salle (./chatBus.ts) — qui je suis, qui je ne vois pas.
        const chatRoom = entered.room.id;
        const selfId = entered.me.userId;
        publishLibraryChatContext(chatRoom, {
          selfId,
          hiddenUserIds: entered.hiddenUserIds,
        });
        const opts = optionsRef.current;
        const start =
          typeof opts.position === 'function'
            ? opts.position(entered)
            : opts.position;
        connection = createLibraryRoomConnection({
          client: opts.realtime ?? browserRealtime(),
          enter: entered,
          position: start,
          onState: (state) => {
            if (cancelled) return;
            setAvatars(visibleAvatars(state));
            // Un blocage (dans un sens ou l'autre) masque aussi ses messages.
            publishLibraryChatContext(chatRoom, {
              selfId,
              hiddenUserIds: state.hidden,
            });
          },
          onChat: (event) => {
            if (!cancelled) publishLibraryChatEvent(chatRoom, event);
          },
          onStatus: (status) => {
            if (cancelled) return;
            if (status === 'connected') setPhase('connected');
            else if (status === 'connecting') setPhase('connecting');
            else if (status === 'error') setPhase('error');
          },
          onEvicted: (ev) => {
            if (cancelled) return;
            setEviction(ev);
            setPhase('evicted');
            setAvatars([]);
            optionsRef.current.onEvicted?.(ev);
          },
        });
        connectionRef.current = connection;
        setVisibleState(connection.isVisible());
        renewRef.current = renew;
        scheduleRenew(entered.presence);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRefusal(refusalOf(err));
        setPhase('refused');
      });

    return () => {
      cancelled = true;
      if (renewTimer) clearTimeout(renewTimer);
      renewRef.current = null;
      connectionRef.current = null;
      if (connection) void connection.close();
      clearLibraryChat(roomId);
    };
  }, [roomId, enabled]);

  // Les bulles échues s'effacent d'elles-mêmes.
  const tickMs = options.tickMs ?? 1_000;
  useEffect(() => {
    if (phase !== 'connected') return undefined;
    const id = setInterval(() => connectionRef.current?.tick(), tickMs);
    return () => clearInterval(id);
  }, [phase, tickMs]);

  const setVisible = useCallback((next: boolean) => {
    const connection = connectionRef.current;
    if (!connection) return;
    void connection.setVisible(next).then(() => {
      setVisibleState(connection.isVisible());
    });
  }, []);

  const updatePosition = useCallback((position: LibraryPosition) => {
    connectionRef.current?.updatePosition(position);
  }, []);

  // Un nouveau look (enregistré pendant la visite) : mon jeton, qui le porte,
  // est renouvelé, et ma présence repart avec lui.
  const look = options.look ?? null;
  const lookRef = useRef(look);
  useEffect(() => {
    if (lookRef.current === look) return;
    lookRef.current = look;
    renewRef.current?.();
  }, [look]);
  const sendMove = useCallback(
    (gx: number, gy: number, rest?: LibraryRest): SendMoveResult =>
      connectionRef.current?.sendMove(gx, gy, rest) ?? 'refused',
    []
  );
  const sendEmote = useCallback(
    (emote: LibraryEmoteId) => connectionRef.current?.sendEmote(emote) ?? false,
    []
  );
  const sendPhrase = useCallback(
    (phrase: LibraryPhraseId) =>
      connectionRef.current?.sendPhrase(phrase) ?? false,
    []
  );
  const hideLocally = useCallback((userId: string) => {
    connectionRef.current?.hideLocally(userId);
  }, []);
  const unhideLocally = useCallback((userId: string) => {
    connectionRef.current?.unhideLocally(userId);
  }, []);

  return {
    phase,
    enter,
    refusal,
    eviction,
    avatars,
    visible,
    setVisible,
    updatePosition,
    sendMove,
    sendEmote,
    sendPhrase,
    hideLocally,
    unhideLocally,
  };
}
