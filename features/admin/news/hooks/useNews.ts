// features/admin/news/hooks/useNews.ts — fiche actualité sur le cache de
// l'admin (lot L10). Création et édition invalident les listes du domaine.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { newsClient } from '../client';
import type { NewsPayload } from '../schemas';

export const newsKeys = {
  all: adminKey('news'),
  lists: () => [...newsKeys.all, 'list'] as const,
  detail: (id: string) => [...newsKeys.all, 'detail', id] as const,
};

export function useNewsItem(id: string | null) {
  return useQuery({
    queryKey: newsKeys.detail(id ?? ''),
    queryFn: () => newsClient.get(id as string),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useCreateNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewsPayload) => newsClient.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: newsKeys.lists() }),
  });
}

export function useUpdateNews(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewsPayload) => newsClient.update(id as string, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: newsKeys.lists() }),
  });
}
