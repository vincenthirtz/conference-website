// features/player/notifications/hooks/useInbox.ts — la boîte de notifications
// durable de la joueuse (lot 4, docs/PLAN-interactions-joueuses.md) sur
// l'écran Notifications.
//
//   - Lecture : GET /api/player/inbox, page par page (`before=` = curseur
//     rendu par la page précédente). Toutes ses équipes : la portée ne porte
//     que le sujet inspecté, jamais l'équipe active.
//   - API d'avant le lot 4 (404, réponse d'une autre forme) ou lecture en
//     échec : `available === false`, l'écran garde la liste des notifications
//     d'équipe d'avant (hooks/useTeamNotifications).
//   - « Lu » : chaque entrée non lue AFFICHÉE est marquée lue (POST ids, par
//     paquets de 100), une seule fois — jamais en inspection. Elle garde sa
//     pastille « Nouveau » le temps de la visite (`fresh`).
//   - « Tout marquer comme lu » : POST { all: true }, y compris les pages pas
//     encore chargées.
//   - Après chaque marquage : compteurs de l'écran relus, cloche prévenue
//     (utils/player/notificationsEvents.ts).
//   - Temps réel : le salon `demandes` de l'équipe GÉRÉE relit la liste (les
//     notifications d'équipe en viennent) ; le reste arrive à la visite.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { ApiHttpError } from '@/utils/http/authedRequest';
import { logger } from '@/utils/logger';
import { announcePlayerNotificationsChanged } from '@/utils/player/notificationsEvents';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { notificationsClient } from '../client';
import {
  INBOX_PAGE_SIZE,
  INBOX_READ_MAX_IDS,
  type InboxItem,
  type InboxPayload,
  type InboxReadInput,
  isInboxPayload,
} from '../inboxTypes';
import { notificationsKeys } from './useNotifications';

/** Une page lue, ou `null` : la boîte n'existe pas (encore) côté API. */
type InboxPage = InboxPayload | null;

/** Découpe en paquets de `size` (le POST plafonne `ids`). */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function useInbox({
  enabled,
  readOnly,
  realtimeTeamId,
}: {
  enabled: boolean;
  /** Inspection / lecture seule : on lit, on ne marque rien. */
  readOnly: boolean;
  /** Équipe gérée (capitaine, manager) : écoute temps réel ; sinon null. */
  realtimeTeamId: string | null;
}) {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  // Toutes les équipes : la clé ne dépend pas de l'équipe active.
  const key = useMemo(
    () => playerKey({ ...scope, teamId: null }, 'notifications', 'inbox'),
    [scope]
  );

  const query = useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<InboxPage> => {
      try {
        const json = await notificationsClient.inbox(
          scope,
          INBOX_PAGE_SIZE,
          pageParam
        );
        return isInboxPayload(json) ? json : null;
      } catch (err) {
        // Route absente : l'API d'avant le lot 4. Pas une panne.
        if (err instanceof ApiHttpError && err.status === 404) return null;
        logger.error('[player/notifications] inbox error:', err);
        throw err;
      }
    },
    getNextPageParam: (last) => last?.nextBefore ?? undefined,
    ...PLAYER_QUERY_OPTIONS,
  });

  const pages = query.data?.pages ?? [];
  const firstPage = pages[0];
  // Une page suivante en échec ne fait pas retomber l'écran sur l'ancienne
  // liste : seule la PREMIÈRE lecture décide.
  const available = !!firstPage;
  const unavailable =
    (query.isError && !query.data) || (!!query.data && !firstPage);
  const items = useMemo<InboxItem[]>(
    () => pages.flatMap((p) => p?.items ?? []),
    [pages]
  );

  // Non lues PAS ENCORE AFFICHÉES (pages plus anciennes) : celles qu'on voit
  // partent au marquage. Avant la première réponse du serveur, on déduit les
  // affichées du compte de la première page ; ensuite, sa réponse fait foi.
  const [unreadAfterMark, setUnreadAfterMark] = useState<number | null>(null);
  const unreadShown = items.filter((i) => !i.readAt).length;
  const unreadCount =
    unreadAfterMark ??
    Math.max(0, (firstPage?.unreadCount ?? 0) - (readOnly ? 0 : unreadShown));

  const onMarked = useCallback(
    (res: { unreadCount?: number } | undefined) => {
      if (typeof res?.unreadCount === 'number')
        setUnreadAfterMark(res.unreadCount);
      void qc.invalidateQueries({
        queryKey: notificationsKeys.counters(scope),
      });
      announcePlayerNotificationsChanged();
    },
    [qc, scope]
  );

  const mark = useMutation({
    mutationFn: (body: InboxReadInput) =>
      notificationsClient.markInboxRead(body),
    onSuccess: onMarked,
    onError: (err) =>
      logger.error('[player/notifications] inbox mark-read error:', err),
  });
  const markRef = useRef(mark.mutate);
  markRef.current = mark.mutate;

  // Les non lues À L'AFFICHAGE : pastille « Nouveau » le temps de la visite.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  // Déjà envoyées au serveur : jamais deux fois la même.
  const sent = useRef(new Set<string>());
  const unreadKey = items
    .filter((i) => !i.readAt)
    .map((i) => i.id)
    .join(',');

  useEffect(() => {
    if (!unreadKey) return;
    const ids = unreadKey.split(',');
    setFresh((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    if (readOnly) return;
    const toSend = ids.filter((id) => !sent.current.has(id));
    if (toSend.length === 0) return;
    for (const id of toSend) sent.current.add(id);
    for (const part of chunk(toSend, INBOX_READ_MAX_IDS)) {
      markRef.current({ ids: part });
    }
  }, [unreadKey, readOnly]);

  /** « Tout marquer comme lu » : le cache passe lu, le serveur aussi. */
  const markAll = useCallback(() => {
    if (readOnly) return;
    const now = new Date().toISOString();
    qc.setQueryData<InfiniteData<InboxPage, string | null>>(key, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) =>
              p
                ? {
                    ...p,
                    items: p.items.map((i) =>
                      i.readAt ? i : { ...i, readAt: now }
                    ),
                  }
                : p
            ),
          }
        : data
    );
    for (const i of items) sent.current.add(i.id);
    setUnreadAfterMark(0);
    mark.mutate({ all: true });
  }, [items, key, mark, qc, readOnly]);

  const refetchOnChange = useCallback(() => {
    void qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  useRealtimeChannel({
    enabled: enabled && available && !!realtimeTeamId,
    channel: realtimeTeamId
      ? `notifications-inbox-${realtimeTeamId}`
      : 'notifications-inbox',
    table: 'demandes',
    filter: realtimeTeamId ? `team_id=eq.${realtimeTeamId}` : undefined,
    onChange: refetchOnChange,
  });

  return {
    query,
    /** La boîte répond au contrat du lot 4. */
    available,
    /** La boîte ne répond pas (404, autre forme, erreur) : liste d'avant. */
    unavailable,
    items,
    fresh,
    /** Non lues restées hors de l'écran (pages pas encore chargées). */
    olderUnread: unreadCount,
    markAll,
    markingAll: mark.isPending && !!mark.variables && 'all' in mark.variables,
  };
}
