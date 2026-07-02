// hooks/useIsrRefresh.ts
//
// Petit hook générique pour les pages ISR (getStaticProps revalidate:N).
//
// Pourquoi : ces pages servent déjà des props FRAÎCHES (le HTML est régénéré
// côté serveur toutes les N secondes). Re-fetcher systématiquement les mêmes
// données au montage double la charge backend sans rien changer à l'écran —
// et sur certaines routes (profil joueuse) ce fetch ré-exécute une agrégation
// lourde. Ce hook adopte donc une politique simple et sûre :
//
//   - state initialisé avec `initial` (les props ISR) ;
//   - AUCUN fetch au montage tant que `initial` est présent (non null/undefined)
//     et que `when !== false` — on fait confiance aux props ISR fraîches ;
//   - fetch au montage UNIQUEMENT si `initial` est absent : c'est le cas
//     fallback ISR (page pas encore générée), où le client doit charger ;
//   - revalidation sur focus / visibilitychange (activée par défaut, coupable
//     via `revalidateOnFocus:false`), avec nettoyage des listeners au démontage.
//
// Le hook ne connaît pas la forme des données : il reçoit un `fetcher` qui
// renvoie soit la donnée fraîche, soit `null` (traité comme "pas de mise à
// jour", l'affichage courant est conservé).

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseIsrRefreshOptions<T> = {
  /** Props ISR (premier rendu). Si présent, pas de fetch au montage. */
  initial: T | null | undefined;
  /**
   * Charge la donnée fraîche côté client. Renvoyer `null` = « rien à mettre à
   * jour » (l'état courant est préservé). Lever = erreur (voir `error`).
   */
  fetcher: () => Promise<T | null>;
  /**
   * Garde d'activation (ex. session/`ready`). `false` désactive tout fetch
   * (montage + focus). Défaut `true`.
   */
  when?: boolean;
  /** Revalider au retour de focus / d'onglet. Défaut `true`. */
  revalidateOnFocus?: boolean;
};

export type UseIsrRefreshResult<T> = {
  data: T | null;
  loading: boolean;
  error: unknown;
  /** Déclenche une revalidation manuelle (ex. bouton « Réessayer »). */
  refresh: () => void;
};

export function useIsrRefresh<T>({
  initial,
  fetcher,
  when = true,
  revalidateOnFocus = true,
}: UseIsrRefreshOptions<T>): UseIsrRefreshResult<T> {
  const hasInitial = initial !== null && initial !== undefined;
  const [data, setData] = useState<T | null>(hasInitial ? (initial as T) : null);
  // On ne montre le spinner que si on n'a rien à afficher (fallback ISR).
  const [loading, setLoading] = useState(!hasInitial && when);
  const [error, setError] = useState<unknown>(null);

  // Garde le dernier fetcher/garde sans les mettre dans les deps des effets,
  // pour ne pas re-déclencher un fetch au montage à chaque render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const whenRef = useRef(when);
  whenRef.current = when;

  const runFetch = useCallback(async () => {
    if (!whenRef.current) return;
    // Spinner seulement si on n'a rien à afficher (fallback ISR). On lit `data`
    // via l'updater fonctionnel pour garder `runFetch` stable (deps vides).
    setData((prev) => {
      if (prev === null) setLoading(true);
      return prev;
    });
    setError(null);
    try {
      const next = await fetcherRef.current();
      if (next !== null && next !== undefined) setData(next);
    } catch (err) {
      // On ne bascule en erreur que si on n'a rien à afficher : sinon on
      // conserve l'affichage pré-rempli (ISR) et on avale l'échec du refresh.
      setData((prev) => {
        if (prev === null) setError(err);
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void runFetch();
  }, [runFetch]);

  // Montage : fetch UNIQUEMENT en fallback ISR (pas de props initiales).
  useEffect(() => {
    if (!when) return;
    if (hasInitial) return;
    void runFetch();
    // On ne veut ce fetch qu'au montage / quand `when` s'active en fallback.
  }, [when, hasInitial, runFetch]);

  // Revalidation sur focus / retour d'onglet.
  useEffect(() => {
    if (!revalidateOnFocus) return undefined;
    if (!when) return undefined;
    const onFocus = () => void runFetch();
    const onVisible = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        void runFetch();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [revalidateOnFocus, when, runFetch]);

  return { data, loading, error, refresh };
}
