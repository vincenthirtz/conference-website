// features/player/library/teamHq/clientContext.tsx — le client des QG d'équipe
// que les hooks utilisent. Par défaut le vrai (`./client.ts`, l'API) ; les
// tests et les pages de développement y substituent un client EN MÉMOIRE.

import { createContext, type ReactNode, useContext } from 'react';
import { type TeamHqClient, teamHqClient } from './client';

const TeamHqClientContext = createContext<TeamHqClient>(teamHqClient);

export function TeamHqClientProvider({
  client,
  children,
}: {
  client: TeamHqClient;
  children: ReactNode;
}) {
  return (
    <TeamHqClientContext.Provider value={client}>
      {children}
    </TeamHqClientContext.Provider>
  );
}

export function useTeamHqClient(): TeamHqClient {
  return useContext(TeamHqClientContext);
}
