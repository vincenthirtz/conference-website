// features/player/tcg/hooks/useTradesReceived.ts — propositions d'échange
// REÇUES en attente, pour la pastille du lien « Échanger des cartes »
// (lot P14).
//
// L'annonce d'une proposition ne passe que par un DM Discord : sans Discord
// relié, ou DM fermés, la joueuse ne le savait jamais. BEST-EFFORT : illisible
// ou `null` (non mesurable) ⇒ 0, pas de pastille — jamais un chiffre inventé
// ni une erreur affichée pour un accessoire.

import { useQuery } from '@tanstack/react-query';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { tcgClient } from '../client';

export function useTradesReceived(): number {
  const scope = usePlayerScope();
  const { data } = useQuery({
    ...PLAYER_QUERY_OPTIONS,
    queryKey: playerKey(scope, 'tcg', 'trades-pending'),
    queryFn: () => tcgClient.tradeSettings(),
  });
  const received = data?.pending?.received;
  return typeof received === 'number' && received > 0 ? received : 0;
}
