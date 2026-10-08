// features/admin/twitch/hooks/useTwitchRewards.ts — données et actions du
// panneau « Récompenses » (Diffusion › Overlays) : connexion de la chaîne,
// liste des récompenses, file des échanges en attente.
//
// SORTI DE components/admin/broadcast/TwitchRewardsPanel.tsx à l'identique
// (mêmes appels, mêmes toasts, même ordre), pour ramener l'écran sous le
// plafond des composants admin. Le composant ne garde que l'affichage et ses
// deux états de saisie (brouillon de création, ligne en cours de
// modification).
//
// Erreurs : NOT_CONNECTED (409) → panneau masqué, MISSING_SCOPE (403) → toast.
// Rappel Helix : seules les récompenses CRÉÉES par cette app sont gérables.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTwitchCommands from '@/lib/i18n/locales/admin-fr/adminTwitchCommands';
import {
  adminErrorCode,
  useBusySet,
} from '@/components/admin/broadcast/twitchPanelUtils';
import { twitchPaths } from '../client';
import {
  rewardCreateBody,
  rewardEditPatch,
  type RewardDraft,
  type RewardDraftError,
  type RewardEdit,
} from '../rewardDraft';

type TwitchConnection = { connected: boolean; broadcaster_login?: string };

export type Reward = {
  id: string;
  title: string;
  cost?: number;
  is_enabled?: boolean;
  is_paused?: boolean;
  prompt?: string;
  background_color?: string;
  /**
   * Calculé ici : la récompense a-t-elle été créée par NOTRE application ?
   * Helix ne permet de modifier / supprimer / traiter les échanges QUE de
   * celles-là ; les autres (créées dans le tableau de bord Twitch) se lisent.
   */
  manageable: boolean;
};
export type Redemption = { id: string; user_name: string; user_input?: string };

