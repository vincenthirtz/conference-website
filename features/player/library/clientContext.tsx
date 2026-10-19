// features/player/library/clientContext.tsx — le client de la Library que les
// hooks utilisent. Par défaut le vrai (`./client.ts`, l'API) ; la page de
// développement `/dev/library-apartment` (404 en production) y substitue un
// client EN MÉMOIRE, pour voir et éprouver l'écran sans l'API.

import { createContext, type ReactNode, useContext } from 'react';
import { libraryClient } from './client';

export type LibraryClient = typeof libraryClient;

const LibraryClientContext = createContext<LibraryClient>(libraryClient);

export function LibraryClientProvider({
  client,
  children,
}: {
  client: LibraryClient;
  children: ReactNode;
}) {
  return (
    <LibraryClientContext.Provider value={client}>
      {children}
    </LibraryClientContext.Provider>
  );
}

export function useLibraryClient(): LibraryClient {
  return useContext(LibraryClientContext);
}
