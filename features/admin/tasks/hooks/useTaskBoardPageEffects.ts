// features/admin/tasks/hooks/useTaskBoardPageEffects.ts — effets de la page
// du tableau de tâches sortis tels quels de pages/admin/tasks/index.tsx (la
// page est plafonnée par adminFileSizeGuard) : toasts d'échec de lecture et
// board actif reflété dans l'adresse (`?board=`).

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import type { Dict } from '@/components/admin/tasks/taskBoardModel';
import type { AddToast } from './taskBoardHookTypes';

/** Échecs de lecture : mêmes toasts qu'avant la migration vers le cache. */
export function useTaskBoardLoadErrors(
  t: Dict,
  addToast: AddToast,
  errors: {
    detail: Error | null;
    mine: Error | null;
    staff: Error | null;
  }
) {
  const { detail, mine, staff } = errors;
  useEffect(() => {
    if (detail) addToast(detail.message || t.errorLoad, 'error');
  }, [detail, addToast, t]);
  useEffect(() => {
    if (mine) addToast(mine.message || t.myTasksLoadError, 'error');
  }, [mine, addToast, t]);
  useEffect(() => {
    if (staff) addToast(t.staffLoadError, 'error');
  }, [staff, addToast, t]);
}

/**
 * Reflète le board actif dans l'adresse (`?board=`) — shallow, sans
 * rechargement — pour qu'un rafraîchissement ou un lien partagé rouvre le même
 * board. Dépendances limitées à `activeBoardId` pour ne pas relire la liste
 * des boards à chaque changement d'adresse.
 */
export function useTaskBoardUrlSync(activeBoardId: string | null) {
  const router = useRouter();
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    if (!activeBoardId || router.query.board === activeBoardId) return;
    router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, board: activeBoardId },
      },
      undefined,
      { shallow: true }
    );
  }, [activeBoardId]);
}
