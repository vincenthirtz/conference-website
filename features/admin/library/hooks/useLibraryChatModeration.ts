// features/admin/library/hooks/useLibraryChatModeration.ts — modération du
// chat de la Women's Library (onglet « Library » de /admin/moderation, lot 6).
//
// Une écriture (masquer, sourdine, levée, interrupteur) relit ce qu'elle
// touche : le serveur décide de ce qui est masqué, en cours, ouvert.

import { useCallback, useMemo, useState } from 'react';
import {
  type InfiniteData,
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { libraryChatAdminClient } from '../chatClient';
import type { AdminLibraryChatMessagesResponse } from '../chatModel';
import type { LibraryChatAdminMuteInput } from '../chatSchemas';

export const libraryChatKeys = {
  all: adminKey('library-chat'),
  settings: () => [...libraryChatKeys.all, 'settings'] as const,
  messages: (roomId: string | null) =>
    [...libraryChatKeys.all, 'messages', roomId ?? 'all'] as const,
  mutes: () => [...libraryChatKeys.all, 'mutes'] as const,
};

/** Messages par page de 50, du plus récent ; « plus anciens » ajoute une page. */
export const LIBRARY_CHAT_ADMIN_PAGE = 50;

export function useLibraryChatSettings() {
  return useQuery({
    queryKey: libraryChatKeys.settings(),
    queryFn: libraryChatAdminClient.settings,
  });
}

export function useSetLibraryChatEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      libraryChatAdminClient.setEnabled(enabled),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: libraryChatKeys.all });
    },
  });
}

function messagesQuery(roomId: string | null) {
  return infiniteQueryOptions({
    queryKey: libraryChatKeys.messages(roomId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      libraryChatAdminClient.messages({
        roomId: roomId ?? undefined,
        cursor: pageParam ?? undefined,
        limit: LIBRARY_CHAT_ADMIN_PAGE,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });
}

const itemsOf = (
  data: InfiniteData<AdminLibraryChatMessagesResponse> | undefined
) => data?.pages.flatMap((p) => p.items) ?? [];

/**
 * Messages récents, filtrés par salle (`null` = toutes).
 *
 * Le filtre vit ici, avec la requête qu'il paramètre. La ligne en cours de
 * sourdine aussi : c'est la sélection de CETTE liste, et changer de salle la
 * referme (le formulaire ne survit pas à la vue qui l'a ouvert).
 *
 * `unfilteredItems` : la liste « toutes salles » EN CACHE, observée sans être
 * relue (`enabled: false`) tant qu'on regarde une seule salle. Le filtre y
 * puise les salles déjà vues : elles restent proposées, la salle choisie
 * comprise, sans en tenir une copie à la main.
 */
export function useLibraryChatMessages() {
  const [roomId, setRoom] = useState<string | null>(null);
  const [mutingId, setMutingId] = useState<string | null>(null);
  const query = useInfiniteQuery(messagesQuery(roomId));
  const unfiltered = useInfiniteQuery({
    ...messagesQuery(null),
    enabled: false,
  });

  const items = useMemo(() => itemsOf(query.data), [query.data]);
  const unfilteredItems = useMemo(
    () => (roomId === null ? items : itemsOf(unfiltered.data)),
    [roomId, items, unfiltered.data]
  );

  const setRoomId = useCallback((next: string | null) => {
    setMutingId(null);
    setRoom(next);
  }, []);

  return {
    query,
    items,
    unfilteredItems,
    roomId,
    setRoomId,
    mutingId,
    setMutingId,
  };
}

export function useHideLibraryChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => libraryChatAdminClient.hide(messageId),
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: [...libraryChatKeys.all, 'messages'],
      });
    },
  });
}

export function useLibraryChatMutes() {
  return useQuery({
    queryKey: libraryChatKeys.mutes(),
    queryFn: libraryChatAdminClient.mutes,
  });
}

export function useMuteFromHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryChatAdminMuteInput) =>
      libraryChatAdminClient.mute(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libraryChatKeys.mutes() });
    },
  });
}

export function useLiftLibraryChatMute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => libraryChatAdminClient.lift(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: libraryChatKeys.mutes() });
    },
  });
}
