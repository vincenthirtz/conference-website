// components/admin/broadcast/TwitchRewardsPanel.tsx
//
// Diffusion › Overlays › « Récompenses » : les POINTS DE CHAÎNE Twitch —
// créer une récompense, activer / désactiver / supprimer les existantes, et
// traiter la file des échanges en attente.
//
// EXTRAIT DE TwitchCommandsPanel (console « Twitch & interactions »,
// /admin/broadcast/live, appelée à disparaître) : la gestion des récompenses
// vit désormais avec les overlays, où se règle aussi le drop TCG — qui est
// lui-même une récompense de points de chaîne.
//
// Contrat (inchangé) :
//  - GET    /api/admin/twitch/channel-points/rewards → { rewards }  ⚠ PAS { data }
//  - POST   /api/admin/twitch/channel-points/rewards body { title, cost, prompt?, is_user_input_required?, background_color?, should_redemptions_skip_request_queue? }
//  - PATCH  /api/admin/twitch/channel-points/rewards/{id} body { is_enabled? }
//  - DELETE /api/admin/twitch/channel-points/rewards/{id}
//  - GET    /api/admin/twitch/channel-points/redemptions?reward_id=&status=UNFULFILLED → { redemptions }  ⚠ PAS { data }
//  - PATCH  /api/admin/twitch/channel-points/redemptions body { reward_id, redemption_ids, status }
// Erreurs : NOT_CONNECTED (409) → panneau masqué, MISSING_SCOPE (403) → toast.
// Rappel Helix : seules les récompenses CRÉÉES par cette app sont gérables.
//
// Se masque tant que la chaîne n'est pas connectée (la connexion se fait
// depuis le panneau des prédictions ou la carte du drop TCG).

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Switch from '@/components/ui/Switch';
import nsAdminTwitchCommands from '@/lib/i18n/locales/admin-fr/adminTwitchCommands';
import {
  Spinner,
  adminErrorCode,
  useBusySet,
} from '@/components/admin/broadcast/twitchPanelUtils';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import * as R from '@/features/admin/_shared/ui/ruban';

type TwitchConnection = { connected: boolean };

type Reward = {
  id: string;
  title: string;
  cost?: number;
  is_enabled?: boolean;
  is_paused?: boolean;
  prompt?: string;
};
type Redemption = { id: string; user_name: string; user_input?: string };

// Limites Twitch : titre de reward ≤ 45, prompt ≤ 200 ; description de marker ≤ 140.
const MAX_REWARD_TITLE = 45;
const MAX_REWARD_PROMPT = 200;

