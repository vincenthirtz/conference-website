// features/player/library/ui/room/RoomStage.tsx — une salle de la Women's
// Library OÙ L'ON ENTRE, avec les autres joueuses (lot 5 phase B de
// docs/PLAN-womens-library.md).
//
//   1. `useLibraryRoomChannel` : `POST rooms/:id/enter` (meubles, décor, mon
//      avatar, discrétion), puis les canaux privés ;
//   2. le moteur (chargé à la demande, `ssr: false`, le même chunk que
//      l'appartement) en mode `walk` : un appui sur le sol marche ET envoie la
//      case visée (`sendMove`), l'arrivée rafraîchit ma présence
//      (`updatePosition`), un appui sur une autre joueuse ouvre son menu ;
//   3. sous la scène : mode discret (salle de lecture), signes, « Présentes
//      dans la salle » — l'accès clavier aux avatars ;
//   4. (lot 15) les meubles : un appui sur une assise, un lit, un rayonnage…
//      y fait aller, puis s'asseoir, s'allonger ou s'en servir ; la case
//      visée et la présence portent la posture ; « Se lever » sous la scène.
//      Pas d'éditeur de look ici : l'armoire n'est pas proposée ;
//   5. (lot 16) la saison, lue à l'entrée et à la demande
//      (`../hall/useHallSeason`) : pendant l'Event Halloween, les citrouilles
//      du hall, leur zone et le fantôme.
// Une entrée refusée, une expulsion, un bannissement, une salle refermée :
// la notice remplace la salle, avec le retour à mon appartement.
//
// Les clients (Realtime, entrée, gestes) viennent du contexte
// (`socialContext`), ou des props : les pages de développement et les tests
// y mettent des clients en mémoire.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import { Button } from '@/features/ruban';
import type { Specs } from '../../editing/layout';
import type { LibraryPosition } from '../../realtime/connection';
import { LIBRARY_BUBBLE_MS } from '../../realtime/social';
import { useLibraryRoomChannel } from '../../realtime/useLibraryRoomChannel';
import { roomStartPosition, sceneOf } from '../../roomStageModel';
import {
  type LibrarySocialDeps,
  useLibrarySocialDeps,
} from '../../socialContext';
import { socialNoticeOf } from '../../socialModel';
import type { LibraryEnterResponse } from '../../socialResponses';
import type { RoomEngineHandle } from '../apartment/ApartmentView';
import { useChatBubbles } from '../chat/useChatBubbles';
import { useHallSeason } from '../hall/useHallSeason';
import { useRoomHotspots } from '../places/useRoomHotspots';
import { LINK } from '../social/shared';
import SocialNotice from '../social/SocialNotice';
import RoomOverlays from './RoomOverlays';
import RoomSocialPanel from './RoomSocialPanel';
import { useRoomSocial } from './useRoomSocial';

const STAGE_BOX =
  'h-[min(68vh,560px)] min-h-[320px] w-full rounded-[var(--r-card,14px)] bg-[#17131b]';

const RoomView = dynamic(() => import('../apartment/ApartmentView'), {
  ssr: false,
  loading: () => <div className={`${STAGE_BOX} animate-pulse`} />,
});

export type RoomStageProps = LibrarySocialDeps & {
  roomId: string;
  /** Empreintes du catalogue : ma case de départ évite les meubles. */
  specs: Specs;
  /** Le retour proposé par une notice (mon appartement). */
  backHref: string;
  /** Mon look composé (lot 13, forme compacte) : la vue et ma présence. */
  look?: string | null;
  /** La salle est ouverte : nom, sorte, propriétaire (l'écran s'y adapte). */
  onEnter?: (enter: LibraryEnterResponse) => void;
  /** Développement (lot 16) : l'instant des saisons ; défaut, l'entrée. */
  seasonAt?: number;
};

