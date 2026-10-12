// features/player/tcg/hooks/useTcgLive.ts
//
// Lit le TCG en action (`GET /api/public/tcg/live`) une fois au montage. La
// réponse est en cache CDN court : inutile de la rafraîchir en boucle.
//
// Un échec rend `error` et les blocs ne s'affichent pas : ces sections
// illustrent le TCG, elles ne doivent jamais casser la page qui les accueille.

import { useEffect, useState } from 'react';
import type { TcgLiveResponse } from '@/utils/tcg/live';
import { fetchTcgLive } from '../client';

export type TcgLiveState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; data: TcgLiveResponse };

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
