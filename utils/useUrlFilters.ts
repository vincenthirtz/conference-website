// utils/useUrlFilters.ts
// Hook pour synchroniser les filtres admin avec les query params URL.
// Les filtres sont persistés dans l'URL → rechargement / partage conserve l'état.

import { useRouter } from 'next/router';
import { useCallback, useMemo } from 'react';

type FilterValue = string | null;

/**
 * Hook qui lit les filtres depuis les query params URL
 * et expose un setter qui met à jour l'URL (shallow routing).
 *
 * @param keys Liste des noms de filtres à gérer (ex: ['search', 'status', 'offset'])
 *
 * @example
 * const { filters, setFilter, setFilters, resetFilters } = useUrlFilters([
 *   'search', 'status', 'tournamentId', 'offset',
 * ]);
 *
 * // Lire
 * filters.search   // string | null
 *
 * // Écrire (met à jour l'URL)
 * setFilter('search', 'Fnatic');
 * setFilter('offset', null); // supprime le param
 *
 * // Écrire plusieurs à la fois (un seul push URL)
 * setFilters({ search: 'Fnatic', offset: null });
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const router = useRouter();

  const filters = useMemo(() => {
    const result = {} as Record<K, FilterValue>;
    for (const key of keys) {
      const raw = router.query[key];
      result[key] = typeof raw === 'string' && raw !== '' ? raw : null;
    }
    return result;
    // router.query reference changes on navigation; keys is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query, ...keys]);

  const setFilters = useCallback(
    (updates: Partial<Record<K, FilterValue>>) => {
      const query = { ...router.query };

      for (const [key, value] of Object.entries(updates) as [K, FilterValue][]) {
        if (value === null || value === '') {
          delete query[key];
        } else {
          query[key] = value;
        }
      }

      router.push({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    },
    [router]
  );

  const setFilter = useCallback(
    (key: K, value: FilterValue) => {
      setFilters({ [key]: value } as Partial<Record<K, FilterValue>>);
    },
    [setFilters]
  );

  const resetFilters = useCallback(() => {
    // Garder uniquement les params dynamiques du pathname (ex: [id])
    const query: Record<string, string | string[]> = {};
    const pathParams = (router.pathname.match(/\[(\w+)\]/g) || []).map((p) =>
      p.slice(1, -1)
    );
    for (const p of pathParams) {
      if (router.query[p]) {
        query[p] = router.query[p] as string;
      }
    }
    router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  }, [router]);

  return { filters, setFilter, setFilters, resetFilters };
}
