// features/admin/_shared/list.ts — une liste admin paginée côté serveur, côté
// client (lot L13, docs/PLAN-industrialisation-admin.md).
//
// L'état vit dans l'URL : recherche, tri et page (`useTableQueryState`, les
// mêmes que `DataTable` lit) + les filtres propres à l'écran (`useUrlFilters`).
// Il devient la clé de requête : une vue filtrée se partage par lien, se
// recharge, et revenir en arrière la retrouve sans requête (cache).
//
// Pendant qu'une page suivante charge, la précédente reste affichée
// (`keepPreviousData`) : la table ne clignote pas en « chargement » à chaque
// clic de pagination.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTableQueryState } from '@/hooks/useTableQueryState';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { adminRequest } from '@/utils/admin/adminHttp';
import { adminKey } from './query';

const SEARCH_DEBOUNCE_MS = 250;

export type UseAdminListOptions<K extends string> = {
  /** Domaine de la clé de cache (`['admin', key, …]`). */
  key: string;
  url: string;
  /** Filtres propres à l'écran, lus et écrits dans l'URL. */
  filterKeys?: readonly K[];
  /** Préfixe d'URL si deux tables coexistent (cf. DataTable `queryPrefix`). */
  prefix?: string;
  pageSize?: number;
};

export function useAdminList<
  TPayload extends { items: unknown[]; total: number },
  K extends string = never,
>(options: UseAdminListOptions<K>) {
  const { key, url, prefix = '', pageSize = 25 } = options;
  const table = useTableQueryState(prefix);
  const filterKeys = useMemo(
    () => (options.filterKeys ?? []).map((k) => `${prefix}${k}`),
    [options.filterKeys, prefix]
  );
  const { filters: rawFilters, setFilters } = useUrlFilters(filterKeys);

  // La saisie met l'URL à jour à chaque frappe ; la REQUÊTE attend une pause.
  const [q, setDebouncedQ] = useState(table.q);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(table.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [table.q]);

  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of options.filterKeys ?? []) {
      const v = rawFilters[`${prefix}${k}`];
      if (v) out[k] = v;
    }
    return out;
  }, [rawFilters, options.filterKeys, prefix]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (table.sort) {
      p.set('sort', table.sort);
      p.set('dir', table.dir);
    }
    p.set('page', String(table.page));
    p.set('pageSize', String(pageSize));
    for (const [k, v] of Object.entries(filters)) p.set(k, v);
    return p.toString();
  }, [q, table.sort, table.dir, table.page, pageSize, filters]);

  const query = useQuery({
    queryKey: adminKey(key, 'list', params),
    queryFn: () => adminRequest<TPayload>(`${url}?${params}`),
    placeholderData: keepPreviousData,
  });

  /** Change un filtre ET revient en page 1 (rester en page 4 d'un résultat
   * qui n'en a plus que deux afficherait un vide inexplicable). */
  const setFilter = (name: K, value: string | null) =>
    setFilters({ [`${prefix}${name}`]: value, [`${prefix}page`]: null });

  return {
    ...query,
    items: (query.data?.items ?? []) as TPayload['items'],
    total: query.data?.total ?? null,
    filters: filters as Partial<Record<K, string>>,
    setFilter,
    /** Recherche saisie (URL, non temporisée) — pour un champ hors table. */
    search: table.q,
    setSearch: table.setQ,
    pageSize,
  };
}
