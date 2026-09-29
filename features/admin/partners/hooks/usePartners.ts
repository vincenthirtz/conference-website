// features/admin/partners/hooks/usePartners.ts — lectures et gestes des
// écrans partenaires / demandes, sur le cache partagé de l'admin (lot L10).
// Après une écriture, les listes du domaine sont invalidées : le hub se met à
// jour sans rechargement manuel, y compris en revenant d'une fiche.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import {
  partnersClient,
  partnershipRequestsClient,
  type PartnerListParams,
  type PartnershipRequest,
  type PartnershipRequestListParams,
} from '../client';
import type { PartnerPayload } from '../schemas';

export const partnersKeys = {
  all: adminKey('partners'),
  lists: () => [...partnersKeys.all, 'list'] as const,
  list: (p: PartnerListParams) => [...partnersKeys.lists(), p] as const,
  detail: (id: string) => [...partnersKeys.all, 'detail', id] as const,
};

export const partnershipRequestsKeys = {
  all: adminKey('partnership-requests'),
  lists: () => [...partnershipRequestsKeys.all, 'list'] as const,
  list: (p: PartnershipRequestListParams) =>
    [...partnershipRequestsKeys.lists(), p] as const,
  detail: (id: string) =>
    [...partnershipRequestsKeys.all, 'detail', id] as const,
};

/* ---- Partenaires ---- */

export function usePartnersList(params: PartnerListParams) {
  return useQuery({
    queryKey: partnersKeys.list(params),
    queryFn: () => partnersClient.list(params),
    // La page précédente reste affichée pendant le chargement de la suivante
    // (comme `useAdminResource`, qui ne vidait pas la liste).
    placeholderData: keepPreviousData,
  });
}

export function usePartner(id: string | null) {
  return useQuery({
    queryKey: partnersKeys.detail(id ?? ''),
    queryFn: () => partnersClient.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/** Invalide les listes de partenaires (après la modale de création, etc.). */
export function useInvalidatePartners() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: partnersKeys.lists() });
}

export function useUpdatePartner(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PartnerPayload) =>
      partnersClient.update(id as string, patch),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: partnersKeys.lists() }),
  });
}

export function useRemovePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => partnersClient.remove(id),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: partnersKeys.lists() }),
  });
}

export function useTogglePartnerActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      partnersClient.update(id, { isActive }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: partnersKeys.lists() }),
  });
}

/* ---- Demandes de partenariat ---- */

export function usePartnershipRequestsList(
  params: PartnershipRequestListParams
) {
  return useQuery({
    queryKey: partnershipRequestsKeys.list(params),
    queryFn: () => partnershipRequestsClient.list(params),
    placeholderData: keepPreviousData,
  });
}

export function usePartnershipRequest(id: string | null) {
  return useQuery({
    queryKey: partnershipRequestsKeys.detail(id ?? ''),
    queryFn: () => partnershipRequestsClient.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useUpdatePartnershipRequest(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { status: string; adminNotes: string }) =>
      partnershipRequestsClient.update(id as string, patch),
    onSuccess: (row) => {
      // La fiche affiche la version renvoyée par le serveur (statut, dates).
      if (id)
        qc.setQueryData<PartnershipRequest>(
          partnershipRequestsKeys.detail(id),
          row
        );
      void qc.invalidateQueries({
        queryKey: partnershipRequestsKeys.lists(),
      });
    },
  });
}

export function useRemovePartnershipRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => partnershipRequestsClient.remove(id),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: partnershipRequestsKeys.lists(),
      }),
  });
}
