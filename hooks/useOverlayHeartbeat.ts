// hooks/useOverlayHeartbeat.ts
//
// « Cet overlay est affiché » — envoyé par chaque page `/overlay/*` dès que sa
// source est connue, puis toutes les 30 s TANT QUE LA PAGE EST VISIBLE : une
// source masquée dans OBS cesse de signaler, et Diffusion › Overlays la voit
// s'éteindre.
//
// `?tenant=` est recopié de l'URL de l'overlay, comme pour ses données : une
// source d'un autre espace signale pour cet espace. `source` à `null` (URL
// dynamique pas encore lue) : rien n'est envoyé.
//
// Silencieux par construction : aucune erreur n'est remontée. Un signal perdu
// ne doit jamais casser un affichage à l'antenne.

import { useCallback, useEffect } from 'react';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { HEARTBEAT_INTERVAL_MS } from '@/utils/overlays/heartbeat';

export function useOverlayHeartbeat(source: string | null): void {
  const send = useCallback(() => {
    if (!source || typeof window === 'undefined') return;
    const tenant = new URLSearchParams(window.location.search).get('tenant');
    const url = tenant
      ? `/api/overlay/heartbeat?tenant=${encodeURIComponent(tenant)}`
      : '/api/overlay/heartbeat';
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
      keepalive: true,
    }).catch(() => undefined);
  }, [source]);

  // Premier signal dès que la source est connue, sans attendre 30 s.
  useEffect(() => {
    send();
  }, [send]);
  useVisiblePoll(send, HEARTBEAT_INTERVAL_MS);
}
