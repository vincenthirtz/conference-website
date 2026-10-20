// features/player/library/socialContext.tsx — les clients du multijoueur de
// la Library (lot 5) que l'écran d'une salle et l'appartement utilisent : le
// Realtime, l'entrée dans une salle, les gestes de sécurité. Vide par défaut
// (= les vrais : supabase-js et l'API). Les pages de développement
// (`/dev/library-room`, `/dev/library-apartment`, 404 en production) y
// substituent des clients EN MÉMOIRE : elles ne touchent jamais le réseau.

import { createContext, type ReactNode, useContext } from 'react';
import type { LibrarySocialActionsClient } from './hooks/useLibrarySocialActions';
import type { LibraryRealtimeClient } from './realtime/connection';
import type { LibrarySocialClient } from './realtime/socialClient';

export type LibrarySocialDeps = {
  realtime?: LibraryRealtimeClient;
  enter?: Pick<LibrarySocialClient, 'enter'>;
  actions?: LibrarySocialActionsClient;
};

const NONE: LibrarySocialDeps = {};
const LibrarySocialContext = createContext<LibrarySocialDeps>(NONE);

export function LibrarySocialProvider({
  deps,
  children,
}: {
  deps: LibrarySocialDeps;
  children: ReactNode;
}) {
  return (
    <LibrarySocialContext.Provider value={deps}>
      {children}
    </LibrarySocialContext.Provider>
  );
}

export function useLibrarySocialDeps(): LibrarySocialDeps {
  return useContext(LibrarySocialContext);
}
