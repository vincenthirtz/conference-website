// Thin wrapper around Supabase Realtime postgres_changes subscriptions.
//
// Subscribes to a Postgres table (filtered server-side via PostgREST-style
// expressions like `team_id=eq.<uuid>`) and calls back on every event.
// Auto-unsubscribes on unmount and re-subscribes when filter values change.
//
// Usage:
//   useRealtimeChannel({
//     enabled: !!teamId,
//     channel: `notifications-${teamId}`,
//     table: 'demandes',
//     filter: teamId ? `team_id=eq.${teamId}` : undefined,
//     onChange: () => reload(),
//   });

import { useEffect } from 'react';
import { supabaseClient } from '@/utils/supabase';
import type {
  RealtimePostgresChangesFilter,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

type Event = '*' | 'INSERT' | 'UPDATE' | 'DELETE';

type Options = {
  /** Skip subscribing entirely; useful while waiting for ids. */
  enabled?: boolean;
  /** Distinct Supabase channel name. Re-subscribes when this changes. */
  channel: string;
  table: string;
  /** Postgres schema, defaults to `public`. */
  schema?: string;
  /** Filter expression (PostgREST style), e.g. `team_id=eq.${id}`. */
  filter?: string;
  /** INSERT | UPDATE | DELETE | * (default '*'). */
  event?: Event;
  onChange: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => void;
  /**
   * Optionnel — statut de la souscription ('SUBSCRIBED' | 'CHANNEL_ERROR' |
   * 'TIMED_OUT' | 'CLOSED'). Permet a l'appelant d'afficher un indicateur
   * temps-reel / mode degrade. DOIT etre stable (useCallback) sinon la
   * souscription se recree a chaque render.
   */
  onStatus?: (status: string) => void;
};

export function useRealtimeChannel({
  enabled = true,
  channel,
  table,
  schema = 'public',
  filter,
  event = '*',
  onChange,
  onStatus,
}: Options) {
  useEffect(() => {
    if (!enabled) return undefined;

    // The Supabase types for `.on('postgres_changes', config, cb)` are
    // notoriously strict about narrow event literals; cast at the boundary.
    const config: RealtimePostgresChangesFilter<Event> = {
      event,
      schema,
      table,
      ...(filter ? { filter } : {}),
    } as RealtimePostgresChangesFilter<Event>;

    const sub = supabaseClient
      .channel(channel)
      .on('postgres_changes' as never, config, onChange)
      .subscribe((status) => {
        onStatus?.(status);
      });

    return () => {
      // removeChannel n'emet pas toujours un 'CLOSED' via le callback : on le
      // signale explicitement pour que l'appelant repasse en "deconnecte".
      onStatus?.('CLOSED');
      supabaseClient.removeChannel(sub);
    };
    // We intentionally re-subscribe when any of the inputs change.
  }, [enabled, channel, table, schema, filter, event, onChange, onStatus]);
}
