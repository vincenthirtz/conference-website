// features/player/library/hall/clientContext.tsx — le client du hall que les
// hooks utilisent. Par défaut le vrai (`./client.ts`, l'API) ; les tests et
// les pages de développement y substituent un client EN MÉMOIRE.

import { createContext, type ReactNode, useContext } from 'react';
import { type HallClient, hallClient } from './client';

const HallClientContext = createContext<HallClient>(hallClient);

export function HallClientProvider({
  client,
  children,
}: {
  client: HallClient;
  children: ReactNode;
}) {
  return (
    <HallClientContext.Provider value={client}>
      {children}
    </HallClientContext.Provider>
  );
}

export function useHallClient(): HallClient {
  return useContext(HallClientContext);
}
