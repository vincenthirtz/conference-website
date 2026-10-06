// features/admin/stages/hooks/useTiebreakerOverrides.ts — dérogations de
// départage d'une phase (`/api/admin/stages/[stageId]/tiebreaker-override`) :
// lecture, ajout (« A passe devant B », motif obligatoire), retrait.
//
// Le serveur invalide le cache du classement à chaque geste ; `onChanged`
// laisse l'écran relire SON classement (la modale d'avancement le tient en
// état local, pas en cache react-query).

import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format } from '@/lib/i18n/useAdminT';
import type { Dict } from '@/components/admin/stages/[stageId]/stageDisplay';
import { type TiebreakerOverride, stageUrls } from '../client';
import { useStageRead } from './useStage';

export type OverrideDraft = {
  winnerTeamId: string;
  loserTeamId: string;
  reason: string;
};

type TeamScore = { teamId: string; score: number };

/**
 * Contrôle avant envoi. Renvoie la CLÉ i18n de l'erreur, `null` si valide.
 * Le moteur ne permute que deux équipes à égalité de points : une dérogation
 * entre scores différents serait enregistrée… et sans effet.
 */
export function validateOverrideDraft(
  draft: OverrideDraft,
  standings: TeamScore[]
):
  | 'ovErrTeams'
  | 'ovErrSame'
  | 'ovErrReason'
  | 'ovErrNotTied'
  | 'ovErrUnknownTeam'
  | null {
  if (!draft.winnerTeamId || !draft.loserTeamId) return 'ovErrTeams';
  if (draft.winnerTeamId === draft.loserTeamId) return 'ovErrSame';
  if (!draft.reason.trim()) return 'ovErrReason';
  const w = standings.find((s) => s.teamId === draft.winnerTeamId);
  const l = standings.find((s) => s.teamId === draft.loserTeamId);
  if (!w || !l) return 'ovErrUnknownTeam';
  if (w.score !== l.score) return 'ovErrNotTied';
  return null;
}

async function errorOf(res: Response, fallback: string) {
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return json.error || fallback;
}

export function useTiebreakerOverrides(
  stageId: string,
  {
    enabled,
    onChanged,
    t,
  }: { enabled: boolean; onChanged: () => void | Promise<void>; t: Dict }
) {
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { mutate: setMutate } = useIdempotentMutation();
  const { mutate: removeMutate } = useIdempotentMutation();
  const [saving, setSaving] = useState(false);

  const query = useStageRead<{ overrides?: TiebreakerOverride[] }>(
    stageId,
    'tiebreaker-overrides',
    stageUrls.tiebreakerOverride,
    { enabled }
  );
  const { refetch } = query;

  /** `true` si la dérogation est enregistrée (le formulaire peut se vider). */
  const addOverride = useCallback(
    async (draft: OverrideDraft): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await setMutate(stageUrls.tiebreakerOverride(stageId), {
          method: 'POST',
          body: JSON.stringify({
            winnerTeamId: draft.winnerTeamId,
            loserTeamId: draft.loserTeamId,
            reason: draft.reason.trim(),
          }),
        });
        if (!res.ok) throw new Error(await errorOf(res, t.ovErrSave));
        addToast(t.ovSaved, 'success');
        await Promise.all([refetch(), onChanged()]);
        return true;
      } catch (err) {
        addToast((err as Error)?.message || t.ovErrSave, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setMutate, stageId, addToast, t, refetch, onChanged]
  );

  const removeOverride = useCallback(
    async (ov: TiebreakerOverride) => {
      const ok = await confirm({
        title: t.ovRemoveTitle,
        subtitle: format(t.ovRemoveSubtitle, {
          winner: ov.winner?.name ?? ov.winner_team_id.slice(0, 8),
          loser: ov.loser?.name ?? ov.loser_team_id.slice(0, 8),
        }),
        variant: 'danger',
        confirmLabel: t.ovRemove,
      });
      if (!ok) return;
      setSaving(true);
      try {
        const res = await removeMutate(stageUrls.tiebreakerOverride(stageId), {
          method: 'DELETE',
          body: JSON.stringify({ id: ov.id }),
        });
        if (!res.ok) throw new Error(await errorOf(res, t.ovErrRemove));
        addToast(t.ovRemoved, 'success');
        await Promise.all([refetch(), onChanged()]);
      } catch (err) {
        addToast((err as Error)?.message || t.ovErrRemove, 'error');
      } finally {
        setSaving(false);
      }
    },
    [confirm, removeMutate, stageId, addToast, t, refetch, onChanged]
  );

  return {
    overrides: query.data?.overrides ?? [],
    loading: query.isPending && enabled,
    saving,
    addOverride,
    removeOverride,
    dialog,
  };
}
