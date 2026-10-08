// features/admin/stages/hooks/useStageTeamDisqualification.tsx —
// disqualifier / réintégrer une équipe d'une phase
// (`/api/admin/stages/[stageId]/disqualify`).
//
// Le hook porte tout le geste : la modale de disqualification, la
// confirmation de réintégration, les toasts et le bandeau des matchs à
// traiter à la main. L'écran n'a qu'à rendre `ui` et brancher deux boutons —
// pages/admin/stages/[stageId]/teams.tsx est sous plafond de taille.
//
// Après chaque geste, tout ce qui dépend de la phase est relu
// (`stageKeys.one`) : liste des équipes, classements.

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import {
  type DisqualifyTeamRequest,
  type DisqualifyTeamResponse,
  type ReinstateTeamResponse,
  stageUrls,
} from '../client';
import type { DisqualifyDraft } from '../ui/DisqualifyTeamModal';
import { stageKeys } from './keys';

// Chargées à la demande : la modale ne s'ouvre qu'au clic, le bandeau qu'après
// une disqualification incomplète. Hors du JS de premier chargement de la page
// (cf. scripts/bundle-budget.mjs).
const DisqualifyTeamModal = dynamic(() => import('../ui/DisqualifyTeamModal'), {
  ssr: false,
});
const DisqualificationReport = dynamic(
  () => import('../ui/DisqualificationReport'),
  { ssr: false }
);

/** Des matchs restent à traiter à la main : le bandeau doit s'afficher. */
export function needsManualFollowUp(res: DisqualifyTeamResponse): boolean {
  return !res.complete || res.skipped.length > 0;
}

type Dict = typeof nsAdminStageTeams.fr;

/** Ce que le hook lit d'une ligne de `GET …/teams`. */
export type DisqualifiableTeam = {
  team_id: string;
  team: { name: string } | null;
};

/** Message d'erreur localisé à partir du `code` serveur, sinon son message. */
export function disqualificationErrorMessage(
  err: unknown,
  fallback: string,
  t: Dict
): string {
  const code = (err as { payload?: { code?: string } } | null)?.payload?.code;
  switch (code) {
    case 'ALREADY_DISQUALIFIED':
      return t.dqErrAlready;
    case 'TOURNAMENT_COMPLETED':
      return t.dqErrCompleted;
    case 'TEAM_NOT_IN_STAGE':
      return t.dqErrNotInStage;
    case 'NOT_DISQUALIFIED':
      return t.rsErrNotDisqualified;
    default:
      return (err as Error | null)?.message || fallback;
  }
}

/** Toast de succès : nombre de forfaits ou d'annulations selon le mode. */
export function disqualifyToast(res: DisqualifyTeamResponse, t: Dict): string {
  const team = res.teamName ?? res.teamId.slice(0, 8);
  const count =
    res.mode === 'annul' ? res.cancelled.length : res.forfeited.length;
  const key =
    res.mode === 'annul'
      ? count > 1
        ? t.dqToastAnnul_other
        : t.dqToastAnnul_one
      : count > 1
        ? t.dqToastForfeit_other
        : t.dqToastForfeit_one;
  return format(key, { team, count });
}

const nameOf = (row: DisqualifiableTeam) =>
  row.team?.name ?? row.team_id.slice(0, 8);

export function useStageTeamDisqualification(stageId: string) {
  const t = useAdminT(nsAdminStageTeams);
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { mutateJson: disqualifyMutate } = useIdempotentMutation();
  const { mutateJson: reinstateMutate } = useIdempotentMutation();

  const [target, setTarget] = useState<DisqualifiableTeam | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [report, setReport] = useState<DisqualifyTeamResponse | null>(null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: stageKeys.one(stageId) }),
    [queryClient, stageId]
  );

  const openDisqualify = useCallback((row: DisqualifiableTeam) => {
    setTarget(row);
  }, []);

  const submitDisqualify = useCallback(
    async (draft: DisqualifyDraft) => {
      if (!target || !stageId) return;
      setSubmitting(true);
      try {
        const body: DisqualifyTeamRequest = {
          team_id: target.team_id,
          mode: draft.mode,
          reason: draft.reason.trim(),
        };
        const res = await disqualifyMutate<DisqualifyTeamResponse>(
          stageUrls.disqualify(stageId),
          { method: 'POST', body: JSON.stringify(body) }
        );
        addToast(disqualifyToast(res, t), 'success');
        setReport(needsManualFollowUp(res) ? res : null);
        setTarget(null);
        void refresh();
      } catch (err) {
        addToast(disqualificationErrorMessage(err, t.dqErr, t), 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [target, stageId, disqualifyMutate, addToast, t, refresh]
  );

  const reinstate = useCallback(
    async (row: DisqualifiableTeam) => {
      if (!stageId) return;
      const team = nameOf(row);
      const ok = await confirm({
        title: format(t.rsConfirmTitle, { team }),
        subtitle: t.rsConfirmSubtitle,
        variant: 'warning',
        confirmLabel: t.reinstate,
      });
      if (!ok) return;
      setBusyTeamId(row.team_id);
      try {
        const res = await reinstateMutate<ReinstateTeamResponse>(
          stageUrls.reinstate(stageId, row.team_id),
          { method: 'DELETE' }
        );
        const n = res.matchesNotRestored ?? 0;
        addToast(
          n === 0
            ? format(t.rsToast, { team })
            : format(
                n > 1 ? t.rsToastNotRestored_other : t.rsToastNotRestored_one,
                { team, count: n }
              ),
          n === 0 ? 'success' : 'warning'
        );
        void refresh();
      } catch (err) {
        addToast(disqualificationErrorMessage(err, t.rsErr, t), 'error');
      } finally {
        setBusyTeamId(null);
      }
    },
    [stageId, confirm, t, reinstateMutate, addToast, refresh]
  );

  const ui = (
    <>
      {dialog}
      {target && (
        <DisqualifyTeamModal
          key={target.team_id}
          teamName={nameOf(target)}
          submitting={submitting}
          onClose={() => setTarget(null)}
          onConfirm={submitDisqualify}
        />
      )}
      {report && (
        <DisqualificationReport
          result={report}
          onDismiss={() => setReport(null)}
        />
      )}
    </>
  );

  return { openDisqualify, reinstate, busyTeamId, ui };
}
