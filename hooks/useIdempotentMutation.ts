// hooks/useIdempotentMutation.ts
//
// Helper React pour envoyer des mutations admin protégées par Idempotency-Key
// (cf. utils/adminIdempotency.ts côté serveur).
//
// Pattern d'usage :
//
//   const { mutate, key, regenerate } = useIdempotentMutation();
//
//   async function onClick() {
//     try {
//       const res = await mutate('/api/admin/scrims', {
//         method: 'POST',
//         body: JSON.stringify({ name: '...' }),
//       });
//       // ...
//     } catch (e) { ... }
//   }
//
// Sémantique de la clé :
//   - Une clé est associée à UNE intention utilisateur ("créer ce scrim").
//   - Tant que la clé n'est pas régénérée, deux mutate() consécutifs avec
//     le même body sont déduplicqués côté serveur (la 2e réponse rejoue
//     la 1ère, header `Idempotency-Replay: true`).
//   - Pour une NOUVELLE intention (autre scrim, autre auto-schedule, etc.)
//     appeler `regenerate()` ou créer une nouvelle instance du hook.
//
// Par défaut, la clé est régénérée automatiquement après une réponse 2xx
// (mode form-style : le bouton "Créer" peut être recliqué pour une nouvelle
// création). Désactivable via `autoRegenerateOnSuccess: false` pour les
// flows où le client doit garder le contrôle de la durée de vie de la clé.

import { useCallback, useRef } from 'react';
import { useAdminFetch, type AdminFetchOptions } from './useAdminFetch';

function generateKey(): string {
  // crypto.randomUUID est dispo dans tous les navigateurs modernes + Node 19+
  // (Next 16 / React 19 = baseline ES2022). Fallback Math.random pour les
  // contextes très anciens, sans garantie de collision.
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export type UseIdempotentMutationOptions = {
  /**
   * Si true (défaut), régénère automatiquement la clé après une réponse 2xx.
   * Mettre à false si le client veut explicitement contrôler la durée de vie
   * (ex: wizard multi-étapes où chaque étape doit replay si retry).
   */
  autoRegenerateOnSuccess?: boolean;
};

export type UseIdempotentMutationApi = {
  /** Clé actuellement attachée à la prochaine mutation. */
  key: string;
  /** Force la génération d'une nouvelle clé. */
  regenerate: () => string;
  /**
   * Wrapper sur `adminFetch` qui injecte automatiquement `Idempotency-Key`.
   * Retourne la Response brute (comme adminFetch). Pour parser JSON et
   * throw, utiliser `mutateJson`.
   */
  mutate: (input: string, init?: AdminFetchOptions) => Promise<Response>;
  /**
   * Version JSON : parse + throw AdminFetchError sur erreur.
   */
  mutateJson: <T = unknown>(
    input: string,
    init?: AdminFetchOptions
  ) => Promise<T>;
};

export function useIdempotentMutation(
  options: UseIdempotentMutationOptions = {}
): UseIdempotentMutationApi {
  const { autoRegenerateOnSuccess = true } = options;
  const { adminFetch, adminFetchJson } = useAdminFetch();

  // useRef pour que la clé reste stable entre renders (vs useState qui
  // déclencherait un re-render à chaque regenerate).
  const keyRef = useRef<string>(generateKey());

  const regenerate = useCallback((): string => {
    keyRef.current = generateKey();
    return keyRef.current;
  }, []);

  const injectKey = useCallback(
    (init: AdminFetchOptions = {}): AdminFetchOptions => {
      const headers = new Headers(init.headers);
      // Ne pas écraser si le caller a déjà fourni la clé explicitement.
      if (!headers.has('Idempotency-Key')) {
        headers.set('Idempotency-Key', keyRef.current);
      }
      return { ...init, headers };
    },
    []
  );

  const mutate = useCallback(
    async (
      input: string,
      init: AdminFetchOptions = {}
    ): Promise<Response> => {
      const res = await adminFetch(input, injectKey(init));
      if (autoRegenerateOnSuccess && res.ok) {
        keyRef.current = generateKey();
      }
      return res;
    },
    [adminFetch, injectKey, autoRegenerateOnSuccess]
  );

  const mutateJson = useCallback(
    async <T = unknown>(
      input: string,
      init: AdminFetchOptions = {}
    ): Promise<T> => {
      const out = await adminFetchJson<T>(input, injectKey(init));
      // adminFetchJson throw sur erreur, donc si on arrive ici c'est 2xx.
      if (autoRegenerateOnSuccess) {
        keyRef.current = generateKey();
      }
      return out;
    },
    [adminFetchJson, injectKey, autoRegenerateOnSuccess]
  );

  return {
    get key() {
      return keyRef.current;
    },
    regenerate,
    mutate,
    mutateJson,
  };
}
