// features/admin/pilotage/hooks/usePilotage.ts — rafraîchi toutes les 30 s :
// un soir de match, la file bouge sans que personne ne recharge la page.

import { useQuery } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { pilotageClient } from '../client';

export function usePilotage() {
  return useQuery({
    queryKey: adminKey('pilotage'),
    queryFn: pilotageClient.get,
    refetchInterval: 30_000,
  });
}
