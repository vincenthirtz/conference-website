// features/player/library/ui/hall/HallExtras.tsx — ce que le hall ajoute SOUS
// la scène (lot 7 de docs/PLAN-womens-library.md). Monté dans l'emplacement
// « Lot 7 » de `ui/room/RoomExtras` ; ne rend RIEN hors du hall.
//
// C'est le chemin COMPLET sans canvas, pour le clavier et les lecteurs
// d'écran :
//   1. le panneau d'annonces : la liste (relue à chaque entrée dans le hall),
//      « Lire » ouvre l'article dans un dialogue ;
//   2. les portes (`HallDoors`) : la Grande salle de lecture (un lieu), les
//      appartements ouverts et les QG d'équipe (des panneaux).
// Un appui sur une zone DANS LA VUE (`layouts/hall.ts`, `HALL_HOTSPOTS`)
// arrive par `hall/spotRequests` et ouvre le MÊME panneau, ou le même lieu.
// Un seul panneau ouvert à la fois.

import Router from 'next/router';
import { useCallback, useContext, useEffect, useId, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { subscribeHallSpots } from '../../hall/spotRequests';
import type { LibraryHallAnnouncement } from '../../hallResponses';
import { placeHref } from '../../roomStageModel';
import type { LibraryRoomKind } from '../../socialResponses';
import PlaceDialog from '../places/PlaceDialog';
import { TEXT_MUTED } from '../social/shared';
import TeamHqDoor from '../teamHq/TeamHqDoor';
import { AnnouncementList, BoardPanel } from './AnnouncementBoard';
import HallDoors, { type HallPanel, hallDoorOf } from './HallDoors';
import OpenApartmentsList from './OpenApartmentsList';

/** L'id du titre de `TeamHqDoor` (lot 9), qui nomme son dialogue. */
const TEAM_HQ_DOOR_TITLE = 'team-hq-door-title';

type Open = { panel: HallPanel; article?: LibraryHallAnnouncement };

export type HallExtrasProps = {
  room: { kind: LibraryRoomKind };
  /** Changer de lieu ; défaut `Router.push` (les tests l'injectent). */
  navigate?: (href: string) => void;
};

export default function HallExtras({ room, navigate }: HallExtrasProps) {
  // Sans cache joueuse (un écran hors page Next), le hall se tait au lieu de
  // lever — comme la porte des QG (lot 9).
  const queryClient = useContext(QueryClientContext);
  if (room.kind !== 'hall' || !queryClient) return null;
  return <HallPanelView navigate={navigate} />;
}

function HallPanelView({ navigate }: { navigate?: (href: string) => void }) {
  const t = useT(nsHall);
  const ids = useId();
  const [open, setOpen] = useState<Open | null>(null);
  const go = useCallback(
    (href: string) => (navigate ? navigate(href) : void Router.push(href)),
    [navigate]
  );

  // Un appui sur une zone de la vue ouvre le même panneau, ou le même lieu.
  useEffect(
    () =>
      subscribeHallSpots((id) => {
        if (id === 'board') return setOpen({ panel: 'board' });
        const door = hallDoorOf(id);
        if (!door) return;
        if (door.action.kind === 'place') go(placeHref(door.action.place));
        else setOpen({ panel: door.action.panel });
      }),
    [go]
  );

  const boardTitle = `${ids}-board`;
  const panelTitle = `${ids}-panel`;
  const close = () => setOpen(null);

  return (
    <div className="grid gap-6 md:grid-cols-2" data-hall="">
      <section
        aria-labelledby={boardTitle}
        className="flex flex-col gap-3"
        data-hall-board=""
      >
        <h2
          id={boardTitle}
          className="text-lg font-bold text-[var(--t1,#f4edf7)]"
        >
          {t.board.title}
        </h2>
        <p className={TEXT_MUTED}>{t.board.intro}</p>
        <AnnouncementList
          onRead={(article) => setOpen({ panel: 'board', article })}
        />
      </section>

      <HallDoors onOpen={(action) => setOpen({ panel: action.panel })} />

      {open?.panel === 'board' && (
        <PlaceDialog labelledBy={panelTitle} panel="board" onClose={close}>
          <BoardPanel headingId={panelTitle} initial={open.article ?? null} />
        </PlaceDialog>
      )}
      {open?.panel === 'apartments' && (
        <PlaceDialog labelledBy={panelTitle} panel="apartments" onClose={close}>
          <OpenApartmentsList headingId={panelTitle} />
        </PlaceDialog>
      )}
      {open?.panel === 'team_hq' && (
        // Lot 9 — QG : la porte des QG de mes équipes.
        <PlaceDialog
          labelledBy={TEAM_HQ_DOOR_TITLE}
          panel="team_hq"
          onClose={close}
        >
          <TeamHqDoor headingLevel={2} onNavigate={go} />
        </PlaceDialog>
      )}
    </div>
  );
}
