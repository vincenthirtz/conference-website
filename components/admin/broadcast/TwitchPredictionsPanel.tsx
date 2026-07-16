// components/admin/broadcast/TwitchPredictionsPanel.tsx
// Panneau régie pour piloter les Twitch Predictions + connecter la chaîne, monté
// dans la console broadcast live (pages/admin/broadcast/live) à côté du
// TwitchStatusPanel (lecture seule) qu'il complète — celui-ci écrit.
//
// Contrat backend figé (l'implémentation est faite par un autre agent ; ce
// composant code STRICTEMENT contre ces formes, sans présumer d'autres champs) :
//  - GET    /api/admin/twitch/connection  → { connected, broadcaster_login?, scope?, expires_at? }  (jamais de token)
//  - GET    /api/admin/twitch/connect     → { url }  (URL d'autorisation ; on redirige dessus)
//  - DELETE /api/admin/twitch/connection  → 200
//  - GET    /api/admin/twitch/predictions → { prediction: TwitchPrediction | null }
//  - POST   /api/admin/twitch/predictions body { title, outcomes[], prediction_window } → { prediction }
//         409 code NOT_CONNECTED · 403 code MISSING_SCOPE
//  - PATCH  /api/admin/twitch/predictions/{id} body { status, winning_outcome_id? } → { prediction }
//
// États UI gérés : chargement, non connecté (carte de connexion), connecté sans
// prediction (formulaire), ACTIVE (verrouiller/annuler), LOCKED (faire gagner /
// annuler), RESOLVED/CANCELED (état terminal + relancer). Erreurs 409/403
// dégradent l'UI (retour en « connecter » / message scope). Toasts succès/erreur,
// busy CIBLÉ par bouton, aria-live sur l'état de la prediction.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

// --- Formes du contrat (figées) ---------------------------------------------

type TwitchConnection = {
  connected: boolean;
  broadcaster_login?: string;
  scope?: string[];
  expires_at?: string;
};

type TwitchOutcome = {
  id: string;
  title: string;
  color?: string;
  users?: number;
  channel_points?: number;
};

type TwitchPredictionStatus = 'ACTIVE' | 'LOCKED' | 'RESOLVED' | 'CANCELED';

type TwitchPrediction = {
  id: string;
  title: string;
  status: TwitchPredictionStatus;
  outcomes: TwitchOutcome[];
  locked_at?: string;
  ended_at?: string;
};

const PREDICTION_POLL_MS = 10_000;
const MAX_TITLE = 45;
const MIN_OUTCOMES = 2;
const MAX_OUTCOMES = 10;
const WINDOWS = [30, 60, 90, 120, 300] as const;