export function useTwitchRewards() {
  const t = useAdminT(nsAdminTwitchCommands);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const [connected, setConnected] = useState<boolean | undefined>(undefined);
  const [login, setLogin] = useState<string | null>(null);
  const { isBusy, withBusy } = useBusySet();

  const draftErrorToast = (error: RewardDraftError) =>
    addToast(
      error === 'titleRequired' ? t.rewardTitleRequired : t.rewardCostInvalid,
      'error'
    );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<TwitchConnection>(
          twitchPaths.connection
        );
        if (!cancelled) {
          setConnected(json.connected === true);
          setLogin(json.broadcaster_login ?? null);
        }
      } catch {
        // On dégrade en « non connecté » : le panneau Predictions gère l'invite
        // à (re)connecter, inutile d'afficher une seconde erreur ici.
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  // 409 NOT_CONNECTED renvoyé par une action → la chaîne s'est déconnectée, on
  // masque le panneau (l'invite à reconnecter est au-dessus).
  const handleNotConnected = useCallback(() => {
    setConnected(false);
    addToast(t.errorNotConnected, 'error');
  }, [addToast, t.errorNotConnected]);

  // Traduit une erreur d'action en toast + effet de bord (409/403).
  const reportError = useCallback(
    (err: unknown) => {
      const code = adminErrorCode(err);
      if (code === 'NOT_CONNECTED') {
        handleNotConnected();
        return;
      }
      if (code === 'MISSING_SCOPE') {
        addToast(t.errorMissingScope, 'error');
        return;
      }
      const msg = err instanceof AdminFetchError ? err.message : null;
      addToast(msg || t.errorGeneric, 'error');
    },
    [addToast, handleNotConnected, t.errorMissingScope, t.errorGeneric]
  );

  const [rewards, setRewards] = useState<Reward[] | undefined>(undefined);
  const [selectedReward, setSelectedReward] = useState<string>('');
  const [redemptions, setRedemptions] = useState<Redemption[] | undefined>(
    undefined
  );

  // TOUTES les récompenses de la chaîne (`?all=1`), croisées avec celles que
  // l'application peut gérer : la liste montre tout, et dit pour chacune ce
  // qu'on peut en faire d'ici. Si la liste complète échoue, on retombe sur
  // les seules gérables plutôt que de ne rien montrer.
  const loadRewards = useCallback(async () => {
    try {
      const [mine, all] = await Promise.all([
        adminFetchJson<{ rewards: Omit<Reward, 'manageable'>[] }>(
          twitchPaths.rewards
        ),
        adminFetchJson<{ rewards: Omit<Reward, 'manageable'>[] }>(
          twitchPaths.allRewards
        ).catch(() => null),
      ]);
      const mineIds = new Set((mine.rewards ?? []).map((r) => r.id));
      const list = (all?.rewards ?? mine.rewards ?? []).map((r) => ({
        ...r,
        manageable: mineIds.has(r.id),
      }));
      // Les gérables d'abord : ce sont celles sur lesquelles on agit.
      list.sort((a, b) => Number(b.manageable) - Number(a.manageable));
      setRewards(list);
    } catch (err) {
      if (adminErrorCode(err) === 'NOT_CONNECTED') {
        handleNotConnected();
        return;
      }
      setRewards([]);
    }
  }, [adminFetchJson, handleNotConnected]);

  // Charge la liste des rewards une fois la connexion confirmée.
  useEffect(() => {
    if (connected) loadRewards();
  }, [connected, loadRewards]);

  const loadRedemptions = useCallback(
    async (rewardId: string) => {
      setRedemptions(undefined);
      try {
        const json = await adminFetchJson<{ redemptions: Redemption[] }>(
          twitchPaths.pendingRedemptions(rewardId)
        );
        setRedemptions(json.redemptions ?? []);
      } catch (err) {
        if (adminErrorCode(err) === 'NOT_CONNECTED') {
          handleNotConnected();
          return;
        }
        setRedemptions([]);
        reportError(err);
      }
    },
    [adminFetchJson, handleNotConnected, reportError]
  );

  function selectReward(rewardId: string) {
    setSelectedReward(rewardId);
    if (rewardId) loadRedemptions(rewardId);
    else setRedemptions(undefined);
  }

  async function resolveRedemption(
    redemption: Redemption,
    status: 'FULFILLED' | 'CANCELED'
  ) {
    if (!selectedReward) return;
    if (status === 'CANCELED') {
      const ok = await confirm({
        title: t.redemptionRejectConfirmTitle,
        subtitle: t.redemptionRejectConfirmSubtitle,
        variant: 'danger',
        confirmLabel: t.redemptionRejectConfirmLabel,
      });
      if (!ok) return;
    }
    const busyId = `redeem:${redemption.id}:${status}`;
    await withBusy(busyId, async () => {
      try {
        await mutateJson(twitchPaths.redemptions, {
          method: 'PATCH',
          body: JSON.stringify({
            reward_id: selectedReward,
            redemption_ids: [redemption.id],
            status,
          }),
        });
        // Retire la demande traitée de la liste (elle n'est plus UNFULFILLED).
        setRedemptions((prev) =>
          prev ? prev.filter((r) => r.id !== redemption.id) : prev
        );
        addToast(
          status === 'FULFILLED'
            ? t.redemptionApproveSuccess
            : t.redemptionRejectSuccess,
          'success'
        );
      } catch (err) {
        reportError(err);
      }
    });
  }

  /** `onCreated` vide le formulaire, AVANT le rechargement de la liste. */
  async function createReward(draft: RewardDraft, onCreated: () => void) {
    const checked = rewardCreateBody(draft);
    if (!checked.ok) {
      draftErrorToast(checked.error);
      return;
    }
    await withBusy('reward-create', async () => {
      try {
        await mutateJson(twitchPaths.rewards, {
          method: 'POST',
          body: JSON.stringify(checked.value),
        });
        addToast(t.rewardCreateSuccess, 'success');
        onCreated();
        await loadRewards();
      } catch (err) {
        reportError(err);
      }
    });
  }

  /** PATCH d'une récompense de l'app, puis rechargement de la liste. */
  async function patchReward(
    busyId: string,
    rewardId: string,
    patch: Record<string, unknown>,
    successMessage: string,
    onDone?: () => void
  ) {
    await withBusy(busyId, async () => {
      try {
        await mutateJson(twitchPaths.reward(rewardId), {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        addToast(successMessage, 'success');
        onDone?.();
        await loadRewards();
      } catch (err) {
        reportError(err);
      }
    });
  }

  async function toggleReward(reward: Reward) {
    const next = !(reward.is_enabled ?? false);
    await patchReward(
      `reward-toggle:${reward.id}`,
      reward.id,
      { is_enabled: next },
      next ? t.rewardEnabledSuccess : t.rewardDisabledSuccess
    );
  }

  async function togglePause(reward: Reward) {
    const next = !(reward.is_paused ?? false);
    await patchReward(
      `reward-pause:${reward.id}`,
      reward.id,
      { is_paused: next },
      next ? t.rewardPausedSuccess : t.rewardResumedSuccess
    );
  }

  /** `onSaved` ferme l'édition, AVANT le rechargement de la liste. */
  async function saveEdit(edit: RewardEdit, onSaved: () => void) {
    const checked = rewardEditPatch(edit);
    if (!checked.ok) {
      draftErrorToast(checked.error);
      return;
    }
    await patchReward(
      `reward-edit:${edit.id}`,
      edit.id,
      checked.value,
      t.rewardEditSuccess,
      onSaved
    );
  }

  async function deleteReward(reward: Reward) {
    const ok = await confirm({
      title: format(t.rewardDeleteConfirmTitle, { title: reward.title }),
      subtitle: t.rewardDeleteConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.rewardDeleteConfirmLabel,
    });
    if (!ok) return;
    await withBusy(`reward-delete:${reward.id}`, async () => {
      try {
        await mutateJson(twitchPaths.reward(reward.id), { method: 'DELETE' });
        addToast(t.rewardDeleteSuccess, 'success');
        // Si le reward supprimé était sélectionné pour les demandes, on nettoie.
        if (selectedReward === reward.id) {
          setSelectedReward('');
          setRedemptions(undefined);
        }
        await loadRewards();
      } catch (err) {
        reportError(err);
      }
    });
  }

  return {
    connected,
    login,
    rewards,
    selectedReward,
    redemptions,
    isBusy,
    dialog,
    selectReward,
    resolveRedemption,
    createReward,
    toggleReward,
    togglePause,
    saveEdit,
    deleteReward,
  };
}
