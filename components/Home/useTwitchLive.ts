// components/Home/useTwitchLive.ts
//
// Détection de live Twitch de la chaîne `womens_cup`, partagée par TOUS les
// consommateurs : la refonte accueil (hero + spotlight) et le logo de la navbar
// (FX « pulse » quand la chaîne est en direct).
//
// UN SEUL POLL POUR TOUT LE SITE. La navbar est montée dans `_app` sur chaque
// page ; si chaque appel du hook lançait son propre `setInterval`, l'accueil
// taperait `/api/twitch/live` deux fois par minute (navbar + hero), et la route
// est limitée à 30 req/min par IP. L'état vit donc dans un store de module :
// le premier abonné démarre le poll, le dernier qui se désabonne l'arrête, et
// un abonné qui arrive en cours de route reçoit tout de suite la dernière
// valeur connue au lieu de refaire une requête.
//
// Le premier appel attend un temps mort du navigateur (il ne doit pas concourir
// avec l'hydratation), et le tick est sauté quand l'onglet n'est pas visible.

import { useEffect, useState } from 'react';

const CHANNEL = 'womens_cup';
const POLL_MS = 60_000;

export type TwitchLive = {
  live: boolean;
  title?: string;
  viewerCount?: number;
  /** hostname courant, requis comme `parent` de l'iframe player Twitch. */
  parent: string | null;
  channel: string;
};

type LiveSnapshot = Omit<TwitchLive, 'parent' | 'channel'>;

function scheduleIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1500);
  return () => window.clearTimeout(id);
}

let snapshot: LiveSnapshot = { live: false };
const listeners = new Set<(s: LiveSnapshot) => void>();
let stopPolling: (() => void) | null = null;

function publish(next: LiveSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l(next));
}

function startPolling(): () => void {
  let cancelled = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const load = async () => {
    try {
      const res = await fetch(`/api/twitch/live?channels=${CHANNEL}`);
      if (!res.ok) return;
      const json = await res.json();
      if (cancelled) return;
      const s = json?.statuses?.[CHANNEL] ?? { live: false };
      publish({
        live: Boolean(s.live),
        title: s.title,
        viewerCount:
          typeof s.viewer_count === 'number' ? s.viewer_count : undefined,
      });
    } catch {
      /* offline / network error: garder la dernière valeur connue */
    }
  };

  const cancelIdle = scheduleIdle(() => {
    if (cancelled) return;
    load();
    // Onglet en arrière-plan = on saute le tick (même garde que PlayerBell /
    // AdminTopBar) : personne ne regarde la pastille ni le logo.
    intervalId = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      load();
    }, POLL_MS);
  });

  return () => {
    cancelled = true;
    cancelIdle();
    if (intervalId) clearInterval(intervalId);
  };
}

function subscribe(listener: (s: LiveSnapshot) => void): () => void {
  listeners.add(listener);
  if (!stopPolling) stopPolling = startPolling();
  listener(snapshot);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopPolling) {
      stopPolling();
      stopPolling = null;
    }
  };
}

export function useTwitchLive(): TwitchLive {
  const [state, setState] = useState<LiveSnapshot>({ live: false });
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
    return subscribe(setState);
  }, []);

  return { ...state, parent, channel: CHANNEL };
}
