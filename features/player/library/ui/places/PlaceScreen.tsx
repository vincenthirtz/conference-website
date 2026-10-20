// features/player/library/ui/places/PlaceScreen.tsx — un LIEU COMMUN par son
// nom, `/player/library?place=hall|reading_room` (lot 7 de
// docs/PLAN-womens-library.md).
//
//   1. LA PORTE, comme l'appartement : tant que `me` refuse (attestation,
//      mineure connue, bannie), rien d'autre — la salle n'est pas demandée ;
//   2. LA SALLE : `POST rooms/common` la trouve (ou la crée, une par espace),
//      puis l'écran d'une salle (`RoomScreen`) y entre, décor fixe compris.
// L'adresse reste `?place=` : elle se partage et ne vieillit pas.

import { type ReactNode, useMemo } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button, PageHeader } from '@/features/ruban';
import { useCommonRoom } from '../../hall/useHall';
import { useLibraryActions } from '../../hooks/useLibraryActions';
import { useLibraryHome } from '../../hooks/useLibraryHome';
import type { LibraryPlace } from '../../roomStageModel';
import LibraryGate from '../gate/LibraryGate';
import RoomScreen from '../room/RoomScreen';
import { TEXT_ERROR, TEXT_MUTED } from '../social/shared';
import PlacesNav from './PlacesNav';

export default function PlaceScreen({ place }: { place: LibraryPlace }) {
  const t = useT(nsPlayerLibrary);
  const th = useT(nsHall);
  const home = useLibraryHome();
  const actions = useLibraryActions();
  const ready = home.gate === 'ready';
  const common = useCommonRoom(place, ready);
  const title = useMemo(
    () => (place === 'hall' ? th.places.hall : th.places.readingRoom),
    [place, th]
  );

  if (ready && common.data)
    return <RoomScreen key={common.data.roomId} roomId={common.data.roomId} />;

  let body: ReactNode;
  if (home.gate === 'loading' || (ready && common.isPending)) {
    body = (
      <p role="status" className={TEXT_MUTED}>
        {th.placeScreen.loading}
      </p>
    );
  } else if (home.gate !== 'ready') {
    body = (
      <LibraryGate
        gate={home.gate}
        attesting={actions.attesting}
        onAttest={actions.attest}
        onRetry={home.retry}
      />
    );
  } else {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-4">
        <p className={TEXT_ERROR}>{th.placeScreen.error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void common.refetch()}
        >
          {th.placeScreen.retry}
        </Button>
      </div>
    );
  }

  return (
    <main
      className="pt-header pb-16"
      aria-busy={home.gate === 'loading' || (ready && common.isPending)}
      data-gate={home.gate}
      data-place={place}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <PageHeader title={title} subtitle={t.title} />
        {ready && <PlacesNav current={place} />}
        {body}
      </div>
    </main>
  );
}
