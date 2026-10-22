// features/player/library/ui/places/PlaceScreen.tsx — un LIEU COMMUN par son
// nom, `/player/library?place=hall|reading_room` (lot 7 de
// docs/PLAN-womens-library.md).
//
//   1. LA PORTE, comme l'appartement : tant que `me` refuse (attestation,
//      mineure connue, bannie), rien d'autre — la salle n'est pas demandée ;
//   2. LA SALLE : `POST rooms/common` la trouve (ou la crée, une par espace),
//      puis l'écran d'une salle (`RoomScreen`) y entre, décor fixe compris.
// L'adresse reste `?place=` : elle se partage et ne vieillit pas.
//
// L'ARÈNE (`?place=arena`, lot 12 de docs/PLAN-tcg-2.md) passe par la même
// porte, sans salle : une fois la porte franchie, son écran (`ArenaApp`) est
// chargé À LA DEMANDE — moteur, cartes et textes hors du premier chargement
// de `/player/library` (gel de scripts/bundle-budget.mjs).

import dynamic from 'next/dynamic';
import { type ReactNode, useMemo } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button, PageHeader } from '@/features/ruban';
import { useCommonRoom } from '../../hall/useHall';
import { useLibraryActions } from '../../hooks/useLibraryActions';
import { useLibraryHome } from '../../hooks/useLibraryHome';
import type { LibraryDestination } from '../../roomStageModel';
import LibraryGate from '../gate/LibraryGate';
import RoomScreen from '../room/RoomScreen';
import { TEXT_ERROR, TEXT_MUTED } from '../social/shared';
import PlacesNav from './PlacesNav';

const ArenaApp = dynamic(() => import('../arena/ArenaApp'), { ssr: false });

export default function PlaceScreen({ place }: { place: LibraryDestination }) {
  const t = useT(nsPlayerLibrary);
  const th = useT(nsHall);
  const home = useLibraryHome();
  const actions = useLibraryActions();
  const ready = home.gate === 'ready';
  const arena = place === 'arena';
  // L'arène n'a pas de salle : rien n'est demandé (requête désactivée).
  const common = useCommonRoom(arena ? 'hall' : place, ready && !arena);
  const roomPending = ready && !arena && common.isPending;
  const title = useMemo(
    () =>
      place === 'hall'
        ? th.places.hall
        : place === 'arena'
          ? th.doors.arena
          : th.places.readingRoom,
    [place, th]
  );

  // Pour l'arène, la clé désactivée est celle du hall : son cache (venue du
  // hall) ne doit jamais ouvrir le hall à sa place.
  if (ready && !arena && common.data)
    return <RoomScreen key={common.data.roomId} roomId={common.data.roomId} />;

  let body: ReactNode;
  if (home.gate === 'loading' || roomPending) {
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
  } else if (arena) {
    body = <ArenaApp />;
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
      aria-busy={home.gate === 'loading' || roomPending}
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
