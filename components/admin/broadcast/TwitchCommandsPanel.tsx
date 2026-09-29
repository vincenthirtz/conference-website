// components/admin/broadcast/TwitchCommandsPanel.tsx
// Panneau régie « commandes Twitch » monté dans la console broadcast live
// (pages/admin/broadcast/live), SOUS le TwitchPredictionsPanel. Il complète les
// predictions par les actions live du régisseur : Clip, message chat,
// modération (vider le chat / ban / modes de chat) et points de chaîne.
//
// Le panneau n'a de sens que si la chaîne est connectée : il réutilise
// GET /api/admin/twitch/connection (déjà consommé par TwitchPredictionsPanel)
// et ne rend RIEN tant que la chaîne n'est pas connectée — l'invite à connecter
// est déjà gérée par le panneau Predictions au-dessus.
//
// Contrat backend FIGÉ (implémenté par un autre agent ; on code STRICTEMENT
// contre ces formes, sans présumer d'autres champs) :
//  - GET   /api/admin/twitch/connection → { connected, broadcaster_login?, ... }
//  - POST  /api/admin/twitch/clip → { id, edit_url }
//  - POST  /api/admin/twitch/chat  body { message }
//  - POST  /api/admin/twitch/moderation/ban  body { login, duration?, reason? }
//  - POST  /api/admin/twitch/moderation/clear
//  - PATCH /api/admin/twitch/moderation/chat-settings body { emote_mode?, subscriber_mode?, follower_mode?, follower_mode_duration?, slow_mode?, slow_mode_wait_time? }
//  - GET    /api/admin/twitch/channel-points/rewards → { rewards: [{ id, title, cost?, is_enabled?, ... }] }  ⚠ PAS { data } : Helix répond { data }, nos routes renomment ; lire json.data rend une liste vide, sans erreur.
//  - POST   /api/admin/twitch/channel-points/rewards body { title, cost, prompt?, is_enabled?, is_user_input_required?, background_color?, should_redemptions_skip_request_queue? } → { reward }
//  - PATCH  /api/admin/twitch/channel-points/rewards/{id} body { is_enabled?, is_paused?, title?, cost?, prompt? } → { reward }
//  - DELETE /api/admin/twitch/channel-points/rewards/{id} → 200
//  - GET    /api/admin/twitch/channel-points/redemptions?reward_id=&status=UNFULFILLED → { redemptions: [{ id, user_name, user_input, ... }] }  ⚠ idem : PAS { data }.
//  - PATCH  /api/admin/twitch/channel-points/redemptions body { reward_id, redemption_ids, status }
//  - POST   /api/admin/twitch/marker body { description? } → { marker } (409 NOT_LIVE si la chaîne n'est pas en live)
//
// Toutes ces routes : withStaffRoute('manager'), erreurs { error, code? } avec
// code NOT_CONNECTED (409) → on masque le panneau (la chaîne s'est déconnectée
// entre deux actions), MISSING_SCOPE (403) → toast « reconnecte la chaîne »,
// NOT_LIVE (409, marker uniquement) → toast « la chaîne doit être en live ».
// Rappel Helix : seuls les rewards CRÉÉS par cette app sont éditables/supprimables ;
// une action sur un reward externe renvoie une erreur Helix → toast clair.
// Busy CIBLÉ par action, confirmations sur actions destructrices (vider le chat,
// ban permanent, refuser une demande, supprimer un reward), toasts succès/erreur, aria.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

// --- Formes du contrat (figées) ---------------------------------------------

type TwitchConnection = {
  connected: boolean;
  broadcaster_login?: string;
};

type ClipResponse = { id: string; edit_url: string };

type Reward = {
  id: string;
  title: string;
  cost?: number;
  is_enabled?: boolean;
  is_paused?: boolean;
  prompt?: string;
};
type Redemption = { id: string; user_name: string; user_input?: string };

type ChatSettings = {
  emote_mode: boolean;
  subscriber_mode: boolean;
  follower_mode: boolean;
  follower_mode_duration: number; // minutes
  slow_mode: boolean;
  slow_mode_wait_time: number; // secondes
};

const DEFAULT_SETTINGS: ChatSettings = {
  emote_mode: false,
  subscriber_mode: false,
  follower_mode: false,
  follower_mode_duration: 0,
  slow_mode: false,
  slow_mode_wait_time: 30,
};

const MAX_CHAT = 500;
// Limites Twitch : titre de reward ≤ 45, prompt ≤ 200 ; description de marker ≤ 140.
const MAX_REWARD_TITLE = 45;
const MAX_REWARD_PROMPT = 200;
const MAX_MARKER_DESC = 140;
// Durées de ban proposées ('' = ban permanent, sinon durée en secondes).
const BAN_DURATIONS = ['', '60', '300', '600', '1800', '3600'] as const;

