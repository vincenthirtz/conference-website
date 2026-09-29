// features/admin/adherents/hooks/useAdherents.ts — fiche adhérent et montant
// de cotisation. La fiche hydrate un formulaire : pas de relecture auto.

import { useQuery } from '@tanstack/react-query';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { adherentsClient as client } from '../client';

export const adherentsKeys = {
  /** Préfixe partagé avec la liste `useAdminList({ key: 'adherents' })`. */
  all: adminKey('adherents'),
  detail: (id: string) => adminKey('adherents', 'detail', id),
  cotisation: adminKey('adherents', 'cotisation-amount'),
};

export function useAdherent(id: string | undefined) {
  return useQuery({
    queryKey: adherentsKeys.detail(id ?? ''),
    queryFn: () => client.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/** Réglage lu une fois : une erreur laisse le montant à 0 (inchangé). */
export function useCotisationAmount() {
  return useQuery({
    queryKey: adherentsKeys.cotisation,
    queryFn: client.cotisationAmount,
    refetchOnWindowFocus: false,
  });
}
