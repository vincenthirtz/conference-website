// features/player/library/arena/client.ts — appels typés de l'arène de la
// Women's Library (docs/PLAN-tcg-2.md, lot 12). Les URLs vivent ici ; `ui/`
// ne touche pas le réseau.
//
// Routes « soi seulement » (`subject: 'self'`) : aucune portée `?as=`.
// Les mutations partent avec une `Idempotency-Key` (`playerRequest`) : un
// double clic rejoue la réponse, pas le geste. Le serveur décide de tout ;
// le moteur synchronisé ne sert ici qu'à PRÉVISUALISER.

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  ArenaDeckResponse,
  ArenaDuelResponse,
  ArenaLobbyResponse,
} from './responses';
import type { ArenaAction, ArenaOpponentId } from './rules';

const BASE = '/api/player/library/arena';

export const arenaUrls = {
  deck: `${BASE}/deck`,
  duels: `${BASE}/duels`,
  duel: (id: string) => `${BASE}/duels/${encodeURIComponent(id)}`,
  actions: (id: string) => `${BASE}/duels/${encodeURIComponent(id)}/actions`,
  abandon: (id: string) => `${BASE}/duels/${encodeURIComponent(id)}/abandon`,
} as const;

export type ArenaClient = {
  lobby: () => Promise<ArenaLobbyResponse>;
  deck: () => Promise<ArenaDeckResponse>;
  saveDeck: (cards: string[]) => Promise<ArenaDeckResponse>;
  start: (opponent: ArenaOpponentId) => Promise<ArenaDuelResponse>;
  duel: (id: string) => Promise<ArenaDuelResponse>;
  act: (
    id: string,
    seq: number,
    action: ArenaAction
  ) => Promise<ArenaDuelResponse>;
  abandon: (id: string) => Promise<ArenaDuelResponse>;
};

export const arenaClient: ArenaClient = {
  lobby: () => playerRequest<ArenaLobbyResponse>(arenaUrls.duels),
  deck: () => playerRequest<ArenaDeckResponse>(arenaUrls.deck),
  saveDeck: (cards) =>
    playerRequest<ArenaDeckResponse>(arenaUrls.deck, {
      method: 'PUT',
      json: { cards },
      idempotent: true,
    }),
  start: (opponent) =>
    playerRequest<ArenaDuelResponse>(arenaUrls.duels, {
      method: 'POST',
      json: { opponent },
      idempotent: true,
    }),
  duel: (id) => playerRequest<ArenaDuelResponse>(arenaUrls.duel(id)),
  act: (id, seq, action) =>
    playerRequest<ArenaDuelResponse>(arenaUrls.actions(id), {
      method: 'POST',
      json: { seq, action },
      idempotent: true,
    }),
  abandon: (id) =>
    playerRequest<ArenaDuelResponse>(arenaUrls.abandon(id), {
      method: 'POST',
      idempotent: true,
    }),
};
