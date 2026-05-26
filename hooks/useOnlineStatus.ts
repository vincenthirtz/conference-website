import { useEffect, useState } from 'react';

/**
 * Suit l'état réseau du navigateur. Retourne `true` quand `navigator.onLine`
 * est true, false sinon. Réagit aux events `online` / `offline` pour
 * rester synchronisé sans polling.
 *
 * navigator.onLine est notoirement imparfait (un wifi captif renvoie souvent
 * online=true alors que le trafic est bloqué). C'est suffisant pour un
 * banner indicatif ; pour de la vraie résilience on s'appuie sur les
 * échecs de fetch + Background Sync (cf. utils/bgSyncQueue.ts).
 *
 * SSR-safe : retourne `true` pendant le render serveur (assumption optimiste
 * — la majorité des sessions sont online), puis se corrige côté client au
 * premier effet.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}
