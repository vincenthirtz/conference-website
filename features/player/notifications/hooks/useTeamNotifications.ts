// features/player/notifications/hooks/useTeamNotifications.ts — le fil des
// notifications de l'ÉQUIPE (scrim accepté, scrim pris en compte) sur l'écran
// Notifications.
//
//   - Lecture : GET /api/player/notifications/team, portée de l'écran
//     (sujet inspecté, équipe active).
//   - « Lu » : ce qui arrive non lu est marqué lu dès l'affichage (POST, pour
//     la joueuse seulement) — jamais en inspection. Les notifications vues
//     non lues gardent leur pastille « Nouveau » tant que l'écran est ouvert
//     (`fresh`), même après le marquage.
//   - Après le marquage : compteurs de l'écran relus, cloche prévenue.
//   - Temps réel : le salon `demandes:team:<id>` de l'équipe GÉRÉE (le seul
//     ouvert aux capitaines/managers, cf. la route de ticket) relit le fil ;
//     les autres membres le relisent au retour sur l'onglet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { logger } from '@/utils/logger';
import { announcePlayerNotificationsChanged } from '@/utils/player/notificationsEvents';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { notificationsClient } from '../client';
import { notificationsKeys } from './useNotifications';

export function useTeamNotifications({
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
  const key = playerKey(scope, 'notifications', 'team');

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      try {
        return await notificationsClient.team(scope);
      } catch (err) {
        logger.error('[player/notifications] team error:', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });

  const mark = useMutation({
    mutationFn: () => notificationsClient.markTeamRead(scope),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: notificationsKeys.counters(scope),
      });
      announcePlayerNotificationsChanged();
    },
    onError: (err) =>
      logger.error('[player/notifications] team mark-read error:', err),
  });
  const markRef = useRef(mark.mutate);
  markRef.current = mark.mutate;

  // Les non lues À L'AFFICHAGE : pastille « Nouveau » le temps de l'écran.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const unreadKey = (query.data?.notifications ?? [])
    .filter((n) => !n.read)
    .map((n) => n.id)
    .join(',');

  useEffect(() => {
    if (!unreadKey) return;
    setFresh((prev) => {
      const next = new Set(prev);
      for (const id of unreadKey.split(',')) next.add(id);
      return next;
    });
    if (!readOnly) markRef.current();
  }, [unreadKey, readOnly]);

  // Stable (la portée est mémoïsée) : l'abonnement ne se refait pas à chaque rendu.
  const refetchOnChange = useCallback(() => {
    void qc.invalidateQueries({
      queryKey: playerKey(scope, 'notifications', 'team'),
    });
  }, [qc, scope]);

  useRealtimeChannel({
    enabled: enabled && !!realtimeTeamId,
    channel: realtimeTeamId
      ? `notifications-team-${realtimeTeamId}`
      : 'notifications-team',
    table: 'demandes',
    filter: realtimeTeamId ? `team_id=eq.${realtimeTeamId}` : undefined,
    onChange: refetchOnChange,
  });

  return { query, fresh };
}
