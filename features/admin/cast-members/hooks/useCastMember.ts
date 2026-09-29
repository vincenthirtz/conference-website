// features/admin/cast-members/hooks/useCastMember.ts — fiche d'une casteuse
// sur le cache de l'admin (lot L10).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { castMembersClient } from '../client';
import type { CastMemberPayload } from '../schemas';

export const castMembersKeys = {
  all: adminKey('cast-members'),
  lists: () => [...castMembersKeys.all, 'list'] as const,
  detail: (id: string) => [...castMembersKeys.all, 'detail', id] as const,
};

export function useCastMember(id: string | null) {
  return useQuery({
    queryKey: castMembersKeys.detail(id ?? ''),
    queryFn: () => castMembersClient.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useUpdateCastMember(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: CastMemberPayload) =>
      castMembersClient.update(id as string, patch),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: castMembersKeys.lists() }),
  });
}