// Extrait le `code` machine d'une AdminFetchError (payload.code), sinon null.
function errorCode(err: unknown): string | null {
  if (
    err instanceof AdminFetchError &&
    err.payload &&
    typeof err.payload === 'object'
  ) {
    const c = (err.payload as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

export default function TwitchPredictionsPanel() {
  const t = useAdminT('adminTwitchPredictions');
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  // connection === null : chargement initial de l'état de connexion.
  const [connection, setConnection] = useState<TwitchConnection | null>(null);
  const [connError, setConnError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // prediction === undefined : pas encore chargée. null : aucune en cours.
  const [prediction, setPrediction] = useState<
    TwitchPrediction | null | undefined
  >(undefined);
  // Busy CIBLÉ par action (create / lock / cancel / resolve:<outcomeId>) pour ne
  // pas geler tout le panneau pendant un appel réseau.
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const isBusy = useCallback((id: string) => busy.has(id), [busy]);
  const withBusy = useCallback(
    async <T,>(id: string, fn: () => Promise<T>): Promise<T | undefined> => {
      if (busy.has(id)) return undefined;
      setBusy((prev) => new Set(prev).add(id));
      try {
        return await fn();
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [busy]
  );

  const connected = connection?.connected === true;

  // --- Formulaire de création -----------------------------------------------
  const [title, setTitle] = useState('');
  const [outcomes, setOutcomes] = useState<string[]>(['', '']);
  const [windowSec, setWindowSec] = useState<number>(60);

  const resetForm = useCallback(() => {
    setTitle('');
    setOutcomes(['', '']);
    setWindowSec(60);
  }, []);

  // --- Connexion ------------------------------------------------------------

  const fetchConnection = useCallback(async () => {
    setConnError(null);
    try {
      const json = await adminFetchJson<TwitchConnection>(
        '/api/admin/twitch/connection'
      );
      setConnection(json);
      return json;
    } catch (err) {
      const e = err as AdminFetchError;
      setConnError(e.message || t.loadError);
      // On garde l'état précédent si on en avait un ; sinon on marque « chargé »
      // en non-connecté pour ne pas rester bloqué sur le spinner.
      setConnection((prev) => prev ?? { connected: false });
      return null;
    }
  }, [adminFetchJson, t.loadError]);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  async function handleConnect() {
    setConnecting(true);
    setConnError(null);
    try {
      const { url } = await adminFetchJson<{ url: string }>(
        '/api/admin/twitch/connect'
      );
      if (!url) throw new Error(t.connectError);
      // Redirection vers Twitch pour l'autorisation OAuth.
      window.location.href = url;
    } catch (err) {
      const e = err as AdminFetchError;
      setConnError(e.message || t.connectError);
      addToast(t.connectError, 'error');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: t.disconnectConfirmTitle,
      subtitle: t.disconnectConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.disconnectConfirmLabel,
    });
    if (!ok) return;
    setDisconnecting(true);
    try {
      const res = await adminFetch('/api/admin/twitch/connection', {
        method: 'DELETE',
      });
      if (!res.ok) throw new AdminFetchError(t.disconnectError, res.status);
      addToast(t.disconnectSuccess, 'success');
      setConnection({ connected: false });
      setPrediction(undefined);
      resetForm();
    } catch {
      addToast(t.disconnectError, 'error');
    } finally {
      setDisconnecting(false);
    }
  }

  // Bascule l'UI en « non connecté » suite à un 409 NOT_CONNECTED renvoyé par
  // une mutation prediction (le jeton a pu expirer entre deux actions).
  const handleNotConnected = useCallback(() => {
    setConnection({ connected: false });
    setPrediction(undefined);
    addToast(t.errorNotConnected, 'error');
  }, [addToast, t.errorNotConnected]);

  // --- Prediction courante ---------------------------------------------------

  const fetchPrediction = useCallback(async () => {
    try {
      const json = await adminFetchJson<{
        prediction: TwitchPrediction | null;
      }>('/api/admin/twitch/predictions');
      setPrediction(json.prediction ?? null);
    } catch (err) {
      if (errorCode(err) === 'NOT_CONNECTED') {
        handleNotConnected();
        return;
      }
      // Autre erreur : on ne bloque pas, on garde le dernier état connu (ou
      // « aucune » si premier chargement) et on laisse le poll retenter.
      setPrediction((prev) => (prev === undefined ? null : prev));
    }
  }, [adminFetchJson, handleNotConnected]);

  // Poll ~10s VISIBILITY-GATÉ tant que connecté (aligné sur le reste de la
  // console) + refetch au retour visible. Les mutations refetchent aussi.
  const fetchPredRef = useRef(fetchPrediction);
  fetchPredRef.current = fetchPrediction;
  useEffect(() => {
    if (!connected) return;
    fetchPredRef.current();
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchPredRef.current();
    }
    const handle = setInterval(tick, PREDICTION_POLL_MS);
    function onVisible() {
      if (document.visibilityState === 'visible') fetchPredRef.current();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [connected]);

  // Traduit une erreur de mutation prediction en toast + effet de bord (409/403).
  const reportMutationError = useCallback(
    (err: unknown) => {
      const code = errorCode(err);
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

  // --- Actions predictions ---------------------------------------------------

  async function handleCreate() {
    const cleanTitle = title.trim();
    const cleanOutcomes = outcomes.map((o) => o.trim()).filter(Boolean);
    if (!cleanTitle) {
      addToast(t.titleRequired, 'error');
      return;
    }
    if (cleanOutcomes.length < MIN_OUTCOMES) {
      addToast(t.outcomesRequired, 'error');
      return;
    }
    await withBusy('create', async () => {
      try {
        const json = await mutateJson<{ prediction: TwitchPrediction }>(
          '/api/admin/twitch/predictions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: cleanTitle,
              outcomes: cleanOutcomes,
              prediction_window: windowSec,
            }),
          }
        );
        setPrediction(json.prediction);
        resetForm();
        addToast(t.createSuccess, 'success');
      } catch (err) {
        reportMutationError(err);
      }
    });
  }

  async function patchPrediction(
    busyId: string,
    body: { status: TwitchPredictionStatus; winning_outcome_id?: string },
    successMsg: string
  ) {
    if (!prediction) return;
    await withBusy(busyId, async () => {
      try {
        const json = await mutateJson<{ prediction: TwitchPrediction }>(
          `/api/admin/twitch/predictions/${encodeURIComponent(prediction.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        setPrediction(json.prediction);
        addToast(successMsg, 'success');
      } catch (err) {
        reportMutationError(err);
      }
    });
  }

  async function handleLock() {
    await patchPrediction('lock', { status: 'LOCKED' }, t.lockSuccess);
  }

  async function handleCancel() {
    const ok = await confirm({
      title: t.cancelConfirmTitle,
      subtitle: t.cancelConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.cancelConfirmLabel,
    });
    if (!ok) return;
    await patchPrediction('cancel', { status: 'CANCELED' }, t.cancelSuccess);
  }

  async function handleResolve(outcome: TwitchOutcome) {
    const ok = await confirm({
      title: format(t.resolveConfirmTitle, { outcome: outcome.title }),
      subtitle: t.resolveConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.resolveConfirmLabel,
    });
    if (!ok) return;
    await patchPrediction(
      `resolve:${outcome.id}`,
      { status: 'RESOLVED', winning_outcome_id: outcome.id },
      t.resolveSuccess
    );
  }

  // --- Helpers formulaire issues ---------------------------------------------

  function updateOutcome(index: number, value: string) {
    setOutcomes((prev) => prev.map((o, i) => (i === index ? value : o)));
  }
  function addOutcomeField() {
    setOutcomes((prev) => (prev.length >= MAX_OUTCOMES ? prev : [...prev, '']));
  }
  function removeOutcomeField(index: number) {
    setOutcomes((prev) =>
      prev.length <= MIN_OUTCOMES ? prev : prev.filter((_, i) => i !== index)
    );
  }

  // --- Rendu -----------------------------------------------------------------

  const statusLabels: Record<TwitchPredictionStatus, string> = useMemo(
    () => ({
      ACTIVE: t.statusActive,
      LOCKED: t.statusLocked,
      RESOLVED: t.statusResolved,
      CANCELED: t.statusCanceled,
    }),
    [t]
  );

  return (
    <Shell heading={t.heading}>
      {connection === null ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Spinner />
          {t.loading}
        </div>
      ) : !connected ? (
        // === État non connecté : carte de connexion ===
        <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 px-4 py-4">
          <div className="text-base font-bold">{t.connectTitle}</div>
          <p className="mt-1 max-w-xl text-sm text-neutral-400">
            {t.connectDescription}
          </p>
          {connError && (
            <div className="mt-2 text-xs text-red-400">{connError}</div>
          )}
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {connecting && <Spinner />}
            {connecting ? t.connectLoading : t.connectButton}
          </button>
        </div>
      ) : (
        // === État connecté : bandeau chaîne + panneau predictions ===
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden
                />
                <span className="truncate font-semibold">
                  {format(t.connectedAs, {
                    login: connection?.broadcaster_login ?? '—',
                  })}
                </span>
              </div>
              {connection?.expires_at && (
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {format(t.expiresAt, {
                    date: new Date(connection.expires_at).toLocaleString(),
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
            >
              {disconnecting ? t.disconnecting : t.disconnect}
            </button>
          </div>

          {/* Région aria-live : annonce l'état courant de la prediction. */}
          <div
            aria-live="polite"
            aria-label={t.ariaStatus}
            className="mb-3 text-xs text-neutral-500"
          >
            {prediction
              ? `${t.statusLabel} · ${statusLabels[prediction.status]}`
              : ''}
          </div>

          {prediction === undefined ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Spinner />
              {t.loading}
            </div>
          ) : prediction === null ||
            prediction.status === 'RESOLVED' ||
            prediction.status === 'CANCELED' ? (
            <>
              {/* État terminal : rappel bref avant de pouvoir relancer. */}
              {prediction &&
                (prediction.status === 'RESOLVED' ||
                  prediction.status === 'CANCELED') && (
                  <div
                    className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                      prediction.status === 'RESOLVED'
                        ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                        : 'border-neutral-700 bg-neutral-900/60 text-neutral-400'
                    }`}
                  >
                    <div className="font-semibold">
                      {prediction.status === 'RESOLVED'
                        ? t.terminalResolved
                        : t.terminalCanceled}
                    </div>
                    <div className="mt-0.5 truncate text-xs opacity-80">
                      {prediction.title}
                    </div>
                  </div>
                )}
              <CreateForm
                t={t}
                title={title}
                setTitle={setTitle}
                outcomes={outcomes}
                updateOutcome={updateOutcome}
                addOutcomeField={addOutcomeField}
                removeOutcomeField={removeOutcomeField}
                windowSec={windowSec}
                setWindowSec={setWindowSec}
                onSubmit={handleCreate}
                submitting={isBusy('create')}
              />
            </>
          ) : (
            // === Prediction ACTIVE ou LOCKED ===
            <div>
              <div className="mb-3">
                <div className="text-base font-bold">{prediction.title}</div>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    prediction.status === 'ACTIVE'
                      ? 'bg-purple-900/50 text-purple-200'
                      : 'bg-amber-900/40 text-amber-200'
                  }`}
                >
                  {statusLabels[prediction.status]}
                </span>
              </div>

              <ul className="mb-4 space-y-2">
                {prediction.outcomes.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={o.color ? { backgroundColor: o.color } : undefined}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {o.title}
                    </span>
                    {typeof o.users === 'number' && (
                      <span className="shrink-0 text-xs text-neutral-500">
                        {format(t.outcomeUsers, {
                          count: o.users.toLocaleString(),
                        })}
                      </span>
                    )}
                    {typeof o.channel_points === 'number' && (
                      <span className="shrink-0 text-xs text-neutral-500">
                        {format(t.outcomeChannelPoints, {
                          points: o.channel_points.toLocaleString(),
                        })}
                      </span>
                    )}
                    {prediction.status === 'LOCKED' && (
                      <button
                        type="button"
                        onClick={() => handleResolve(o)}
                        disabled={isBusy(`resolve:${o.id}`)}
                        className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {isBusy(`resolve:${o.id}`) ? t.resolving : t.makeWinner}
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                {prediction.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={handleLock}
                    disabled={isBusy('lock')}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold hover:bg-amber-500 disabled:opacity-40"
                  >
                    {isBusy('lock') ? t.locking : t.lock}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isBusy('cancel')}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                >
                  {isBusy('cancel') ? t.canceling : t.cancel}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {dialog}
    </Shell>
  );
}

// --- Sous-composants présentation -------------------------------------------

function Shell({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-4 rounded bg-[#9146FF]" aria-hidden />
        <div className="text-xs uppercase tracking-widest text-neutral-400">
          {heading}
        </div>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}

type CreateFormT = ReturnType<typeof useAdminT<'adminTwitchPredictions'>>;

function CreateForm({
  t,
  title,
  setTitle,
  outcomes,
  updateOutcome,
  addOutcomeField,
  removeOutcomeField,
  windowSec,
  setWindowSec,
  onSubmit,
  submitting,
}: {
  t: CreateFormT;
  title: string;
  setTitle: (v: string) => void;
  outcomes: string[];
  updateOutcome: (i: number, v: string) => void;
  addOutcomeField: () => void;
  removeOutcomeField: (i: number) => void;
  windowSec: number;
  setWindowSec: (v: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const windowLabels: Record<number, string> = {
    30: t.window30,
    60: t.window60,
    90: t.window90,
    120: t.window120,
    300: t.window300,
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="mb-3 text-sm font-semibold text-neutral-200">
        {t.createHeading}
      </div>

      <label
        className="mb-1 block text-xs text-neutral-400"
        htmlFor="twp-title"
      >
        {t.titleLabel}
      </label>
      <input
        id="twp-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_TITLE}
        placeholder={t.titlePlaceholder}
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
      />
      <div className="mt-1 text-right text-[11px] text-neutral-500">
        {format(t.titleCounter, { count: title.length })}
      </div>

      <div className="mb-1 mt-3 text-xs text-neutral-400">
        {t.outcomesLabel}
      </div>
      <ul className="space-y-2">
        {outcomes.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={o}
              onChange={(e) => updateOutcome(i, e.target.value)}
              maxLength={25}
              aria-label={format(t.outcomeAriaLabel, { n: i + 1 })}
              placeholder={format(t.outcomePlaceholder, { n: i + 1 })}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeOutcomeField(i)}
              disabled={outcomes.length <= MIN_OUTCOMES}
              aria-label={format(t.removeOutcome, { n: i + 1 })}
              className="shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-700 disabled:opacity-30"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={addOutcomeField}
          disabled={outcomes.length >= MAX_OUTCOMES}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
        >
          + {t.addOutcome}
        </button>
        <span className="text-[11px] text-neutral-500">{t.outcomesHint}</span>
      </div>

      <label
        className="mb-1 mt-3 block text-xs text-neutral-400"
        htmlFor="twp-window"
      >
        {t.windowLabel}
      </label>
      <select
        id="twp-window"
        value={windowSec}
        onChange={(e) => setWindowSec(Number(e.target.value))}
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
      >
        {WINDOWS.map((w) => (
          <option key={w} value={w}>
            {windowLabels[w]}
          </option>
        ))}
      </select>
      <div className="mt-1 text-[11px] text-neutral-500">{t.windowHint}</div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting && <Spinner />}
        {submitting ? t.launching : t.launch}
      </button>
    </form>
  );
}
