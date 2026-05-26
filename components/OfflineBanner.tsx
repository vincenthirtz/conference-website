// components/OfflineBanner.tsx
//
// Banner discret en haut de page qui informe le staff de l'état réseau et
// du nombre d'actions en file de Background Sync :
//
//   - Hors ligne                : "Hors ligne — tes actions sont en file."
//   - En ligne avec queue > 0   : "N action(s) en cours de synchronisation"
//   - En ligne et queue vide    : ne rend rien.
//
// Le compteur est lu via `countQueuedMutations()` (utils/bgSyncQueue.ts),
// rafraîchi à chaque changement d'état online et toutes les 8s pendant
// qu'il y a du backlog. Pas de polling permanent quand tout est ok.

import { useCallback, useEffect, useState } from 'react';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { countQueuedMutations } from '@/utils/bgSyncQueue';

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [queueCount, setQueueCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const n = await countQueuedMutations();
      setQueueCount(n);
    } catch {
      // IDB indisponible (mode privé Safari, etc.) — on assume 0.
      setQueueCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, online]);

  // Polling pendant qu'il y a du backlog : la queue diminue à mesure que le
  // SW rejoue, et on veut que l'UI suive. Pas de polling si queue=0 ET
  // online — rien à observer.
  useEffect(() => {
    if (queueCount === 0 && online) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [queueCount, online, refresh]);

  if (online && queueCount === 0) return null;

  const showOffline = !online;
  const showQueue = queueCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 top-4 z-[55] -translate-x-1/2 w-[calc(100%-2rem)] max-w-md rounded-xl border px-4 py-3 backdrop-blur shadow-lg ${
        showOffline
          ? 'border-amber-400/40 bg-amber-950/85 shadow-[0_8px_28px_rgba(245,158,11,0.35)]'
          : 'border-cyan-400/30 bg-[#0e0a1f]/95 shadow-[0_8px_28px_rgba(0,240,255,0.22)]'
      }`}
    >
      <div className="flex items-center gap-3 text-sm text-white">
        <span
          className={`inline-block size-2 shrink-0 rounded-full ${
            showOffline
              ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.9)] animate-pulse'
              : 'bg-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.9)] animate-pulse'
          }`}
        />
        <div className="flex-1 leading-tight">
          {showOffline ? (
            <>
              <div className="font-semibold">Hors ligne</div>
              <div className="text-white/70">
                {showQueue
                  ? `${queueCount} action${queueCount > 1 ? 's' : ''} en file — rejouée${
                      queueCount > 1 ? 's' : ''
                    } dès la reconnexion.`
                  : 'Tes actions critiques seront mises en file.'}
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">Synchronisation</div>
              <div className="text-white/70">
                {queueCount} action{queueCount > 1 ? 's' : ''} en cours d&apos;envoi…
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
