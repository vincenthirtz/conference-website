// features/player/library/dev/DevApartmentHarness.tsx — l'écran « Mon
// appartement » branché sur le client EN MÉMOIRE (`./fakeClient.ts`), pour la
// page de développement `/dev/library-apartment` (404 en production).
//
// Un cache de requêtes PROPRE à la démo : il ne se mélange jamais à celui de
// l'espace joueuse (mêmes clés, autres données).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { LibraryClientProvider } from '../clientContext';
import ApartmentScreen from '../ui/apartment/ApartmentScreen';
import { createFakeLibraryClient } from './fakeClient';

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
  return (
    <QueryClientProvider client={queryClient}>
      <LibraryClientProvider client={client}>
        <ApartmentScreen />
      </LibraryClientProvider>
    </QueryClientProvider>
  );
}
