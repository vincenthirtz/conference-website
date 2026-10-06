// features/admin/moderation/hooks/useSupportTickets.ts — tickets de support
// (onglet « Support » de /admin/moderation), par clé filtres + page.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey } from '../../_shared/query';
import {
  moderationClient,
  type SupportTicket,
  type SupportTicketsResponse,
  type SupportTicketUpdateBody,
} from '../client';

export const supportKeys = {
  all: adminKey('support-tickets'),
  list: (query: string) => [...supportKeys.all, 'list', query] as const,
};

export function useSupportTickets(query: string) {
  return useQuery({
    queryKey: supportKeys.list(query),
    queryFn: () => moderationClient.tickets(query),
    // La liste est masquée pendant un chargement : pas de relecture
    // silencieuse au retour sur l'onglet.
    refetchOnWindowFocus: false,
  });
}

/** Retouche optimiste des lignes de la page courante (conversion blacklist). */
export function usePatchSupportTickets(query: string) {
  const qc = useQueryClient();
  return useCallback(
    (fn: (prev: SupportTicket[]) => SupportTicket[]) =>
      qc.setQueryData<SupportTicketsResponse>(
        supportKeys.list(query),
        (prev) => (prev ? { ...prev, tickets: fn(prev.tickets || []) } : prev)
      ),
    [qc, query]
  );
}

/** Changement de statut : relit les listes (compteurs compris) sans attendre. */
export function useUpdateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SupportTicketUpdateBody }) =>
      moderationClient.updateTicket(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: supportKeys.all });
    },
  });
}
