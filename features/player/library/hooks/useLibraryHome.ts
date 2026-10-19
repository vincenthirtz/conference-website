// features/player/library/hooks/useLibraryHome.ts — les lectures de l'écran
// « Mon appartement » sur le cache joueuse (lot 4 de docs/PLAN-womens-library.md).
//
// `me` DÉCIDE DE LA PORTE : son refus 403 dit quel écran montrer (attestation,
// mineure, bannie — `libraryGateOf`). Le catalogue et l'appartement ne sont
// lus qu'une fois la porte franchie : ils répondraient le même refus, et
// l'appartement serait CRÉÉ pour rien à la première lecture.
//
// UNE LECTURE RATÉE A SON ÉCRAN, jamais une Library vide inventée.

import { useQuery } from '@tanstack/react-query';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  playerRetry,
  usePlayerScope,
} from '../../_shared/query';
import { useLibraryClient } from '../clientContext';
import { libraryErrorCode, libraryGateOf } from '../model';

/**
 * Comme `playerRetry` (pas de nouvel essai sur une 4xx), plus : une Library
 * dont les tables manquent (`library_unavailable`, migration non appliquée) ne
 * reviendra pas en réessayant dans la seconde — l'écran le dit tout de suite.
 */
const LIBRARY_QUERY_OPTIONS = {
  ...PLAYER_QUERY_OPTIONS,
  retry: (count: number, err: unknown) =>
    libraryErrorCode(err) === 'library_unavailable'
      ? false
      : playerRetry(count, err),
};

export const libraryKeys = {
  me: (scope: PlayerScope) => playerKey(scope, 'library', 'me'),
  catalog: (scope: PlayerScope) => playerKey(scope, 'library', 'catalog'),
  apartment: (scope: PlayerScope) => playerKey(scope, 'library', 'apartment'),
  /** Le manifeste des sprites : statique, commun à toutes. */
  manifest: () => ['player', 'library', 'manifest'] as const,
};

/** Le catalogue est en code : il ne change qu'au déploiement. */
const CATALOG_STALE_MS = 5 * 60_000;

export function useLibraryHome() {
  const scope = usePlayerScope();
  const libraryClient = useLibraryClient();
  const me = useQuery({
    queryKey: libraryKeys.me(scope),
    queryFn: () => libraryClient.me(),
    ...LIBRARY_QUERY_OPTIONS,
  });
  const gate = libraryGateOf({ isPending: me.isPending, error: me.error });
  const ready = gate === 'ready';

  const catalog = useQuery({
    queryKey: libraryKeys.catalog(scope),
    queryFn: () => libraryClient.catalog(),
    enabled: ready,
    staleTime: CATALOG_STALE_MS,
    ...LIBRARY_QUERY_OPTIONS,
  });
  const apartment = useQuery({
    queryKey: libraryKeys.apartment(scope),
    queryFn: () => libraryClient.apartment(),
    enabled: ready,
    ...LIBRARY_QUERY_OPTIONS,
  });

  return {
    gate,
    me: me.data ?? null,
    catalog: catalog.data ?? null,
    catalogFailed: catalog.isError,
    apartment: apartment.data ?? null,
    apartmentFailed: apartment.isError,
    /** Relit ce qui a échoué (porte, catalogue, appartement). */
    retry: () => {
      if (me.isError) void me.refetch();
      if (catalog.isError) void catalog.refetch();
      if (apartment.isError) void apartment.refetch();
    },
  };
}

/**
 * Le manifeste des sprites (vignettes de la boutique, des meubles, des
 * avatars). Le parseur vit dans le moteur : il est chargé à la demande, pour
 * rester hors du premier chargement de la page. `null` = pas de manifeste
 * (vignettes de remplacement) — jamais une erreur.
 */
export function useLibraryManifest(enabled: boolean) {
  return useQuery({
    queryKey: libraryKeys.manifest(),
    queryFn: async () => {
      const { loadManifest } = await import('../engine/assets');
      return loadManifest();
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
