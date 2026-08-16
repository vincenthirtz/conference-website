// components/Home/useTwitchLive.ts
//
// Détection de live Twitch partagée par la refonte accueil (hero + spotlight).
// Un seul poll (`/api/twitch/live`) pilote à la fois la pastille du hero et le
// panneau du spotlight, sans dupliquer les requêtes. Le tick est sauté quand
// l'onglet n'est pas visible.

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

export function useTwitchLive(): TwitchLive {
  const [state, setState] = useState<Omit<TwitchLive, 'parent' | 'channel'>>({
    live: false,
  });
  const [parent, setParent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
    return scheduleIdle(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/twitch/live?channels=${CHANNEL}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const s = json?.statuses?.[CHANNEL] ?? { live: false };
        setState({
          live: Boolean(s.live),
          title: s.title,
          viewerCount:
            typeof s.viewer_count === 'number' ? s.viewer_count : undefined,
        });
      } catch {
        /* offline / network error: stay not-live */
      }
    };
    load();
    // Onglet en arrière-plan = on saute le tick (même garde que PlayerBell /
    // AdminTopBar). Sans ça, un onglet home laissé ouvert tapait /api/twitch/live
    // toutes les 60 s indéfiniment, sans que personne ne regarde la pastille.
    const id = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ready]);

  return { ...state, parent, channel: CHANNEL };
}
