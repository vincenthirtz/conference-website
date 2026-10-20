// features/player/library/dev/DevApartmentHarness.tsx — l'écran « Mon
// appartement » branché sur le client EN MÉMOIRE (`./fakeClient.ts`), pour la
// page de développement `/dev/library-apartment` (404 en production).
//
// Un cache de requêtes PROPRE à la démo : il ne se mélange jamais à celui de
// l'espace joueuse (mêmes clés, autres données).
//
// Lot 5 phase B : le multijoueur aussi est EN MÉMOIRE (aucun réseau). Ouvert
// à toutes (Réglages), l'appartement rejoint son canal simulé : une visiteuse
// (Iris) y marche et fait des signes ; son menu propose d'expulser.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LibraryClientProvider } from '../clientContext';
import { LibrarySocialProvider } from '../socialContext';
import ApartmentScreen from '../ui/apartment/ApartmentScreen';
import { createFakeLibraryClient, DEV_APARTMENT_ITEMS } from './fakeClient';
import { createFakeRealtime, fakeEnterResponse } from './fakeRealtime';
import { createFakeSocialClient } from './fakeSocialClient';
import { useSimulatedPeers } from './simulatedPeers';

/** L'identifiant de l'appartement du client en mémoire. */
const DEV_ROOM_ID = 'dev-room';

export default function DevApartmentHarness() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      })
  );
  const [client] = useState(() => createFakeLibraryClient());
  const [bus] = useState(createFakeRealtime);
  const deps = useMemo(() => {
    const base = fakeEnterResponse('apartment');
    const enter = fakeEnterResponse('apartment', {
      room: { ...base.room, id: DEV_ROOM_ID, isOwner: true },
    });
    return {
      realtime: bus.client,
      enter: { enter: async () => enter },
      actions: createFakeSocialClient({ bus, enter }),
    };
  }, [bus]);
  useSimulatedPeers(
    bus,
    {
      topic: `library:room:${DEV_ROOM_ID}`,
      kind: 'apartment',
      width: 14,
      depth: 12,
      items: DEV_APARTMENT_ITEMS,
    },
    1
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LibraryClientProvider client={client}>
        <LibrarySocialProvider deps={deps}>
          <ApartmentScreen />
        </LibrarySocialProvider>
      </LibraryClientProvider>
    </QueryClientProvider>
  );
}
