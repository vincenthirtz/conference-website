// utils/tcg/useTcgLive.ts
//
// Lit le TCG en action (`GET /api/public/tcg/live`) une fois au montage. La
// réponse est en cache CDN court : inutile de la rafraîchir en boucle.
//
// Un échec rend `error` et les blocs ne s'affichent pas : ces sections
// illustrent le TCG, elles ne doivent jamais casser la page qui les accueille.
//
// Vit dans utils/ (partagé), ni dans `features/player` — la page publique
// `/tcg` ne doit pas atteindre le code de l'espace joueuse (garde-fou
// tests/unit/adminBoundariesGuard.test.ts).

import { useEffect, useState } from 'react';
import type { TcgLiveResponse } from '@/utils/tcg/live';

export const TCG_LIVE_URL = '/api/public/tcg/live';

export type TcgLiveState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; data: TcgLiveResponse };

/** Normalise la réponse du TCG en action : un champ faux vaut un bloc vide. */
export function normalizeTcgLive(data: unknown): TcgLiveResponse {
  const body = (data ?? {}) as Partial<TcgLiveResponse>;
  return {
    recentPulls: Array.isArray(body.recentPulls) ? body.recentPulls : [],
    collectors: Array.isArray(body.collectors) ? body.collectors : [],
    cardOfWeek: body.cardOfWeek ?? null,
  };
}

/**
 * Lit le TCG en action. `fetch` NU, sans session : la route est publique et
 * mise en cache CDN pour toutes ; un `Authorization` la rendrait propre à
 * chaque visiteuse (et la ferait sortir du cache) sans rien apporter.
 */
export async function fetchTcgLive(
  signal?: AbortSignal
): Promise<TcgLiveResponse> {
  const res = await fetch(TCG_LIVE_URL, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeTcgLive(await res.json());
}

export function useTcgLive(): TcgLiveState {
  const [state, setState] = useState<TcgLiveState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    fetchTcgLive(controller.signal)
      .then((data) => setState({ status: 'ok', data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, []);
  return state;
}
