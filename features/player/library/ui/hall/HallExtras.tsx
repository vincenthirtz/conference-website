// features/player/library/ui/hall/HallExtras.tsx — ce que le hall ajoute SOUS
// la scène (lot 7 de docs/PLAN-womens-library.md). Monté dans l'emplacement
// « Lot 7 » de `ui/room/RoomExtras` ; ne rend RIEN hors du hall.
//
// C'est le chemin COMPLET sans canvas, pour le clavier et les lecteurs
// d'écran :
//   1. le panneau d'annonces : la liste (relue à chaque entrée dans le hall),
//      « Lire » ouvre l'article dans un dialogue ;
//   2. le tableau du tournoi en cours, juste dessous : « Voir le tableau »
//      l'ouvre dans un dialogue (`TournamentBoardPanel`, CHARGÉ À LA DEMANDE —
//      jamais d'import statique ici, garde :
//      tests/unit/libraryHallTournament.test.tsx) ;
//   3. les portes (`HallDoors`) : la Grande salle de lecture (un lieu), les
//      appartements ouverts et les QG d'équipe (des panneaux).
// Un appui sur une zone DANS LA VUE (`layouts/hall.ts`, `HALL_HOTSPOTS`)
// arrive par `hall/spotRequests` et ouvre le MÊME panneau, ou le même lieu.
// Un seul panneau ouvert à la fois.

import dynamic from 'next/dynamic';
import Router from 'next/router';
import { useCallback, useContext, useEffect, useId, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button } from '@/features/ruban';
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

// Le tableau du tournoi : ses lectures, le classement de la landing et le
// panneau ne partent qu'à l'ouverture (/player/library est la page la plus
// lourde du site).
const TournamentBoardPanel = dynamic(() => import('./TournamentBoardPanel'), {
  ssr: false,
  loading: () => <TournamentOpening />,
});

function TournamentOpening() {
  const t = useT(nsHall);
  return (
    <p role="status" className={TEXT_MUTED}>
      {t.tournament.opening}
    </p>
  );
}

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
        if (id === 'tournament_board') return setOpen({ panel: 'tournament' });
        const door = hallDoorOf(id);
        if (!door) return;
        if (door.action.kind === 'place') go(placeHref(door.action.place));
        else setOpen({ panel: door.action.panel });
      }),
    [go]
  );

  const boardTitle = `${ids}-board`;
  const tournamentTitle = `${ids}-tournament`;
  const panelTitle = `${ids}-panel`;
  const close = () => setOpen(null);

  return (
    <div className="grid gap-6 md:grid-cols-2" data-hall="">
      <div className="flex flex-col gap-6">
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

        <section
          aria-labelledby={tournamentTitle}
          className="flex flex-col gap-3"
          data-hall-tournament=""
        >
          <h2
            id={tournamentTitle}
            className="text-lg font-bold text-[var(--t1,#f4edf7)]"
          >
            {t.tournament.title}
          </h2>
          <p className={TEXT_MUTED}>{t.tournament.intro}</p>
          <Button
            size="sm"
            variant="secondary"
            className="w-fit"
            aria-haspopup="dialog"
            onClick={() => setOpen({ panel: 'tournament' })}
          >
            {t.tournament.open}
          </Button>
        </section>
      </div>

      <HallDoors onOpen={(action) => setOpen({ panel: action.panel })} />

      {open?.panel === 'tournament' && (
        <PlaceDialog labelledBy={panelTitle} panel="tournament" onClose={close}>
          <div className="flex flex-col gap-4">
            <h2
              id={panelTitle}
              tabIndex={-1}
              className="text-lg font-bold text-[var(--t1,#f4edf7)] outline-none"
            >
              {t.tournament.title}
            </h2>
            <TournamentBoardPanel />
          </div>
        </PlaceDialog>
      )}
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
