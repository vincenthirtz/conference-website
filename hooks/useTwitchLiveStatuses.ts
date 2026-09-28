// hooks/useTwitchLiveStatuses.ts
//
// L'état d'antenne de chaînes Twitch (`GET /api/twitch/live?channels=a,b`,
// route publique), relu toutes les minutes tant que l'onglet est visible, et au
// retour sur l'onglet — le statut Twitch bouge lentement, pas de temps réel.
//
// Sert la liste des chaînes (badge « en direct ») et le statut d'antenne de la
// console live. Trois états distincts, comme dans le panneau d'origine :
//   - `statuses`      : le dernier état connu, par login en minuscules ;
//   - `notConfigured` : la route répond 503 (identifiants Twitch absents) ;
//   - erreur réseau / autre non-2xx : ÉTAT NEUTRE, on garde le dernier connu.

import { useCallback, useEffect, useState } from 'react';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';

export type TwitchLiveStatus = {
  live: boolean;
  title?: string;
  viewer_count?: number;
};

const POLL_MS = 60_000;

export function useTwitchLiveStatuses(logins: readonly string[]): {
  statuses: Record<string, TwitchLiveStatus>;
  notConfigured: boolean;
} {
  const [statuses, setStatuses] = useState<Record<string, TwitchLiveStatus>>(
    {}
  );
  const [notConfigured, setNotConfigured] = useState(false);
  const key = [...new Set(logins.map((l) => l.trim().toLowerCase()))]
    .filter(Boolean)
    .sort()
    .join(',');

  const read = useCallback(async () => {
    if (!key) return;
    try {
      const res = await fetch(
        `/api/twitch/live?channels=${encodeURIComponent(key)}`
      );
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as {
        statuses?: Record<string, TwitchLiveStatus>;
      };
      setNotConfigured(false);
      const map: Record<string, TwitchLiveStatus> = {};
      for (const [ch, info] of Object.entries(json.statuses ?? {})) {
        map[ch.toLowerCase()] = {
          live: Boolean(info?.live),
          title: info?.title,
          viewer_count: info?.viewer_count,
        };
      }
      setStatuses(map);
    } catch {
      // Réseau HS : état neutre, le dernier statut reste affiché.
    }
  }, [key]);

  // Première lecture, et relecture quand la liste des chaînes change.
  useEffect(() => {
    void read();
  }, [read]);
  useVisiblePoll(() => void read(), POLL_MS);

  return { statuses, notConfigured };
}
