// features/admin/pole-members/hooks/usePoleMember.ts — fiche d'un membre de
// pôle sur le cache de l'admin (lot L10).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { poleMembersClient } from '../client';
import type { PoleMemberPayload } from '../schemas';

export const poleMembersKeys = {
  all: adminKey('pole-members'),
  lists: () => [...poleMembersKeys.all, 'list'] as const,
  detail: (id: string) => [...poleMembersKeys.all, 'detail', id] as const,
};

export function usePoleMember(id: string | null) {
  return useQuery({
    queryKey: poleMembersKeys.detail(id ?? ''),
    queryFn: () => poleMembersClient.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useUpdatePoleMember(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PoleMemberPayload) =>
      poleMembersClient.update(id as string, patch),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: poleMembersKeys.lists() }),
  });
}
