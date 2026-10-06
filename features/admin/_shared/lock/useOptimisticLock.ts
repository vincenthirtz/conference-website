// features/admin/_shared/lock/useOptimisticLock.ts — état d'écran du verrou
// optimiste (../optimisticLock.ts) des fiches éditées : tournoi, équipe,
// actualité. Les trois écrans recopiaient le même trio d'états.
//
//   - `version` : `updated_at` de la fiche sur laquelle repose la saisie, à
//     renvoyer en `expected_updated_at` ;
//   - `stale` : un enregistrement a reçu le 409 `stale_update` →
//     <StaleUpdateNotice> s'affiche ;
//   - `reloading` : relecture en cours après « Recharger ».

import { useCallback, useState } from 'react';
import { isStaleUpdateError } from '../optimisticLock';

type LockState = { version: string | null; stale: boolean; reloading: boolean };

export function useOptimisticLock() {
  const [state, setState] = useState<LockState>({
    version: null,
    stale: false,
    reloading: false,
  });

  // Identité stable : utilisable dans les dépendances d'un useCallback.
  const setVersion = useCallback(
    (version: string | null) => setState((s) => ({ ...s, version })),
    []
  );

  return {
    ...state,
    /** Version de la fiche (ré)hydratée. */
    setVersion,
    /**
     * À appeler dans le `catch` d'un enregistrement : `true` si l'erreur est
     * le 409 du verrou (la fiche passe « périmée »), `false` sinon — l'écran
     * affiche alors son propre message.
     */
    catchStale: (err: unknown): boolean => {
      if (!isStaleUpdateError(err)) return false;
      setState((s) => ({ ...s, stale: true }));
      return true;
    },
    /**
     * « Recharger » : exécute la relecture (`refetch` réhydrate le formulaire,
     * et donc la version). Succès → la fiche n'est plus périmée ; échec → elle
     * le reste et l'erreur remonte à l'appelant.
     */
    reload: async (refetch: () => Promise<void>): Promise<void> => {
      setState((s) => ({ ...s, reloading: true }));
      try {
        await refetch();
        setState((s) => ({ ...s, stale: false, reloading: false }));
      } catch (err) {
        setState((s) => ({ ...s, reloading: false }));
        throw err;
      }
    },
  };
}
