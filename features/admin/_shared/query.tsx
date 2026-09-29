// features/admin/_shared/query.tsx — cache de requêtes de l'admin (lot L10,
// docs/PLAN-industrialisation-admin.md).
//
// POURQUOI PAR PAGE ET PAS DANS `_app`. Un provider dans `_app` ferait entrer
// TanStack Query dans le premier chargement des ~250 pages, publiques
// comprises (cf. scripts/bundle-budget.mjs). `withAdminQuery(Page)` ne le
// charge que sur les pages admin qui s'en servent.
//
// Le client est UN SINGLETON côté navigateur : le cache survit à la
// navigation d'une page admin à l'autre (revenir à une liste ne la recharge
// pas de zéro). Côté serveur, un client neuf par rendu — jamais de cache
// partagé entre deux requêtes, donc entre deux staffs.

import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { AdminHttpError } from '@/utils/admin/adminHttp';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 30 s : une liste revisitée dans la demi-minute s'affiche sans
        // requête ; au-delà, elle se rafraîchit en arrière-plan.
        staleTime: 30_000,
        // Une erreur 4xx ne se corrige pas en réessayant (droit, validation,
        // introuvable) ; une 5xx ou une coupure réseau, peut-être.
        retry: (count, err) =>
          err instanceof AdminHttpError && err.status < 500 ? false : count < 2,
      },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | null = null;

export function getAdminQueryClient(): QueryClient {
  if (typeof window === 'undefined') return makeClient();
  browserClient ??= makeClient();
  return browserClient;
}

export function withAdminQuery<P extends object>(
  Page: ComponentType<P>
): ComponentType<P> {
  function WithAdminQuery(props: P) {
    return (
      <QueryClientProvider client={getAdminQueryClient()}>
        <Page {...props} />
      </QueryClientProvider>
    );
  }
  WithAdminQuery.displayName = `withAdminQuery(${Page.displayName ?? Page.name ?? 'Page'})`;
  return WithAdminQuery;
}

/** Racine de toutes les clés de l'admin : `['admin', <domaine>, …]`. */
export function adminKey(...parts: unknown[]): QueryKey {
  return ['admin', ...parts];
}

/**
 * Options d'une lecture qui HYDRATE UN FORMULAIRE d'édition (fiche `[id]`).
 *
 * Un rafraîchissement automatique (focus de l'onglet, reconnexion) écraserait
 * la saisie en cours : on ne relit qu'à l'ouverture de la fiche, comme avant
 * la migration. `gcTime: 0` jette la donnée en quittant la page — rouvrir la
 * fiche la relit du serveur, jamais d'une copie vieille de plusieurs minutes.
 */
export const EDITOR_QUERY_OPTIONS = {
  staleTime: 0,
  gcTime: 0,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
