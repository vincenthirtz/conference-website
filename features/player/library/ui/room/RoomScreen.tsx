// features/player/library/ui/room/RoomScreen.tsx — visiter une salle de la
// Women's Library par son adresse, `/player/library?room=<uuid>` (lot 5
// phase B de docs/PLAN-womens-library.md). En attendant le hall (lot 7), c'est
// ainsi que deux joueuses se retrouvent : l'une partage le lien de son
// appartement ouvert (Réglages), l'autre l'ouvre.
//
//   1. LA PORTE, comme l'appartement : tant que `me` refuse (attestation,
//      mineure connue, bannie), rien d'autre ;
//   2. LA SALLE (`RoomStage`), une fois le catalogue lu (empreintes : ma case
//      de départ évite les meubles).
// Ma PROPRE adresse d'appartement ramène à l'appartement (le mode déco y est).

import Link from 'next/link';
import { useRouter } from 'next/router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import { Button, PageHeader } from '@/features/ruban';
import { useLibraryActions } from '../../hooks/useLibraryActions';
import { useLibraryHome } from '../../hooks/useLibraryHome';
import { placementSpecsOf } from '../../model';
import type { LibraryRoomView } from '../../socialResponses';
import { lookCodeOf } from '../avatar/lookModel';
import LibraryGate from '../gate/LibraryGate';
import PlacesNav, { placeOfKind } from '../places/PlacesNav';
import { LINK } from '../social/shared';
import RoomExtras from './RoomExtras';
import RoomStage from './RoomStage';

const APARTMENT_HREF = '/player/library';

export default function RoomScreen({ roomId }: { roomId: string }) {
  const t = useT(nsPlayerLibrary);
  const ts = useT(nsSocial);
  const router = useRouter();
  const home = useLibraryHome();
  const actions = useLibraryActions();
  const [room, setRoom] = useState<LibraryRoomView | null>(null);
  const specs = useMemo(
    () => placementSpecsOf(home.catalog?.furniture ?? []),
    [home.catalog]
  );

  // Mon appartement par son lien : l'écran de l'appartement, pas une visite.
  useEffect(() => {
    if (room?.kind === 'apartment' && room.isOwner)
      void router.replace(APARTMENT_HREF);
  }, [room, router]);

  const name = room ? (room.name ?? ts.room.names[room.kind]) : null;

  let body: ReactNode;
  if (home.gate === 'loading') {
    body = <p className="text-sm text-[var(--t2,#c7bfca)]">{t.loading}</p>;
  } else if (home.gate !== 'ready') {
    body = (
      <LibraryGate
        gate={home.gate}
        attesting={actions.attesting}
        onAttest={actions.attest}
        onRetry={home.retry}
      />
    );
  } else if (home.catalogFailed) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-[var(--err,#ff6b6b)]">{t.loadError}</p>
        <Button variant="secondary" size="sm" onClick={home.retry}>
          {t.retry}
        </Button>
      </div>
    );
  } else if (!home.catalog) {
    body = <p className="text-sm text-[var(--t2,#c7bfca)]">{t.loading}</p>;
  } else {
    body = (
      <RoomStage
        roomId={roomId}
        specs={specs}
        backHref={APARTMENT_HREF}
        look={lookCodeOf(home.me?.avatar)}
        onEnter={(entered) => setRoom(entered.room)}
      />
    );
  }

  return (
    <main
      className="pt-header pb-16"
      aria-busy={home.gate === 'loading'}
      data-gate={home.gate}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <PageHeader
          title={name ?? t.title}
          subtitle={ts.room.visiting}
          actions={
            <Link prefetch={false} href={APARTMENT_HREF} className={LINK}>
              {t.myApartment}
            </Link>
          }
        />
        {/* Lot 7 — les lieux (appartement, hall, salle de lecture, QG). */}
        {home.gate === 'ready' ? (
          <PlacesNav current={room ? placeOfKind(room.kind) : null} />
        ) : null}
        {body}
        {room && home.gate === 'ready' ? <RoomExtras room={room} /> : null}
      </div>
    </main>
  );
}
