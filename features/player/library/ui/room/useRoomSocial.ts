// features/player/library/ui/room/useRoomSocial.ts — ce que l'écran d'une
// salle branche autour du moteur (lot 5 phase B de
// docs/PLAN-womens-library.md) : les autres joueuses traduites pour le moteur,
// ma bulle quand mon signe PART (l'envoi rend `true`), le repère « discrète »,
// le menu d'un avatar (ouvert d'un appui dans la vue ou depuis la liste des
// présentes, et gardé dans le cadre) et le signalement.
//
// Les gestes de sécurité passent par `useLibrarySocialActions` (l'API) : un
// `userId` lu dans la présence n'est qu'un identifiant à soumettre.

import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import type { AvatarTap } from '../../engine/controller';
import type { BubbleContent } from '../../engine/remotes';
import {
  type LibrarySocialActionsClient,
  useLibrarySocialActions,
} from '../../hooks/useLibrarySocialActions';
import type { RemoteAvatar } from '../../realtime/roomState';
import type { LibraryEmoteId, LibraryPhraseId } from '../../realtime/social';
import type { LibraryRoomChannel } from '../../realtime/useLibraryRoomChannel';
import {
  bubbleContentOf,
  clampMenuAnchor,
  type Sign,
  type SignWords,
  toRemoteInputs,
} from '../../roomStageModel';
import type { RoomEngineHandle } from '../apartment/ApartmentView';
import type { SocialTarget } from '../social/AvatarContextMenu';
import { LIBRARY_EMOTE_GLYPHS } from '../social/emoteGlyphs';

export type RoomMenuState = {
  target: SocialTarget;
  /** Coin haut-gauche du menu, dans le cadre de la scène (px CSS). */
  anchor: { x: number; y: number };
  /** Où rendre le focus : la ligne de la liste, ou le cadre de la scène. */
  returnFocusRef: RefObject<HTMLElement | null>;
};

export type RoomReportState = {
  target: SocialTarget;
  returnFocusRef: RefObject<HTMLElement | null>;
};

export function useRoomSocial({
  room,
  actionsClient,
  frameRef,
  engineRef,
}: {
  room: LibraryRoomChannel;
  actionsClient?: LibrarySocialActionsClient;
  /** Le cadre POSITIONNÉ de la scène : parent du menu, retour du focus. */
  frameRef: RefObject<HTMLElement | null>;
  engineRef: RefObject<RoomEngineHandle | null>;
}) {
  const t = useT(nsSocial);
  const actions = useLibrarySocialActions({ room, client: actionsClient });
  const words = useMemo<SignWords>(
    () => ({
      emotes: t.emotes,
      phrases: t.phrases,
      glyphs: LIBRARY_EMOTE_GLYPHS,
    }),
    [t]
  );
  const remote = useMemo(
    () => toRemoteInputs(room.avatars, words),
    [room.avatars, words]
  );
  const avatarsRef = useRef(room.avatars);
  avatarsRef.current = room.avatars;

  /* ------------------------------------------------- mes signes --- */

  const [playerBubble, setPlayerBubble] = useState<BubbleContent | null>(null);
  const seq = useRef(0);
  const { sendEmote: emote, sendPhrase: phrase } = room;
  const showMine = useCallback(
    (sign: Sign) => {
      seq.current += 1;
      setPlayerBubble(bubbleContentOf(sign, words, `me:${seq.current}`));
    },
    [words]
  );
  const sendEmote = useCallback(
    (id: LibraryEmoteId) => {
      const ok = emote(id);
      if (ok) showMine({ type: 'emote', id });
      return ok;
    },
    [emote, showMine]
  );
  const sendPhrase = useCallback(
    (id: LibraryPhraseId) => {
      const ok = phrase(id);
      if (ok) showMine({ type: 'phrase', id });
      return ok;
    },
    [phrase, showMine]
  );

  /* ---------------------------------------- le menu, le signalement --- */

  const [menu, setMenu] = useState<RoomMenuState | null>(null);
  const [report, setReport] = useState<RoomReportState | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const frameSize = useCallback(() => {
    const el = frameRef.current;
    return el
      ? { width: el.clientWidth, height: el.clientHeight }
      : { width: 0, height: 0 };
  }, [frameRef]);

  /** Appui sur une joueuse dans la vue. */
  const onAvatarTap = useCallback(
    (tap: AvatarTap) => {
      const a = avatarsRef.current.find((x) => x.userId === tap.userId);
      if (!a) return;
      setMenu({
        target: { userId: a.userId, nickname: a.nickname },
        anchor: clampMenuAnchor(tap.anchor, frameSize()),
        returnFocusRef: frameRef,
      });
    },
    [frameRef, frameSize]
  );

  /** Une ligne de la liste des présentes : le menu se pose près de son avatar. */
  const openFromList = useCallback(
    (a: RemoteAvatar, trigger: HTMLElement) => {
      triggerRef.current = trigger;
      const head = engineRef.current?.avatarAnchor(a.userId) ?? { x: 0, y: 0 };
      setMenu({
        target: { userId: a.userId, nickname: a.nickname },
        anchor: clampMenuAnchor(head, frameSize()),
        returnFocusRef: triggerRef,
      });
    },
    [engineRef, frameSize]
  );

  const closeMenu = useCallback(() => setMenu(null), []);
  const openReport = useCallback(
    (target: SocialTarget) => {
      setReport({ target, returnFocusRef: menu?.returnFocusRef ?? frameRef });
      setMenu(null);
    },
    [menu, frameRef]
  );
  const closeReport = useCallback(() => setReport(null), []);

  // Pas visible (Grande salle de lecture, discrète) : je le sais d'un coup d'œil.
  const marker =
    room.phase === 'connected' && !room.visible ? t.room.discreetMarker : null;

  return {
    actions,
    remote,
    playerBubble,
    sendEmote,
    sendPhrase,
    marker,
    menu,
    report,
    onAvatarTap,
    openFromList,
    closeMenu,
    openReport,
    closeReport,
  };
}

export type RoomSocial = ReturnType<typeof useRoomSocial>;
