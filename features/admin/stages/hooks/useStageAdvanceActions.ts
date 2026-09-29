// features/admin/stages/hooks/useStageAdvanceActions.ts — la modale
// « Faire avancer des équipes » de la fiche phase
// (pages/admin/stages/[stageId].tsx) : ouverture (classement + phases cibles),
// présélection Top N / score mini / victoires mini, cases à cocher, envoi.
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis la page (lot 9B) : seuls les accès à
// l'état et aux outils de la page deviennent des paramètres. La page reste
// propriétaire de tous les useState ; les tableaux de dépendances d'origine
// sont conservés tels quels.

import { type Dispatch, type SetStateAction, useCallback } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { useAdminFetch } from '@/hooks/useAdminFetch';
import type { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { useToast } from '@/components/Toast';
import type { Dict } from '@/components/admin/stages/[stageId]/stageDisplay';
import type { AdvanceStanding } from '@/components/admin/stages/[stageId]/AdvanceStandingsTable';
import type { StageOption } from '@/utils/stages/stageOption';
import type { Stage } from '@/types/admin';
import { logger } from '@/utils/logger';

type Setter<T> = Dispatch<SetStateAction<T>>;

export type StageAdvanceActionsDeps = {
  t: Dict;
  stageId: string | string[] | undefined;
  stage: Stage | null;
  adminFetch: ReturnType<typeof useAdminFetch>['adminFetch'];
  advanceMutate: ReturnType<typeof useIdempotentMutation>['mutate'];
  addToast: ReturnType<typeof useToast>['addToast'];
  setErrorMsg: Setter<string | null>;
  advanceStandings: AdvanceStanding[];
  setAdvanceStandings: Setter<AdvanceStanding[]>;
  advanceSelectedIds: Set<string>;
  setAdvanceSelectedIds: Setter<Set<string>>;
  setAdvanceTopN: Setter<string>;
  advanceTargetStageId: string;
  setAdvanceTargetStageId: Setter<string>;
  advanceSeedMode: 'rank' | 'manual' | 'none';
  setAdvanceSeedMode: Setter<'rank' | 'manual' | 'none'>;
  setAdvanceOtherStages: Setter<
    { id: string; name: string; stage_type: string | null }[]
  >;
  setAdvanceMinScore: Setter<string>;
  setAdvanceMinWins: Setter<string>;
  setAdvanceLoading: Setter<boolean>;
  setAdvanceSubmitting: Setter<boolean>;
  setShowAdvanceModal: Setter<boolean>;
};

export function useStageAdvanceActions(deps: StageAdvanceActionsDeps) {
  const {
    t,
    stageId,
    stage,
    adminFetch,
    advanceMutate,
    addToast,
    setErrorMsg,
    advanceStandings,
    setAdvanceStandings,
    advanceSelectedIds,
    setAdvanceSelectedIds,
    setAdvanceTopN,
    advanceTargetStageId,
    setAdvanceTargetStageId,
    advanceSeedMode,
    setAdvanceSeedMode,
    setAdvanceOtherStages,
    setAdvanceMinScore,
    setAdvanceMinWins,
    setAdvanceLoading,
    setAdvanceSubmitting,
    setShowAdvanceModal,
  } = deps;

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const openAdvanceModal = useCallback(async () => {
    if (!stageId || !stage) return;
    setShowAdvanceModal(true);
    setAdvanceLoading(true);
    setAdvanceSelectedIds(new Set());
    setAdvanceTopN('');
    setAdvanceMinScore('');
    setAdvanceMinWins('');
    setAdvanceTargetStageId('');
    setAdvanceSeedMode('rank');

    try {
      // Fetch standings and other stages in parallel
      const [standingsRes, stagesRes] = await Promise.all([
        adminFetch(`/api/admin/stages/${stageId}/standings`),
        adminFetch(`/api/admin/tournament/${stage.tournament_id}/stages`),
      ]);

      if (standingsRes.ok) {
        const json = await standingsRes.json();
        setAdvanceStandings(json.standings || []);
      }

      if (stagesRes.ok) {
        const json = await stagesRes.json();
        const others = ((json.stages || []) as StageOption[])
          .filter((s) => s.id !== stageId)
          .map((s) => ({
            id: s.id,
            name: s.name,
            stage_type: s.stage_type,
          }));
        setAdvanceOtherStages(others);
        if (others.length > 0) setAdvanceTargetStageId(others[0].id);
      }
    } catch (err) {
      logger.error('openAdvanceModal error:', err);
    } finally {
      setAdvanceLoading(false);
    }
  }, [stageId, stage, adminFetch]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleAdvanceTopN = useCallback(
    (value: string) => {
      setAdvanceTopN(value);
      setAdvanceMinScore('');
      setAdvanceMinWins('');
      const n = parseInt(value, 10);
      if (!isNaN(n) && n > 0) {
        const ids = new Set(advanceStandings.slice(0, n).map((s) => s.teamId));
        setAdvanceSelectedIds(ids);
      }
    },
    [advanceStandings]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleAdvanceMinScore = useCallback(
    (value: string) => {
      setAdvanceMinScore(value);
      setAdvanceTopN('');
      setAdvanceMinWins('');
      const threshold = parseFloat(value);
      if (!isNaN(threshold)) {
        const ids = new Set(
          advanceStandings
            .filter((s) => s.score >= threshold)
            .map((s) => s.teamId)
        );
        setAdvanceSelectedIds(ids);
      }
    },
    [advanceStandings]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleAdvanceMinWins = useCallback(
    (value: string) => {
      setAdvanceMinWins(value);
      setAdvanceTopN('');
      setAdvanceMinScore('');
      const threshold = parseInt(value, 10);
      if (!isNaN(threshold) && threshold > 0) {
        const ids = new Set(
          advanceStandings
            .filter((s) => s.wins >= threshold)
            .map((s) => s.teamId)
        );
        setAdvanceSelectedIds(ids);
      }
    },
    [advanceStandings]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const toggleAdvanceTeam = useCallback((teamId: string) => {
    setAdvanceSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    setAdvanceTopN('');
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const toggleAdvanceAll = useCallback(() => {
    setAdvanceSelectedIds((prev) =>
      prev.size === advanceStandings.length
        ? new Set()
        : new Set(advanceStandings.map((s) => s.teamId))
    );
    setAdvanceTopN('');
  }, [advanceStandings]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleAdvanceSubmit = useCallback(async () => {
    if (!stageId || advanceSelectedIds.size === 0 || !advanceTargetStageId)
      return;
    setAdvanceSubmitting(true);
    setErrorMsg(null);

    // Preserve standings order for the selected teams
    const orderedIds = advanceStandings
      .filter((s) => advanceSelectedIds.has(s.teamId))
      .map((s) => s.teamId);

    try {
      const res = await advanceMutate(`/api/admin/stages/${stageId}/advance`, {
        method: 'POST',
        body: JSON.stringify({
          targetStageId: advanceTargetStageId,
          teamIds: orderedIds,
          seedMode: advanceSeedMode,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errAdvance);
      }

      const json = await res.json();
      const advancedCount = json.advanced?.length ?? 0;
      const skippedCount = json.skipped?.length ?? 0;

      let msg = format(t.toastAdvanced, { count: advancedCount });
      if (skippedCount > 0) {
        msg += ' ' + format(t.toastAdvancedSkipped, { count: skippedCount });
      }

      addToast(msg, 'success');
      setShowAdvanceModal(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errAdvance);
    } finally {
      setAdvanceSubmitting(false);
    }
  }, [
    stageId,
    advanceSelectedIds,
    advanceTargetStageId,
    advanceStandings,
    advanceSeedMode,
    advanceMutate,
    addToast,
    t,
  ]);

  return {
    openAdvanceModal,
    handleAdvanceTopN,
    handleAdvanceMinScore,
    handleAdvanceMinWins,
    toggleAdvanceTeam,
    toggleAdvanceAll,
    handleAdvanceSubmit,
  };
}
