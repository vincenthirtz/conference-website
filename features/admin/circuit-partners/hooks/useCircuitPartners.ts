// features/admin/circuit-partners/hooks/useCircuitPartners.ts — liste filtrée
// et décision ; une décision recharge toutes les vues (compteurs compris).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import {
  type CircuitApplicationStatus,
  type CircuitDecision,
  circuitPartnersClient,
} from '../client';

export const circuitPartnersKeys = {
  all: adminKey('circuit-partners'),
  list: (status: CircuitApplicationStatus | 'all') =>
    [...circuitPartnersKeys.all, 'list', status] as const,
};

export function useCircuitApplications(
  status: CircuitApplicationStatus | 'all'
) {
  return useQuery({
    queryKey: circuitPartnersKeys.list(status),
    queryFn: () => circuitPartnersClient.list(status),
    // L'écran masque la liste pendant un chargement : pas de relecture
    // silencieuse au retour sur l'onglet.
    refetchOnWindowFocus: false,
  });
}

export function useDecideCircuitApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CircuitDecision }) =>
      circuitPartnersClient.decide(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: circuitPartnersKeys.all });
    },
  });
}
