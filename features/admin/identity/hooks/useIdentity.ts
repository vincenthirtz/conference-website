// features/admin/identity/hooks/useIdentity.ts — données de la page owner « Comptes et
// connexion » : l'état (réglages, chiffres, staff), la recherche d'un compte, et les gestes, qui
// relisent l'état à leur suite.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import {
  type IdentityAccountAction,
  type IdentitySettingsPatch,
  identityClient,
} from '../client';

export const identityKeys = {
  all: adminKey('identity'),
  overview: () => [...identityKeys.all, 'overview'] as const,
  accounts: (q: string) => [...identityKeys.all, 'accounts', q] as const,
};

export const IDENTITY_SEARCH_MIN = 3;

export function useIdentityOverview() {
  return useQuery({
    queryKey: identityKeys.overview(),
    queryFn: identityClient.overview,
    refetchOnWindowFocus: false,
  });
}

export function useIdentityAccounts(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: identityKeys.accounts(query),
    queryFn: () => identityClient.findAccounts(query),
    enabled: query.length >= IDENTITY_SEARCH_MIN,
    refetchOnWindowFocus: false,
  });
}

export function useSaveIdentitySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: IdentitySettingsPatch) =>
      identityClient.saveSettings(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: identityKeys.all });
    },
  });
}

export function useIdentityAccountAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      action,
    }: {
      userId: string;
      action: IdentityAccountAction;
    }) => identityClient.act(userId, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: identityKeys.all });
    },
  });
}

export function useSignOutEveryone() {
  return useMutation({
    mutationFn: (confirm: string) => identityClient.signOutEveryone(confirm),
  });
}
