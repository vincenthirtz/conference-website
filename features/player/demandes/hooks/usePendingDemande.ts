// features/player/demandes/hooks/usePendingDemande.ts — demande déjà en
// attente affichée au lieu d'un renvoi silencieux (/player/join-team,
// /player/request-captain), avec son annulation pour en refaire une.
// Les deux écrans recopiaient le même trio d'états et le même appel.
//
// L'annulation passe par le client typé (DELETE /api/demandes/cancel,
// features/player/dashboard/client.ts) ; succès → plus de demande en
// attente, l'écran revient à son formulaire.

import { useCallback, useState } from 'react';
import { dashboardClient } from '../../dashboard/client';

type PendingState<T> = {
  pending: T | null;
  cancelling: boolean;
  cancelError: string | null;
};

export function usePendingDemande<T extends { id: string }>(
  /** Message affiché si l'erreur n'en porte pas. */
  cancelErrorFallback: string
) {
  const [state, setState] = useState<PendingState<T>>({
    pending: null,
    cancelling: false,
    cancelError: null,
  });

  /** Identité stable : utilisable dans les dépendances d'un effet. */
  const setPending = useCallback(
    (pending: T | null) => setState((s) => ({ ...s, pending })),
    []
  );

  const cancel = async () => {
    const { pending, cancelling } = state;
    if (!pending || cancelling) return;
    setState((s) => ({ ...s, cancelling: true, cancelError: null }));
    try {
      await dashboardClient.cancelDemande(pending.id);
      setState({ pending: null, cancelling: false, cancelError: null });
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        cancelling: false,
        cancelError: (err as Error)?.message || cancelErrorFallback,
      }));
    }
  };

  return { ...state, setPending, cancel };
}
