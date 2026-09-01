// hooks/useTableQueryState.ts
//
// État de liste PERSISTÉ DANS L'URL — lot A5 de docs/PLAN-espace-admin.md.
//
// Pourquoi l'URL et pas un `useState` : un filtre appliqué dans un écran admin
// est presque toujours quelque chose qu'on veut MONTRER à quelqu'un d'autre
// (« regarde, ces trois équipes »). Dans un état local, il n'est ni partageable,
// ni rechargeable, ni retrouvable au retour arrière. Dans l'URL, les trois sont
// gratuits.
//
// La navigation est `shallow` : changer un tri ne relance pas
// `getServerSideProps`, donc ne recharge pas la page.

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';

export type TableQueryState = {
  /** Recherche texte. */
  q: string;
  /** Clé de colonne triée, ou `null`. */
  sort: string | null;
  dir: 'asc' | 'desc';
  /** Page courante, 1-indexée. */
  page: number;
};

export type TableQueryApi = TableQueryState & {
  setQ: (value: string) => void;
  /** Bascule asc → desc → aucun tri sur la même colonne. */
  toggleSort: (key: string) => void;
  setPage: (page: number) => void;
};

function readString(value: unknown): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

/**
 * `prefix` évite la collision quand deux tables coexistent sur une page à
 * onglets : `?teams_q=` et `?members_q=` plutôt qu'un `?q=` disputé.
 */
export function useTableQueryState(prefix = ''): TableQueryApi {
  const router = useRouter();
  const key = useCallback((name: string) => `${prefix}${name}`, [prefix]);

  const state = useMemo<TableQueryState>(() => {
    const q = readString(router.query[key('q')]);
    const sort = readString(router.query[key('sort')]) || null;
    const dir =
      readString(router.query[key('dir')]) === 'desc' ? 'desc' : 'asc';
    const rawPage = Number.parseInt(readString(router.query[key('page')]), 10);
    return {
      q,
      sort,
      dir,
      page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    };
  }, [router.query, key]);

  const patch = useCallback(
    (values: Record<string, string | null>) => {
      const next: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(router.query)) {
        if (v !== undefined) next[k] = v;
      }
      for (const [name, value] of Object.entries(values)) {
        if (value === null || value === '') delete next[name];
        else next[name] = value;
      }
      router.replace({ pathname: router.pathname, query: next }, undefined, {
        shallow: true,
      });
    },
    [router]
  );

  const setQ = useCallback(
    (value: string) => {
      // Toute recherche ramène en page 1 : rester en page 4 d'un résultat qui
      // n'a plus que deux pages affiche un vide inexplicable.
      patch({ [key('q')]: value || null, [key('page')]: null });
    },
    [patch, key]
  );

  const toggleSort = useCallback(
    (column: string) => {
      if (state.sort !== column) {
        patch({ [key('sort')]: column, [key('dir')]: 'asc' });
        return;
      }
      if (state.dir === 'asc') {
        patch({ [key('sort')]: column, [key('dir')]: 'desc' });
        return;
      }
      // Troisième clic : retour à l'ordre naturel de la liste, qui porte
      // souvent une information (la plus récente d'abord, par exemple).
      patch({ [key('sort')]: null, [key('dir')]: null });
    },
    [patch, key, state.sort, state.dir]
  );

  const setPage = useCallback(
    (page: number) => {
      patch({ [key('page')]: page > 1 ? String(page) : null });
    },
    [patch, key]
  );

  return { ...state, setQ, toggleSort, setPage };
}
