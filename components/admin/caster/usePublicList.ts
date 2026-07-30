// components/admin/caster/usePublicList.ts
//
// Chargement d'une liste de référence de l'API publique du site pour les pickers
// des scènes « données du site » (lot 6). Colocalisé avec les éditeurs, comme
// useSceneDraft/useObs : c'est de la plomberie de formulaire, pas un hook
// transverse.
//
// `items === null` = pas encore chargé (le picker affiche « Chargement… » et
// reste désactivé) ; une erreur retombe sur une liste vide + message, jamais un
// écran vide — le caster peut toujours recharger sans quitter la page.

import { useEffect, useState } from 'react';

export type PublicListState<T> = {
  /** null = premier chargement en cours (un rechargement garde la liste). */
  items: T[] | null;
  error: string | null;
  /** Relance le GET (bouton « Recharger la liste »). */
  reload: () => void;
};

export function usePublicList<T>(
  fetcher: () => Promise<T[]>,
  { enabled = true }: { enabled?: boolean } = {}
): PublicListState<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);

  // `fetcher` EST une dépendance de l'effet : les appelants passent une fonction
  // de module (fetchPublicTournaments…), donc une référence stable — pas de
  // boucle. Un appelant qui passerait une closure devrait la mémoïser.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const rows = await fetcher();
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message || 'error');
        // Liste vide plutôt que « chargement » perpétuel : le select redevient
        // utilisable (option fantôme de la sélection mémorisée incluse).
        setItems((prev) => prev ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seq, enabled, fetcher]);

  return { items, error, reload: () => setSeq((n) => n + 1) };
}