export default function TwitchCommandsPanel() {
  const t = useAdminT(nsAdminTwitchCommands);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  // connected === undefined : chargement initial. false : non connecté (rien à
  // afficher). true : on rend les commandes.
  const [connected, setConnected] = useState<boolean | undefined>(undefined);

  // Busy CIBLÉ par action pour ne pas geler tout le panneau pendant un appel.
  const { isBusy, withBusy } = useBusySet();

  // --- Connexion ------------------------------------------------------------

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

  // --- 1. Clip --------------------------------------------------------------

  // Dernier clip créé : le toast n'accepte qu'une string, on rend donc le lien
  // cliquable vers l'éditeur de manière persistante sous le bouton.
  const [lastClip, setLastClip] = useState<ClipResponse | null>(null);

  async function handleClip() {
    await withBusy('clip', async () => {
      try {
        const json = await mutateJson<ClipResponse>('/api/admin/twitch/clip', {
          method: 'POST',
        });
        setLastClip(json);
        addToast(t.clipSuccess, 'success');
      } catch (err) {
        reportError(err);
      }
    });
  }

  // --- 2. Message chat ------------------------------------------------------

  const [chatMessage, setChatMessage] = useState('');

  async function handleSendChat() {
    const message = chatMessage.trim();
    if (!message) {
      addToast(t.chatEmpty, 'error');
      return;
    }
    await withBusy('chat', async () => {
      try {
        await mutateJson('/api/admin/twitch/chat', {
          method: 'POST',
          body: JSON.stringify({ message }),
        });
        setChatMessage('');
        addToast(t.chatSuccess, 'success');
      } catch (err) {
        reportError(err);
      }
    });
  }

  // --- 3. Modération --------------------------------------------------------

  async function handleClearChat() {
    const ok = await confirm({
      title: t.clearConfirmTitle,
      subtitle: t.clearConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.clearConfirmLabel,
    });
    if (!ok) return;
    await withBusy('clear', async () => {
      try {
        await mutateJson('/api/admin/twitch/moderation/clear', {
          method: 'POST',
        });
        addToast(t.clearSuccess, 'success');
      } catch (err) {
        reportError(err);
      }
    });
  }

  const [banLogin, setBanLogin] = useState('');
  const [banDuration, setBanDuration] = useState<string>(''); // '' = permanent
  const [banReason, setBanReason] = useState('');

  async function handleBan() {
    const login = banLogin.trim().replace(/^@/, '');
    if (!login) {
      addToast(t.banLoginRequired, 'error');
      return;
    }
    const permanent = banDuration === '';
    if (permanent) {
      const ok = await confirm({
        title: format(t.banConfirmTitle, { login }),
        subtitle: t.banConfirmSubtitle,
        variant: 'danger',
        confirmLabel: t.banConfirmLabel,
      });
      if (!ok) return;
    }
    const reason = banReason.trim();
    const body: { login: string; duration?: number; reason?: string } = {
      login,
    };
    if (!permanent) body.duration = Number(banDuration);
    if (reason) body.reason = reason;
    await withBusy('ban', async () => {
      try {
        await mutateJson('/api/admin/twitch/moderation/ban', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        addToast(format(t.banSuccess, { login }), 'success');
        setBanLogin('');
        setBanReason('');
        setBanDuration('');
      } catch (err) {
        reportError(err);
      }
    });
  }

  // Modes de chat : état éditable + baseline « dernier appliqué » pour n'envoyer
  // au PATCH que les champs réellement modifiés. Pas de GET dans le contrat →
  // on part des valeurs par défaut Twitch.
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const baselineRef = useRef<ChatSettings>(DEFAULT_SETTINGS);

  function setSetting<K extends keyof ChatSettings>(
    key: K,
    value: ChatSettings[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleApplySettings() {
    const base = baselineRef.current;
    const patch: Partial<ChatSettings> = {};
    if (settings.emote_mode !== base.emote_mode)
      patch.emote_mode = settings.emote_mode;
    if (settings.subscriber_mode !== base.subscriber_mode)
      patch.subscriber_mode = settings.subscriber_mode;
    if (settings.follower_mode !== base.follower_mode)
      patch.follower_mode = settings.follower_mode;
    if (settings.follower_mode_duration !== base.follower_mode_duration)
      patch.follower_mode_duration = settings.follower_mode_duration;
    if (settings.slow_mode !== base.slow_mode)
      patch.slow_mode = settings.slow_mode;
    if (settings.slow_mode_wait_time !== base.slow_mode_wait_time)
      patch.slow_mode_wait_time = settings.slow_mode_wait_time;

    if (Object.keys(patch).length === 0) {
      addToast(t.modesNoChange, 'info');
      return;
    }
    await withBusy('chat-settings', async () => {
      try {
        await mutateJson('/api/admin/twitch/moderation/chat-settings', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        baselineRef.current = settings;
        addToast(t.modesSuccess, 'success');
      } catch (err) {
        reportError(err);
      }
    });
  }

  // --- 4. Points de chaîne --------------------------------------------------

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

  // --- 5. Marker ------------------------------------------------------------

  const [markerDescription, setMarkerDescription] = useState('');

  async function handleMarker() {
    const description = markerDescription.trim();
    await withBusy('marker', async () => {
      try {
        await mutateJson('/api/admin/twitch/marker', {
          method: 'POST',
          body: JSON.stringify(description ? { description } : {}),
        });
        addToast(t.markerSuccess, 'success');
        setMarkerDescription('');
      } catch (err) {
        // 409 NOT_LIVE : la chaîne n'est pas en direct → message dédié.
        if (adminErrorCode(err) === 'NOT_LIVE') {
          addToast(t.markerNotLive, 'error');
          return;
        }
        reportError(err);
      }
    });
  }

  // --- Rendu ----------------------------------------------------------------

  // Tant que non connecté (ou en cours de vérification), on ne rend RIEN : le
  // panneau Predictions au-dessus gère déjà l'invite à connecter la chaîne.
  if (!connected) return null;

  return (
    <div className={`mb-6 px-5 py-4 ${R.rubanCard}`} aria-label={t.heading}>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-4 rounded-[3px] bg-[#9146FF]" aria-hidden />
        <div className={R.rubanEyebrow}>{t.heading}</div>
      </div>

      {/* 1. CLIP */}
      <Section title={t.clipHeading}>
        <AdminButton
          variant="secondary"
          size="md"
          onClick={handleClip}
          disabled={isBusy('clip')}
        >
          {isBusy('clip') && <Spinner />}
          {isBusy('clip') ? t.clipCreating : t.clipButton}
        </AdminButton>
        <p className="mt-2 text-xs text-neutral-500">{t.clipHint}</p>
        {lastClip && (
          <a
            href={lastClip.edit_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-[var(--or-200,#eec4ff)] underline hover:text-[var(--or-100,#f6e1ff)]"
          >
            {t.clipOpen}
          </a>
        )}
      </Section>

      {/* 2. MESSAGE CHAT */}
      <Section title={t.chatHeading}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendChat();
          }}
          className="flex flex-wrap items-start gap-2"
        >
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="twc-chat">
              {t.chatHeading}
            </label>
            <input
              id="twc-chat"
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              maxLength={MAX_CHAT}
              placeholder={t.chatPlaceholder}
              className={R.rubanInput}
            />
            <div className="mt-1 text-right text-[11px] text-neutral-500">
              {format(t.chatCounter, { count: chatMessage.length })}
            </div>
          </div>
          <AdminButton
            variant="secondary"
            type="submit"
            disabled={isBusy('chat')}
          >
            {isBusy('chat') && <Spinner />}
            {isBusy('chat') ? t.chatSending : t.chatSend}
          </AdminButton>
        </form>
      </Section>

      {/* 3. MODÉRATION */}
      <Section title={t.modHeading}>
        {/* Vider le chat */}
        <AdminButton
          variant="danger"
          size="sm"
          onClick={handleClearChat}
          disabled={isBusy('clear')}
        >
          {isBusy('clear') ? t.clearing : t.clearButton}
        </AdminButton>

        {/* Ban */}
        <div className={`mt-4 p-3 ${R.rubanInset}`}>
          <div className={`mb-2 ${R.rubanEyebrow}`}>{t.banHeading}</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label className={R.rubanLabel} htmlFor="twc-ban-login">
                {t.banLoginLabel}
              </label>
              <input
                id="twc-ban-login"
                type="text"
                value={banLogin}
                onChange={(e) => setBanLogin(e.target.value)}
                placeholder={t.banLoginPlaceholder}
                className={R.rubanInput}
              />
            </div>
            <div>
              <label className={R.rubanLabel} htmlFor="twc-ban-duration">
                {t.banDurationLabel}
              </label>
              <select
                id="twc-ban-duration"
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value)}
                className={`w-auto ${R.rubanInput}`}
              >
                {BAN_DURATIONS.map((d) => (
                  <option key={d || 'perm'} value={d}>
                    {banDurationLabel(d, t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2">
            <label className={R.rubanLabel} htmlFor="twc-ban-reason">
              {t.banReasonLabel}
            </label>
            <input
              id="twc-ban-reason"
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t.banReasonPlaceholder}
              className={R.rubanInput}
            />
          </div>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={handleBan}
            disabled={isBusy('ban')}
            className="mt-3"
          >
            {isBusy('ban') && <Spinner />}
            {isBusy('ban') ? t.banning : t.banButton}
          </AdminButton>
        </div>

        {/* Modes de chat */}
        <div className={`mt-4 p-3 ${R.rubanInset}`}>
          <div className={`mb-2 ${R.rubanEyebrow}`}>{t.modesHeading}</div>
          <div className="space-y-2">
            <Toggle
              label={t.modeEmote}
              checked={settings.emote_mode}
              onChange={(v) => setSetting('emote_mode', v)}
            />
            <Toggle
              label={t.modeSub}
              checked={settings.subscriber_mode}
              onChange={(v) => setSetting('subscriber_mode', v)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Toggle
                label={t.modeFollower}
                checked={settings.follower_mode}
                onChange={(v) => setSetting('follower_mode', v)}
              />
              {settings.follower_mode && (
                <label className="flex items-center gap-1 text-xs text-neutral-400">
                  {t.modeFollowerDuration}
                  <input
                    type="number"
                    min={0}
                    value={settings.follower_mode_duration}
                    onChange={(e) =>
                      setSetting(
                        'follower_mode_duration',
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    aria-label={t.modeFollowerDuration}
                    className={`w-20! py-1! ${R.rubanInput}`}
                  />
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Toggle
                label={t.modeSlow}
                checked={settings.slow_mode}
                onChange={(v) => setSetting('slow_mode', v)}
              />
              {settings.slow_mode && (
                <label className="flex items-center gap-1 text-xs text-neutral-400">
                  {t.modeSlowWait}
                  <input
                    type="number"
                    min={0}
                    value={settings.slow_mode_wait_time}
                    onChange={(e) =>
                      setSetting(
                        'slow_mode_wait_time',
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    aria-label={t.modeSlowWait}
                    className={`w-20! py-1! ${R.rubanInput}`}
                  />
                </label>
              )}
            </div>
          </div>
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={handleApplySettings}
            disabled={isBusy('chat-settings')}
            className="mt-3"
          >
            {isBusy('chat-settings') && <Spinner />}
            {isBusy('chat-settings') ? t.modesApplying : t.modesApply}
          </AdminButton>
        </div>
      </Section>

      {/* 4. POINTS DE CHAÎNE */}
      <Section title={t.pointsHeading}>
        {/* 4a. Créer une récompense */}
        <div className={`p-3 ${R.rubanInset}`}>
          <div className={`mb-2 ${R.rubanEyebrow}`}>
            {t.rewardCreateHeading}
          </div>
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
              {isBusy('reward-create')
                ? t.rewardCreating
                : t.rewardCreateButton}
            </AdminButton>
          </form>
        </div>

        {/* 4b. Gérer les récompenses existantes */}
        <div className="mt-4">
          <div className={`mb-2 ${R.rubanEyebrow}`}>
            {t.rewardManageHeading}
          </div>
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
                          {rejecting
                            ? t.redemptionRejecting
                            : t.redemptionReject}
                        </AdminButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* 5. MARKER */}
      <Section title={t.markerHeading} last>
        <p className="mb-2 text-xs text-neutral-500">{t.markerHint}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleMarker();
          }}
          className="flex flex-wrap items-start gap-2"
        >
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="twc-marker">
              {t.markerDescriptionLabel}
            </label>
            <input
              id="twc-marker"
              type="text"
              value={markerDescription}
              onChange={(e) => setMarkerDescription(e.target.value)}
              maxLength={MAX_MARKER_DESC}
              placeholder={t.markerPlaceholder}
              className={R.rubanInput}
            />
            <div className="mt-1 text-right text-[11px] text-neutral-500">
              {format(t.markerCounter, { count: markerDescription.length })}
            </div>
          </div>
          <AdminButton
            variant="secondary"
            type="submit"
            disabled={isBusy('marker')}
          >
            {isBusy('marker') && <Spinner />}
            {isBusy('marker') ? t.markerCreating : t.markerButton}
          </AdminButton>
        </form>
      </Section>

      {dialog}
    </div>
  );
}

// --- Sous-composants présentation -------------------------------------------

type CommandsT = typeof nsAdminTwitchCommands.fr;

function banDurationLabel(d: (typeof BAN_DURATIONS)[number], t: CommandsT) {
  switch (d) {
    case '':
      return t.banDurationPermanent;
    case '60':
      return t.banDuration60;
    case '300':
      return t.banDuration300;
    case '600':
      return t.banDuration600;
    case '1800':
      return t.banDuration1800;
    case '3600':
      return t.banDuration3600;
    default:
      return d;
  }
}

function Section({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        last
          ? 'pt-4'
          : 'border-b border-[var(--line,rgba(194,196,201,.12))] pb-4 pt-4 first:pt-0'
      }
    >
      <div className={`mb-2 ${R.rubanEyebrow}`}>{title}</div>
      {children}
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