export default function TwitchRewardsPanel() {
  const t = useAdminT(nsAdminTwitchCommands);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const [connected, setConnected] = useState<boolean | undefined>(undefined);
  const { isBusy, withBusy } = useBusySet();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<TwitchConnection>(
          '/api/admin/twitch/connection'
        );
        if (!cancelled) setConnected(json.connected === true);
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

  const loadRewards = useCallback(async () => {
    try {
      const json = await adminFetchJson<{ rewards: Reward[] }>(
        '/api/admin/twitch/channel-points/rewards'
      );
      setRewards(json.rewards ?? []);
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
          `/api/admin/twitch/channel-points/redemptions?reward_id=${encodeURIComponent(
            rewardId
          )}&status=UNFULFILLED`
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

  function handleSelectReward(rewardId: string) {
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
        await mutateJson('/api/admin/twitch/channel-points/redemptions', {
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

  // --- 4b. Créer / gérer les rewards ---------------------------------------

  const [newTitle, setNewTitle] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newUserInput, setNewUserInput] = useState(false);
  const [newSkipQueue, setNewSkipQueue] = useState(false);
  const [newColor, setNewColor] = useState('');

  async function handleCreateReward() {
    const title = newTitle.trim();
    if (!title) {
      addToast(t.rewardTitleRequired, 'error');
      return;
    }
    const cost = Number(newCost);
    if (!Number.isInteger(cost) || cost < 1) {
      addToast(t.rewardCostInvalid, 'error');
      return;
    }
    const body: {
      title: string;
      cost: number;
      prompt?: string;
      is_user_input_required?: boolean;
      should_redemptions_skip_request_queue?: boolean;
      background_color?: string;
    } = { title, cost };
    const prompt = newPrompt.trim();
    if (prompt) body.prompt = prompt;
    if (newUserInput) body.is_user_input_required = true;
    if (newSkipQueue) body.should_redemptions_skip_request_queue = true;
    const color = newColor.trim();
    if (color) body.background_color = color;

    await withBusy('reward-create', async () => {
      try {
        await mutateJson('/api/admin/twitch/channel-points/rewards', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        addToast(t.rewardCreateSuccess, 'success');
        setNewTitle('');
        setNewCost('');
        setNewPrompt('');
        setNewUserInput(false);
        setNewSkipQueue(false);
        setNewColor('');
        await loadRewards();
      } catch (err) {
        reportError(err);
      }
    });
  }

  async function toggleReward(reward: Reward) {
    const next = !(reward.is_enabled ?? false);
    await withBusy(`reward-toggle:${reward.id}`, async () => {
      try {
        await mutateJson(
          `/api/admin/twitch/channel-points/rewards/${encodeURIComponent(
            reward.id
          )}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ is_enabled: next }),
          }
        );
        addToast(
          next ? t.rewardEnabledSuccess : t.rewardDisabledSuccess,
          'success'
        );
        await loadRewards();
      } catch (err) {
        reportError(err);
      }
    });
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
        await mutateJson(
          `/api/admin/twitch/channel-points/rewards/${encodeURIComponent(
            reward.id
          )}`,
          { method: 'DELETE' }
        );
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

  if (!connected) return null;

  return (
    <div className={`px-5 py-4 ${R.rubanCard}`} aria-label={t.pointsHeading}>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-4 rounded-[3px] bg-[#9146FF]" aria-hidden />
        <div className={R.rubanEyebrow}>{t.pointsHeading}</div>
      </div>
      {/* 4a. Créer une récompense */}
      <div className={`p-3 ${R.rubanInset}`}>
        <div className={`mb-2 ${R.rubanEyebrow}`}>{t.rewardCreateHeading}</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateReward();
          }}
          className="space-y-2"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label className={R.rubanLabel} htmlFor="twc-reward-title">
                {t.rewardTitleLabel}
              </label>
              <input
                id="twc-reward-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={MAX_REWARD_TITLE}
                placeholder={t.rewardTitlePlaceholder}
                className={R.rubanInput}
              />
              <div className="mt-1 text-right text-[11px] text-neutral-500">
                {format(t.rewardTitleCounter, { count: newTitle.length })}
              </div>
            </div>
            <div className="w-28">
              <label className={R.rubanLabel} htmlFor="twc-reward-cost">
                {t.rewardCostLabel}
              </label>
              <input
                id="twc-reward-cost"
                type="number"
                min={1}
                step={1}
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
                placeholder={t.rewardCostPlaceholder}
                className={R.rubanInput}
              />
            </div>
            <div>
              <label className={R.rubanLabel} htmlFor="twc-reward-color">
                {t.rewardColorLabel}
              </label>
              <input
                id="twc-reward-color"
                type="color"
                value={newColor || '#9146ff'}
                onChange={(e) => setNewColor(e.target.value)}
                aria-label={t.rewardColorLabel}
                className="h-10 w-14 cursor-pointer rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-1"
              />
            </div>
          </div>
          <div>
            <label className={R.rubanLabel} htmlFor="twc-reward-prompt">
              {t.rewardPromptLabel}
            </label>
            <input
              id="twc-reward-prompt"
              type="text"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              maxLength={MAX_REWARD_PROMPT}
              placeholder={t.rewardPromptPlaceholder}
              className={R.rubanInput}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <Toggle
              label={t.rewardUserInput}
              checked={newUserInput}
              onChange={setNewUserInput}
            />
            <Toggle
              label={t.rewardSkipQueue}
              checked={newSkipQueue}
              onChange={setNewSkipQueue}
            />
          </div>
          <AdminButton
            variant="secondary"
            type="submit"
            disabled={isBusy('reward-create')}
          >
            {isBusy('reward-create') && <Spinner />}
            {isBusy('reward-create') ? t.rewardCreating : t.rewardCreateButton}
          </AdminButton>
        </form>
      </div>

      {/* 4b. Gérer les récompenses existantes */}
      <div className="mt-4">
        <div className={`mb-2 ${R.rubanEyebrow}`}>{t.rewardManageHeading}</div>
        {rewards === undefined ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner />
            {t.rewardsLoading}
          </div>
        ) : rewards.length === 0 ? (
          <div
            className={`px-3 py-4 text-center text-sm text-[var(--t4,#807984)] ${R.rubanInset}`}
          >
            {t.rewardsEmpty}
          </div>
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => {
              const enabled = r.is_enabled ?? false;
              const toggling = isBusy(`reward-toggle:${r.id}`);
              const deleting = isBusy(`reward-delete:${r.id}`);
              return (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center gap-3 px-3 py-2 ${R.rubanInset}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                      {r.title}
                    </div>
                    {typeof r.cost === 'number' && (
                      <div className="text-xs text-neutral-400">
                        {format(t.rewardCostBadge, { cost: r.cost })}
                      </div>
                    )}
                  </div>
                  <Chip tone={enabled ? 'ok' : 'neutral'}>
                    {enabled ? t.rewardStateEnabled : t.rewardStateDisabled}
                  </Chip>
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    onClick={() => toggleReward(r)}
                    disabled={toggling || deleting}
                  >
                    {toggling
                      ? t.rewardToggling
                      : enabled
                        ? t.rewardDisable
                        : t.rewardEnable}
                  </AdminButton>
                  <AdminButton
                    variant="danger"
                    size="xs"
                    onClick={() => deleteReward(r)}
                    disabled={toggling || deleting}
                  >
                    {deleting ? t.rewardDeleting : t.rewardDelete}
                  </AdminButton>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">{t.rewardsCaveat}</p>
      </div>

      {/* 4c. Demandes en attente */}
      <div className="mt-4">
        <label className={R.rubanLabel} htmlFor="twc-reward">
          {t.rewardSelectLabel}
        </label>
        {rewards === undefined ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Spinner />
            {t.rewardsLoading}
          </div>
        ) : (
          <select
            id="twc-reward"
            value={selectedReward}
            onChange={(e) => handleSelectReward(e.target.value)}
            className={R.rubanInput}
          >
            <option value="">{t.rewardSelectPlaceholder}</option>
            {rewards.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        )}

        {selectedReward && (
          <div
            className="mt-3"
            aria-live="polite"
            aria-label={t.redemptionsAria}
          >
            {redemptions === undefined ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Spinner />
                {t.redemptionsLoading}
              </div>
            ) : redemptions.length === 0 ? (
              <div
                className={`px-3 py-4 text-center text-sm text-[var(--t4,#807984)] ${R.rubanInset}`}
              >
                {t.redemptionsEmpty}
              </div>
            ) : (
              <ul className="space-y-2">
                {redemptions.map((r) => {
                  const approving = isBusy(`redeem:${r.id}:FULFILLED`);
                  const rejecting = isBusy(`redeem:${r.id}:CANCELED`);
                  return (
                    <li
                      key={r.id}
                      className={`flex flex-wrap items-center gap-3 px-3 py-2 ${R.rubanInset}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                          {r.user_name}
                        </div>
                        <div className="truncate text-xs text-neutral-400">
                          {r.user_input?.trim()
                            ? r.user_input
                            : t.redemptionNoInput}
                        </div>
                      </div>
                      <AdminButton
                        variant="secondary"
                        size="xs"
                        onClick={() => resolveRedemption(r, 'FULFILLED')}
                        disabled={approving || rejecting}
                      >
                        {approving
                          ? t.redemptionApproving
                          : t.redemptionApprove}
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="xs"
                        onClick={() => resolveRedemption(r, 'CANCELED')}
                        disabled={approving || rejecting}
                      >
                        {rejecting ? t.redemptionRejecting : t.redemptionReject}
                      </AdminButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <Switch
        checked={checked}
        onChange={() => onChange(!checked)}
        label={label}
      />
      <span className="text-neutral-200">{label}</span>
    </label>
  );
}
