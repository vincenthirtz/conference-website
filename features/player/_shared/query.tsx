// features/player/_shared/query.tsx — cache de requêtes de l'espace joueuse
// (lot P5, docs/PLAN-industrialisation-joueur.md).
//
// POURQUOI PAR PAGE ET PAS DANS `_app`. Même raison que l'admin
// (`features/admin/_shared/query.tsx`) : un provider dans `_app` ferait entrer
// TanStack Query dans le premier chargement du site public. `withPlayerQuery`
// ne le charge que sur les pages joueuse qui s'en servent.
//
// RÉUTILISE LE CLIENT DÉJÀ MONTÉ. Les écrans joueuse sont aussi rendus sous
// l'admin (inspection player-view / captain-view, pages `withAdminQuery`) :
// `PlayerQueryProvider` n'ajoute alors rien et les hooks joueuse lisent le
// cache admin, sous leurs propres clés `['player', …]`. Seule une page
// joueuse autonome reçoit le client joueuse (singleton navigateur, client neuf
// par rendu serveur — jamais de cache partagé entre deux personnes).
//
// CLÉ = SUJET + ÉQUIPE. `playerKey(scope, …)` commence par le sujet inspecté
// et l'équipe active : changer l'un ou l'autre change la clé, donc relit —
// sans invalidation à la main, et sans jamais montrer la donnée d'un sujet
// sous l'en-tête d'un autre.

import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
  type QueryKey,
} from '@tanstack/react-query';
import { useContext, useMemo, type ComponentType, type ReactNode } from 'react';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { ApiHttpError } from '@/utils/http/authedRequest';
import type { PlayerScope } from '@/utils/player/playerHttp';

/** Une 4xx (droit, validation, introuvable, session) ne se corrige pas en réessayant. */
export function playerRetry(count: number, err: unknown): boolean {
  return err instanceof ApiHttpError && err.status < 500 ? false : count < 2;
}

/**
 * Options de chaque lecture joueuse, quel que soit le client qui la porte
 * (joueuse ou admin en inspection). Pas de relecture au retour sur l'onglet :
 * les écrans ne le faisaient pas, et en inspection chaque lecture écrit une
 * ligne de journal staff (`view_player_data`).
 */
export const PLAYER_QUERY_OPTIONS = {
  retry: playerRetry,
  refetchOnWindowFocus: false,
} as const;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, ...PLAYER_QUERY_OPTIONS },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | null = null;

export function getPlayerQueryClient(): QueryClient {
  if (typeof window === 'undefined') return makeClient();
  browserClient ??= makeClient();
  return browserClient;
}

/** Fournit le client joueuse, sauf si un client (admin) est déjà monté. */
export function PlayerQueryProvider({ children }: { children: ReactNode }) {
  const existing = useContext(QueryClientContext);
  if (existing) return <>{children}</>;
  return (
    <QueryClientProvider client={getPlayerQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * Enveloppe une page joueuse. Les propriétés statiques de la page (`seo`, lue
 * par `_app`) sont recopiées sur l'enveloppe : le type rendu est celui de la
 * page.
 */
export function withPlayerQuery<C extends ComponentType<never>>(Page: C): C {
  const Inner = Page as unknown as ComponentType<Record<string, unknown>>;
  function WithPlayerQuery(props: Record<string, unknown>) {
    return (
      <PlayerQueryProvider>
        <Inner {...props} />
      </PlayerQueryProvider>
    );
  }
  Object.assign(WithPlayerQuery, Page);
  WithPlayerQuery.displayName = `withPlayerQuery(${Page.displayName ?? Page.name ?? 'Page'})`;
  return WithPlayerQuery as unknown as C;
}

/** Portée courante de l'écran : sujet inspecté (+ act-as) et équipe active. */
export function usePlayerScope(): PlayerScope {
  const { subjectId, isActingAs } = usePlayerArea();
  const { activeTeamId } = useActiveTeam();
  return useMemo(
    () => ({ subjectId, actAs: isActingAs, teamId: activeTeamId }),
    [subjectId, isActingAs, activeTeamId]
  );
}

/** Racine de toutes les clés joueuse : `['player', <sujet>, <équipe>, …]`. */
export function playerKey(scope: PlayerScope, ...parts: unknown[]): QueryKey {
  return ['player', scope.subjectId ?? 'self', scope.teamId, ...parts];
}
