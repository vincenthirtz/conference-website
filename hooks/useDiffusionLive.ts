// hooks/useDiffusionLive.ts
//
// Un run est-il en direct ? Lu par la barre d'onglets Diffusion, toutes les
// minutes (onglet visible) et au retour sur l'onglet. `null` tant qu'on ne
// sait pas, ou si la lecture échoue : on n'affiche alors RIEN plutôt qu'un
// faux « hors antenne ».

import { useCallback, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';

export type DiffusionLive = { live: boolean; runName: string | null };

const POLL_MS = 60_000;

export function useDiffusionLive(): DiffusionLive | null {
  const { adminFetchJson } = useAdminFetch();
  const [state, setState] = useState<DiffusionLive | null>(null);
  const read = useCallback(async () => {
    try {
      setState(
        await adminFetchJson<DiffusionLive>(
          '/api/admin/diffusion/live-status',
          { skipAuthRedirect: true }
        )
      );
    } catch {
      setState(null);
    }
  }, [adminFetchJson]);
  useVisiblePoll(() => void read(), POLL_MS, { immediate: true });
  return state;
}
