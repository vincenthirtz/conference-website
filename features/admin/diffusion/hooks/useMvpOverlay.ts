// features/admin/diffusion/hooks/useMvpOverlay.ts — réglages du sondage MVP du
// public dans la source Régie, et son TEST. Relu toutes les 2 s pendant un
// test (compte à rebours à l'écran), sinon à la demande.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { adminRequest } from '@/utils/admin/adminHttp';
import { adminKey } from '../../_shared/query';
import type { MvpOverlaySettings, MvpOverlayState } from '../schemas';

export const MVP_OVERLAY_URL = '/api/admin/diffusion/mvp-overlay';
const KEY = adminKey('diffusion', 'mvp-overlay');

export function useMvpOverlay() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => adminRequest<MvpOverlayState>(MVP_OVERLAY_URL),
    refetchInterval: (q) => (q.state.data?.demo.active ? 2_000 : false),
  });
  const saveMutation = useIdempotentMutation();
  const testMutation = useIdempotentMutation();

  const set = (state: MvpOverlayState) => qc.setQueryData(KEY, state);

  return {
    query,
    save: async (settings: MvpOverlaySettings) =>
      set(
        await saveMutation.mutateJson<MvpOverlayState>(MVP_OVERLAY_URL, {
          method: 'PUT',
          body: JSON.stringify(settings),
        })
      ),
    /**
     * Reconnecte la chaîne Twitch (nouveaux scopes du chat) et REVIENT sur la
     * page courante : l'autorisation Twitch se fait en pleine page.
     */
    reconnectTwitch: async () => {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const { url } = await adminRequest<{ url: string }>(
        `/api/admin/twitch/connect?returnTo=${encodeURIComponent(returnTo)}`
      );
      window.location.assign(url);
    },
    test: async (action: 'test-start' | 'test-stop') =>
      set(
        await testMutation.mutateJson<MvpOverlayState>(MVP_OVERLAY_URL, {
          method: 'POST',
          body: JSON.stringify({ action }),
        })
      ),
  };
}
