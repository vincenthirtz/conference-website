// hooks/useCasterPresence.ts
//
// Présence multi-caster du cockpit (lot 5) — Supabase Realtime **Presence** sur
// le canal `caster_presence`, LE MÊME que l'app desktop womenscup-caster
// (src/main/presence.js) : casters web et desktop se voient donc mutuellement,
// et la shape trackée est identique
// (`{ staffId, displayName, role, activeScene, activeField, joinedAt }`,
// clé de présence = staffId).
//
// ⚠️ Rien à voir avec la TABLE `caster_presence` (heartbeats du cockpit régie,
// cf. pages/api/caster/heartbeat.ts) : ici l'état est éphémère, porté par le
// WebSocket Realtime — aucune écriture en base, donc aucune RLS en jeu (le canal
// Presence n'est pas du `postgres_changes`, il fonctionne indépendamment de la
// publication `supabase_realtime`).
//
// Deux effets distincts, volontairement :
//   1. cycle de vie du canal (souscription / untrack+remove), dépendant du seul
//      staffId — un changement de scène ne doit JAMAIS recréer la souscription ;
//   2. re-`track()` du payload quand la scène/le champ actif change.

import { useEffect, useMemo, useRef, useState } from 'react';

import { supabaseClient } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { formatPresenceState } from '@/utils/caster/presence';
import type { CasterPresenceUser } from '@/types/caster';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const CASTER_PRESENCE_CHANNEL = 'caster_presence';

type Options = {
  enabled?: boolean;
  /** Staff SSR (props.staff.id) — sans lui, pas de présence. */
  staffId: string | null;
  displayName: string;
  role: string;
  /** **id** de la scène en cours d'édition (contrat desktop), null si aucune. */
  activeScene: string | null;
  /** Champ en cours d'édition (optionnel, non câblé côté web pour l'instant). */
  activeField?: string | null;
};

type Return = {
  /** Tous les casters présents, self INCLUS (comme le desktop). */
  users: CasterPresenceUser[];
  /** Canal souscrit ? (false = présence indisponible, UI dégradée) */
  connected: boolean;
};

export function useCasterPresence({
  enabled = true,
  staffId,
  displayName,
  role,
  activeScene,
  activeField = null,
}: Options): Return {
  const [users, setUsers] = useState<CasterPresenceUser[]>([]);
  const [connected, setConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  // Horodatage d'arrivée STABLE pour la session (le desktop le réécrit à chaque
  // update, ce qui fait sauter l'ordre d'affichage — on ne reproduit pas ça).
  const [joinedAt] = useState(() => new Date().toISOString());

  const payload = useMemo(
    () => ({
      staffId: staffId || '',
      displayName,
      role,
      activeScene,
      activeField,
      joinedAt,
    }),
    [staffId, displayName, role, activeScene, activeField, joinedAt]
  );

  // 1) Cycle de vie du canal — dépend du seul staffId (clé de présence).
  //    Le `track()` initial n'est PAS fait ici : c'est l'effet 2 qui s'en charge
  //    dès que `connected` passe à true (un seul chemin de publication).
  useEffect(() => {
    if (!enabled || !staffId) return undefined;

    const channel = supabaseClient.channel(CASTER_PRESENCE_CHANNEL, {
      config: { presence: { key: staffId } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        setUsers(formatPresenceState(channel.presenceState()));
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      channelRef.current = null;
      setConnected(false);
      setUsers([]);
      // untrack avant remove : les autres cockpits voient le départ tout de
      // suite au lieu d'attendre l'expiration du heartbeat Realtime.
      void channel
        .untrack()
        .catch(() => {
          /* le canal se ferme de toute façon */
        })
        .finally(() => {
          void supabaseClient.removeChannel(channel);
        });
    };
  }, [enabled, staffId]);

  // 2) Publication du payload : à la souscription puis à chaque changement de
  //    scène/champ actif (sans jamais toucher au canal lui-même).
  useEffect(() => {
    if (!connected || !channelRef.current) return;
    void channelRef.current.track(payload).catch((err: unknown) => {
      logger.error('[useCasterPresence] track error', err);
    });
  }, [connected, payload]);

  return { users, connected };
}