export default function RoomStage(props: RoomStageProps) {
  // « Réessayer » remonte la salle : nouvelle entrée, nouveaux canaux.
  const [attempt, setAttempt] = useState(0);
  return (
    <RoomStageInner
      key={attempt}
      {...props}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function RoomStageInner({
  roomId,
  specs,
  backHref,
  look = null,
  onEnter,
  onRetry,
  seasonAt,
  ...override
}: RoomStageProps & { onRetry: () => void }) {
  const t = useT(nsSocial);
  const ctx = useLibrarySocialDeps();
  const posRef = useRef<LibraryPosition | null>(null);
  const specsRef = useRef(specs);
  specsRef.current = specs;

  const room = useLibraryRoomChannel(roomId, {
    // Ma présence part de la case où le moteur me pose.
    position: (entered) =>
      posRef.current ?? roomStartPosition(entered, specsRef.current),
    realtime: override.realtime ?? ctx.realtime,
    social: override.enter ?? ctx.enter,
    look,
  });
  const frameRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RoomEngineHandle | null>(null);
  const social = useRoomSocial({
    room,
    actionsClient: override.actions ?? ctx.actions,
    frameRef,
    engineRef,
  });
  // Lot 6 — les messages du chat en bulles au-dessus des avatars.
  const bubbles = useChatBubbles({
    roomId: room.enter?.room.id ?? null,
    remote: social.remote,
    playerBubble: social.playerBubble,
  });

  const { enter } = room;
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  useEffect(() => {
    if (enter) onEnterRef.current?.(enter);
  }, [enter]);
  // Lot 7 — une salle commune (hall, salle de lecture) prend son décor fixe
  // (`layouts/*`, `enter` n'y rend aucun meuble) ; ses zones vont au moteur.
  // Lot 16 — la saison lue à l'entrée : citrouilles, leur zone et le fantôme.
  const kind = enter?.room.kind ?? null;
  const { season, npc } = useHallSeason(kind, enter, seasonAt);
  const scene = useMemo(
    () => (enter ? sceneOf(enter, season?.items) : null),
    [enter, season]
  );
  const spots = useRoomHotspots(kind, undefined, season);

  const notice = socialNoticeOf(room);
  if (notice) {
    const retry = notice.kind === 'connection' || notice.kind === 'error';
    return (
      <div data-library-room="" data-phase={room.phase}>
        <SocialNotice
          notice={notice}
          action={
            <>
              {retry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  {t.room.retry}
                </Button>
              )}
              <Link prefetch={false} href={backHref} className={LINK}>
                {t.room.backToApartment}
              </Link>
            </>
          }
        />
      </div>
    );
  }

  if (!enter) {
    return (
      <div
        data-library-room=""
        data-phase={room.phase}
        className="flex flex-col gap-2"
      >
        <div className={`${STAGE_BOX} animate-pulse`} />
        <p role="status" className="text-sm text-[var(--t2,#c7bfca)]">
          {t.room.loading}
        </p>
      </div>
    );
  }

  return (
    <div
      data-library-room=""
      data-phase={room.phase}
      data-room-kind={enter.room.kind}
      className="flex flex-col gap-4"
    >
      {/* Cadre POSITIONNÉ : le menu d'un avatar s'y pose ; il reprend le
          focus quand le menu ouvert d'un appui se ferme. */}
      <div ref={frameRef} tabIndex={-1} className="relative outline-none">
        <RoomView
          room={scene?.room ?? enter.room}
          items={scene?.items ?? enter.items}
          fixed={scene?.fixed}
          hotspots={spots.hotspots}
          onHotspotTap={spots.onHotspotTap}
          npc={npc}
          specs={specs}
          avatarId={enter.me.avatarId}
          look={look}
          labels={{
            canvas: t.room.canvasLabel,
            loading: t.room.loading,
            resetView: t.room.resetView,
          }}
          remote={bubbles.remote}
          playerBubble={bubbles.playerBubble}
          playerMarker={social.marker}
          bubbleMs={LIBRARY_BUBBLE_MS}
          onAvatarTap={social.onAvatarTap}
          // Lot 15 : la vue envoie la case visée et ma présence (posture
          // comprise), et montre « Se lever » sous la scène.
          furniture={{ room, posRef }}
          engineRef={engineRef}
        />
        <RoomOverlays social={social} room={enter.room} />
      </div>
      <p className="text-xs text-[var(--t3,#a39ba6)]">{t.room.hint}</p>
      <RoomSocialPanel room={room} social={social} kind={enter.room.kind} />
    </div>
  );
}
