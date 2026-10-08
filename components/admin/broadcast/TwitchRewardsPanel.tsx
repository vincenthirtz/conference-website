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
//
// Données et actions : features/admin/twitch/hooks/useTwitchRewards.ts ;
// URLs : features/admin/twitch/client.ts ; validation des saisies :
// features/admin/twitch/rewardDraft.ts. Ce fichier ne garde que l'affichage.

import { useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Switch from '@/components/ui/Switch';
import nsAdminTwitchCommands from '@/lib/i18n/locales/admin-fr/adminTwitchCommands';
import { Spinner } from '@/components/admin/broadcast/twitchPanelUtils';
import { useTwitchRewards } from '@/features/admin/twitch/hooks/useTwitchRewards';
import {
  EMPTY_REWARD_DRAFT,
  MAX_REWARD_PROMPT,
  MAX_REWARD_TITLE,
  type RewardDraft,
  type RewardEdit,
} from '@/features/admin/twitch/rewardDraft';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import * as R from '@/features/admin/_shared/ui/ruban';

export default function TwitchRewardsPanel() {
  const t = useAdminT(nsAdminTwitchCommands);
  const {
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
  } = useTwitchRewards();
  const [draft, setDraft] = useState<RewardDraft>(EMPTY_REWARD_DRAFT);
  const setField = <K extends keyof RewardDraft>(k: K, v: RewardDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  // Modification en ligne : titre, coût, message — ce que Helix accepte.
  const [editing, setEditing] = useState<RewardEdit | null>(null);

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
            void createReward(draft, () => setDraft(EMPTY_REWARD_DRAFT));
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
                value={draft.title}
                onChange={(e) => setField('title', e.target.value)}
                maxLength={MAX_REWARD_TITLE}
                placeholder={t.rewardTitlePlaceholder}
                className={R.rubanInput}
              />
              <div className="mt-1 text-right text-[11px] text-neutral-500">
                {format(t.rewardTitleCounter, { count: draft.title.length })}
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
                value={draft.cost}
                onChange={(e) => setField('cost', e.target.value)}
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
                value={draft.color || '#9146ff'}
                onChange={(e) => setField('color', e.target.value)}
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
              value={draft.prompt}
              onChange={(e) => setField('prompt', e.target.value)}
              maxLength={MAX_REWARD_PROMPT}
              placeholder={t.rewardPromptPlaceholder}
              className={R.rubanInput}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <Toggle
              label={t.rewardUserInput}
              checked={draft.userInput}
              onChange={(v) => setField('userInput', v)}
            />
            <Toggle
              label={t.rewardSkipQueue}
              checked={draft.skipQueue}
              onChange={(v) => setField('skipQueue', v)}
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
          <>
            <p className="mb-2 text-xs text-neutral-400">
              {format(t.rewardsSummary, {
                total: rewards.length,
                manageable: rewards.filter((r) => r.manageable).length,
              })}
            </p>
            <ul className="space-y-2">
              {rewards.map((r) => {
                const enabled = r.is_enabled ?? false;
                const paused = r.is_paused ?? false;
                const toggling = isBusy(`reward-toggle:${r.id}`);
                const deleting = isBusy(`reward-delete:${r.id}`);
                const pausing = isBusy(`reward-pause:${r.id}`);
                const busyRow = toggling || deleting || pausing;
                const isEditing = editing?.id === r.id;
                return (
                  <li key={r.id} className={`px-3 py-2 ${R.rubanInset}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Style inline assumé : la couleur vient de Twitch,
                          aucune classe ne peut la porter. Compensé au cliquet
                          par OverlayPreview (aspectRatio → aspect-video). */}
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: r.background_color || '#9146ff' }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                          {r.title}
                        </div>
                        <div className="truncate text-xs text-neutral-400">
                          {typeof r.cost === 'number' &&
                            format(t.rewardCostBadge, { cost: r.cost })}
                          {r.prompt ? ` · ${r.prompt}` : ''}
                        </div>
                      </div>
                      <Chip tone={enabled ? 'ok' : 'neutral'}>
                        {enabled ? t.rewardStateEnabled : t.rewardStateDisabled}
                      </Chip>
                      {paused && <Chip tone="warn">{t.rewardStatePaused}</Chip>}
                      {r.manageable ? (
                        <>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              setEditing(
                                isEditing
                                  ? null
                                  : {
                                      id: r.id,
                                      title: r.title,
                                      cost: String(r.cost ?? ''),
                                      prompt: r.prompt ?? '',
                                    }
                              )
                            }
                            disabled={busyRow}
                          >
                            {t.rewardEdit}
                          </AdminButton>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() => togglePause(r)}
                            disabled={busyRow}
                          >
                            {paused ? t.rewardResume : t.rewardPause}
                          </AdminButton>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() => toggleReward(r)}
                            disabled={busyRow}
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
                            disabled={busyRow}
                          >
                            {deleting ? t.rewardDeleting : t.rewardDelete}
                          </AdminButton>
                        </>
                      ) : (
                        <>
                          <Chip tone="neutral">{t.rewardOriginTwitch}</Chip>
                          {login && (
                            <a
                              href={`https://dashboard.twitch.tv/u/${encodeURIComponent(
                                login
                              )}/viewer-rewards/channel-points/rewards`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[var(--or-200,#eec4ff)] underline"
                            >
                              {t.rewardManageOnTwitch}
                            </a>
                          )}
                        </>
                      )}
                    </div>
                    {isEditing && editing && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveEdit(editing, () => setEditing(null));
                        }}
                        className="mt-2 flex flex-wrap items-end gap-2"
                      >
                        <label className="min-w-[10rem] flex-1">
                          <span className={R.rubanLabel}>
                            {t.rewardTitleLabel}
                          </span>
                          <input
                            type="text"
                            value={editing.title}
                            maxLength={MAX_REWARD_TITLE}
                            onChange={(e) =>
                              setEditing({ ...editing, title: e.target.value })
                            }
                            className={R.rubanInput}
                          />
                        </label>
                        <label className="w-28">
                          <span className={R.rubanLabel}>
                            {t.rewardCostLabel}
                          </span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={editing.cost}
                            onChange={(e) =>
                              setEditing({ ...editing, cost: e.target.value })
                            }
                            className={R.rubanInput}
                          />
                        </label>
                        <label className="min-w-[12rem] flex-[2]">
                          <span className={R.rubanLabel}>
                            {t.rewardPromptLabel}
                          </span>
                          <input
                            type="text"
                            value={editing.prompt}
                            maxLength={MAX_REWARD_PROMPT}
                            onChange={(e) =>
                              setEditing({ ...editing, prompt: e.target.value })
                            }
                            className={R.rubanInput}
                          />
                        </label>
                        <AdminButton
                          variant="secondary"
                          size="sm"
                          type="submit"
                          disabled={isBusy(`reward-edit:${r.id}`)}
                        >
                          {t.rewardEditSave}
                        </AdminButton>
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(null)}
                        >
                          {t.rewardEditCancel}
                        </AdminButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
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
            onChange={(e) => selectReward(e.target.value)}
            className={R.rubanInput}
          >
            <option value="">{t.rewardSelectPlaceholder}</option>
            {/* Helix ne livre les échanges QUE des récompenses de l'app. */}
            {rewards
              .filter((r) => r.manageable)
              .map((r) => (
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
