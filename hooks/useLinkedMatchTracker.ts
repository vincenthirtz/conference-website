// hooks/useLinkedMatchTracker.ts
//
// Suivi du score des matchs du site liés à une scène caster (`data.matchId`) —
// équivalent web de `tournaments:subscribe-match` de l'app desktop.
//
// ⚠️ POURQUOI DU POLLING ET PAS DU REALTIME
// L'app desktop s'abonne en `postgres_changes` sur `public.matches`
// (filtre `id=eq.<matchId>`). Or la table `matches` n'est **pas** membre de la
// publication `supabase_realtime` du projet : sans réplication, Supabase ne
// délivre AUCUN event pour cette table, même à un client authentifié (la policy
// SELECT publique `matches_select_public` existe bien, mais elle ne sert qu'au
// filtrage des events une fois qu'ils sont répliqués). Le score live du desktop
// est donc silencieusement mort ; on ne reproduit pas le bug.
//
// D'où un poll ~10 s des GET publics `/api/caster/v1/matches/:id` — la latence
// est acceptable (un score de map ne bouge pas plus d'une fois par minute) et
// le poll est coupé quand l'onglet n'est pas visible, avec une lecture immédiate
// au retour au premier plan.
//
// POUR PASSER EN REALTIME PLUS TARD : ajouter `matches` à la publication
// (`ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;`, migration
// séparée), puis brancher ici un `useRealtimeChannel({ table: 'matches',
// filter: 'id=eq.<id>' })` qui appelle `refresh()` — le reste du contrat de ce
// hook (onMatchUpdate + tracked) ne change pas. Garder le poll en filet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@/utils/logger';
import { matchScoreChanged } from '@/utils/caster/matchPickerFormat';
import { fetchCasterMatchDetail } from '@/utils/caster/tournamentsClient';
import type { CasterApiMatch } from '@/types/caster';

/** Intervalle de poll du score live (visibility-gated). */
export const LINKED_MATCH_POLL_MS = 10_000;

type Options = {
  /** Ids des matchs liés aux scènes (dédupliqués/triés en interne). */
  matchIds: string[];
  enabled?: boolean;
  intervalMs?: number;
  /**
   * Appelé quand un match suivi a bougé (score ou statut) — et une fois au
   * premier chargement de chaque match. À l'appelant d'écrire dans la scène.
   * Peut être instable : le hook le garde en ref.
   */
  onMatchUpdate: (match: CasterApiMatch) => void;
};

type Return = {
  /** Dernier état connu de chaque match suivi (indicateur « score en direct »). */
  tracked: Record<string, CasterApiMatch>;
  error: string | null;
  refresh: () => void;
};

export function useLinkedMatchTracker({
  matchIds,
  enabled = true,
  intervalMs = LINKED_MATCH_POLL_MS,
  onMatchUpdate,
}: Options): Return {
  const [tracked, setTracked] = useState<Record<string, CasterApiMatch>>({});
  const [error, setError] = useState<string | null>(null);

  // Clé stable de l'ensemble d'ids : `matchIds` est recalculé à chaque reload
  // des scènes ; sans ça l'effet de poll se réarmerait en boucle.
  const idsKey = useMemo(
    () =>
      Array.from(new Set(matchIds.filter(Boolean)))
        .sort()
        .join(','),
    [matchIds]
  );

  const onUpdateRef = useRef(onMatchUpdate);
  onUpdateRef.current = onMatchUpdate;

  // Dernier état par match, pour ne notifier que sur changement réel.
  const lastRef = useRef<Record<string, CasterApiMatch>>({});
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const poll = useCallback(async () => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) return;

    const results = await Promise.allSettled(
      ids.map((id) => fetchCasterMatchDetail(id))
    );
    if (!alive.current) return;

    const next: Record<string, CasterApiMatch> = {};
    let firstError: string | null = null;
    const changed: CasterApiMatch[] = [];

    results.forEach((res, i) => {
      const id = ids[i];
      if (res.status === 'rejected') {
        logger.error(
          '[useLinkedMatchTracker] match fetch error',
          res.reason as unknown
        );
        firstError ||= (res.reason as Error)?.message || 'error';
        // On garde le dernier état connu plutôt que de vider l'indicateur.
        const prev = lastRef.current[id];
        if (prev) next[id] = prev;
        return;
      }
      const match = res.value.match;
      if (!match) return;
      next[id] = match;
      if (matchScoreChanged(lastRef.current[id], match)) changed.push(match);
    });

    lastRef.current = next;
    setTracked(next);
    setError(firstError);
    // Notification APRÈS mise à jour de lastRef : un onMatchUpdate qui écrit en
    // base déclenche un reload des scènes, donc un re-render — la référence doit
    // déjà être à jour pour que le poll suivant ne re-notifie pas.
    for (const m of changed) onUpdateRef.current(m);
  }, [idsKey]);

  const refresh = useCallback(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    if (!enabled || !idsKey) return undefined;

    void poll();

    const timer = setInterval(() => {
      // Onglet en arrière-plan : inutile de marteler l'API, la lecture au retour
      // au premier plan rattrape l'état.
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      void poll();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, idsKey, intervalMs, poll]);

  return { tracked, error, refresh };
}
