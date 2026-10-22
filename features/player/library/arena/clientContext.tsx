// features/player/library/arena/clientContext.tsx — le client de l'arène que
// les écrans utilisent. Par défaut le vrai (`./client.ts`, l'API) ; les tests
// y substituent un client qui rend des réponses FIGÉES de l'API.

import { createContext, type ReactNode, useContext } from 'react';
import { type ArenaClient, arenaClient } from './client';

const ArenaClientContext = createContext<ArenaClient>(arenaClient);

export function ArenaClientProvider({
  client,
  children,
}: {
  client: ArenaClient;
  children: ReactNode;
}) {
  return (
    <ArenaClientContext.Provider value={client}>
      {children}
    </ArenaClientContext.Provider>
  );
}

export function useArenaClient(): ArenaClient {
  return useContext(ArenaClientContext);
}
