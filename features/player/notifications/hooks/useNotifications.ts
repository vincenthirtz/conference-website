// features/player/notifications/hooks/useNotifications.ts — lectures et geste
// de l'écran Notifications sur le cache joueuse (lot P15).
//
// Compteurs : clé = sujet + équipe active (inspection et changement d'équipe
// relisent seuls). Préférences : jamais lues en inspection (`enabled`), et un
// interrupteur est OPTIMISTE — basculé tout de suite, rétabli si le serveur
// refuse, remplacé par l'état complet rendu par le PUT sinon.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { notificationsClient } from '../client';
import type {
  NotificationChannel,
  NotificationPrefPutInput,
  NotificationPrefs,
} from '../schemas';

export const notificationsKeys = {
  counters: (scope: PlayerScope) => playerKey(scope, 'notifications'),
  prefs: (scope: PlayerScope) => playerKey(scope, 'notifications', 'prefs'),
};

/** Les maps absentes retombent sur leurs défauts (comme avant). */
function normalizePrefs(p: NotificationPrefs): NotificationPrefs {
  return {
    push: p.push ?? {},
    email: p.email ?? {},
    broadcastEmail: p.broadcastEmail ?? true,
  };
}

export function useNotificationCounters(enabled: boolean) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: notificationsKeys.counters(scope),
    enabled,
    queryFn: async () => {
      try {
        return await notificationsClient.counters(scope);
      } catch (err) {
        logger.error('[player/notifications] counters error:', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Préférences de la joueuse — `enabled: false` en inspection. */
export function useNotificationPrefs(enabled: boolean) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: notificationsKeys.prefs(scope),
    enabled,
    queryFn: async () => {
      try {
        return normalizePrefs(await notificationsClient.prefs());
      } catch (err) {
        logger.error('[player/notifications] prefs error:', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Applique un interrupteur à un état (le broadcast est un champ à part). */
export function applyToggle(
  prefs: NotificationPrefs,
  { eventType, channel, enabled }: NotificationPrefPutInput
): NotificationPrefs {
  if (channel === 'email' && eventType === 'broadcast') {
    return { ...prefs, broadcastEmail: enabled };
  }
  return { ...prefs, [channel]: { ...prefs[channel], [eventType]: enabled } };
}

export function useToggleNotificationPref() {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  const key = notificationsKeys.prefs(scope);
  return useMutation({
    mutationFn: (input: NotificationPrefPutInput) =>
      notificationsClient.setPref(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationPrefs>(key);
      if (previous) qc.setQueryData(key, applyToggle(previous, input));
      return { previous };
    },
    onError: (err, _input, context) => {
      logger.error('[player/notifications] toggle error:', err);
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (next) => qc.setQueryData(key, normalizePrefs(next)),
  });
}

export type { NotificationChannel };
