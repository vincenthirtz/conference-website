// components/admin/caster/ObsPanel.tsx
//
// Panneau de pilotage OBS sur /admin/caster (lot 3) — WebSocket DIRECT
// navigateur → OBS local (la CSP de /admin/caster autorise ws://localhost:4455,
// cf. proxy.ts lot 1). Toute la mécanique protocole/état vit dans
// utils/caster/obsClient + obsOps (purs) et le hook useObs ; ce composant ne
// fait que le rendu + les confirmations/toasts.
//
// ⚠️ Écart volontaire vs app desktop : pas de poussée de la clé de stream
// Twitch dans OBS (SetStreamServiceSettings) — la clé ne transite jamais par le
// web. Le bouton « Démarrer le stream » lance StartStream sur la config Flux
// déjà en place dans OBS (note obsStreamKeyNote affichée sous le bouton).
//
// Composant browser-only (WebSocket, localStorage) : importé en dynamic
// ssr:false depuis pages/admin/caster.tsx.

import { useEffect, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logCasterAction } from '@/utils/caster/auditClient';

import { inputClass, labelClass } from './fieldClasses';
import { useObs } from './useObs';

/** hh:mm:ss depuis un epoch de départ (durée stream/record). */
function formatElapsed(startedAt: number, now: number): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const sectionClass =
  'rounded-xl border border-neutral-800 bg-neutral-950/60 p-3';
const smallBtnClass =
  'px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50';

export default function ObsPanel() {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const {
    settings,
    setSettings,
    phase,
    connectError,
    reconnectFailedAttempts,
    scenes,
    currentScene,
    stream,
    record,
    audioInputs,
    connect,
    disconnect,
    switchScene,
    toggleStream,
    toggleRecord,
    changeVolume,
    changeMute,
    setupScenes,
  } = useObs();

  // Heuristique navigateur : hors Chromium, le ws:// vers localhost depuis une
  // page HTTPS peut être bloqué (mixed content Firefox). Simple avertissement.
  const [browserWarning, setBrowserWarning] = useState(false);
  useEffect(() => {
    setBrowserWarning(!/chrom(e|ium)/i.test(navigator.userAgent));
  }, []);

  // Horloge locale pour les durées stream/record (tick 1 s quand actif —
  // dérivé du startedAt, PAS un polling OBS).
  const [now, setNow] = useState(() => Date.now());
  const anyActive = stream.active || record.active;
  useEffect(() => {
    if (!anyActive) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyActive]);

  const [busy, setBusy] = useState<null | 'stream' | 'record' | 'setup'>(null);

  const connectErrorLabel =
    connectError === 'timeout'
      ? t.obsConnectErrorTimeout
      : connectError === 'socket'
        ? t.obsConnectErrorSocket
        : connectError
          ? format(t.obsConnectErrorGeneric, { message: connectError })
          : null;

  async function onConnectClick() {
    if (phase === 'connected' || phase === 'connecting') {
      disconnect();
      return;
    }
    await connect();
  }

  async function onToggleStream() {
    const starting = !stream.active;
    const ok = await confirm({
      title: starting
        ? t.obsStreamStartConfirmTitle
        : t.obsStreamStopConfirmTitle,
      subtitle: starting
        ? t.obsStreamStartConfirmBody
        : t.obsStreamStopConfirmBody,
      variant: starting ? 'info' : 'danger',
      confirmLabel: starting ? t.obsStreamStart : t.obsStreamStop,
    });
    if (!ok) return;
    setBusy('stream');
    try {
      const res = await toggleStream();
      if (res.streaming && !res.verified) {
        addToast(t.obsStreamStartUnverified, 'error');
      }
      // Journal (lot 5) : passer à l'antenne / en sortir est l'action la plus
      // notable du cockpit. `verified` dit si OBS a réellement démarré.
      logCasterAction({
        action: 'caster_stream_toggle',
        details: { streaming: res.streaming, verified: res.verified },
      });
    } catch (err) {
      addToast(
        format(t.obsActionError, { message: (err as Error)?.message || '' }),
        'error'
      );
    } finally {
      setBusy(null);
    }
  }

  async function onToggleRecord() {
    const starting = !record.active;
    const ok = await confirm({
      title: starting
        ? t.obsRecordStartConfirmTitle
        : t.obsRecordStopConfirmTitle,
      subtitle: starting
        ? t.obsRecordStartConfirmBody
        : t.obsRecordStopConfirmBody,
      variant: starting ? 'info' : 'warning',
      confirmLabel: starting ? t.obsRecordStart : t.obsRecordStop,
    });
    if (!ok) return;
    setBusy('record');
    try {
      await toggleRecord();
      logCasterAction({
        action: 'caster_record_toggle',
        details: { recording: starting },
      });
    } catch (err) {
      addToast(
        format(t.obsActionError, { message: (err as Error)?.message || '' }),
        'error'
      );
    } finally {
      setBusy(null);
    }
  }

  async function onSetupScenes() {
    setBusy('setup');
    try {
      const res = await setupScenes(window.location.origin);
      const n = res.created.length;
      addToast(
        n > 0
          ? format(t.obsSetupScenesDone, { count: n })
          : t.obsSetupScenesNothing,
        'success'
      );
      // Journalisé seulement quand quelque chose a été créé : l'action est
      // idempotente et souvent rejouée « pour vérifier ».
      if (n > 0) {
        logCasterAction({
          action: 'caster_obs_setup_scenes',
          details: { created: res.created },
        });
      }
    } catch (err) {
      addToast(
        format(t.obsActionError, { message: (err as Error)?.message || '' }),
        'error'
      );
    } finally {
      setBusy(null);
    }
  }

  const statusLabel =
    phase === 'connected'
      ? t.obsStatusConnected
      : phase === 'connecting'
        ? t.obsStatusConnecting
        : t.obsStatusDisconnected;
  const statusColor =
    phase === 'connected'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : phase === 'connecting'
        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
        : 'bg-neutral-800 border-neutral-700 text-neutral-400';

  return (
    <section
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
      data-testid="caster-obs-panel"
    >
      {dialog}

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className="text-lg font-bold">{t.obsTitle}</h2>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor}`}
          data-testid="caster-obs-status"
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-3">{t.obsIntro}</p>

      {browserWarning && (
        <div className="mb-3 rounded-xl bg-amber-900/30 border border-amber-500/40 px-3 py-2 text-xs text-amber-200">
          {t.obsBrowserWarning}
        </div>
      )}

      {reconnectFailedAttempts != null && (
        <div className="mb-3 rounded-xl bg-red-900/40 border border-red-500/50 px-3 py-2 text-xs">
          {format(t.obsReconnectFailed, { attempts: reconnectFailedAttempts })}
        </div>
      )}

      {/* Formulaire de connexion */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-40">
          <span className={labelClass}>{t.obsHostLabel}</span>
          <input
            type="text"
            value={settings.host}
            onChange={(e) =>
              setSettings((s) => ({ ...s, host: e.target.value }))
            }
            disabled={phase !== 'disconnected'}
            className={inputClass}
            data-testid="caster-obs-host"
          />
        </label>
        <label className="block w-24">
          <span className={labelClass}>{t.obsPortLabel}</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={settings.port}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                port: parseInt(e.target.value, 10) || 4455,
              }))
            }
            disabled={phase !== 'disconnected'}
            className={inputClass}
          />
        </label>
        <label className="block w-48">
          <span className={labelClass}>{t.obsPasswordLabel}</span>
          <input
            type="password"
            value={settings.password}
            onChange={(e) =>
              setSettings((s) => ({ ...s, password: e.target.value }))
            }
            disabled={phase !== 'disconnected'}
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={() => void onConnectClick()}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            phase === 'disconnected'
              ? 'bg-purple-600/20 border-purple-500/40 hover:bg-purple-600/30'
              : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
          }`}
          data-testid="caster-obs-connect"
        >
          {phase === 'disconnected' ? t.obsConnect : t.obsDisconnect}
        </button>
      </div>
      <p className="text-[11px] text-neutral-600 mt-1.5">{t.obsPasswordNote}</p>

      {connectErrorLabel && (
        <p className="mt-2 text-xs text-red-300" data-testid="caster-obs-error">
          {connectErrorLabel}
        </p>
      )}

      {phase === 'connected' && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Scènes */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold mb-1">{t.obsScenesTitle}</h3>
            <p className="text-[11px] text-neutral-500 mb-2">
              {format(t.obsCurrentScene, { scene: currentScene || '—' })}
            </p>
            {scenes.length === 0 ? (
              <p className="text-xs text-neutral-500">{t.obsNoScenes}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {scenes.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      void switchScene(name).catch((err) =>
                        addToast(
                          format(t.obsActionError, {
                            message: (err as Error)?.message || '',
                          }),
                          'error'
                        )
                      )
                    }
                    aria-pressed={name === currentScene}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
                      name === currentScene
                        ? 'bg-purple-600/25 border-purple-500/50 text-white'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => void onSetupScenes()}
                disabled={busy === 'setup'}
                className={smallBtnClass}
                data-testid="caster-obs-setup-scenes"
              >
                {busy === 'setup' ? t.obsSetupScenesRunning : t.obsSetupScenes}
              </button>
              <p className="text-[11px] text-neutral-600 mt-1.5">
                {t.obsSetupScenesHint}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Stream */}
            <div className={sectionClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{t.obsStreamTitle}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      stream.active
                        ? 'bg-red-500/20 border-red-500/50 text-red-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                    data-testid="caster-obs-stream-state"
                  >
                    {stream.active ? t.obsStreamLive : t.obsStreamOff}
                  </span>
                  {stream.active && stream.startedAt != null && (
                    <span className="text-xs tabular-nums text-neutral-300">
                      {formatElapsed(stream.startedAt, now)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onToggleStream()}
                  disabled={busy === 'stream'}
                  className={smallBtnClass}
                  data-testid="caster-obs-stream-toggle"
                >
                  {stream.active ? t.obsStreamStop : t.obsStreamStart}
                </button>
              </div>
              <p className="text-[11px] text-neutral-600 mt-1.5">
                {t.obsStreamKeyNote}
              </p>
            </div>

            {/* Record */}
            <div className={sectionClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{t.obsRecordTitle}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      record.active
                        ? 'bg-red-500/20 border-red-500/50 text-red-300'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {record.active ? t.obsRecordOn : t.obsRecordOff}
                  </span>
                  {record.active && record.startedAt != null && (
                    <span className="text-xs tabular-nums text-neutral-300">
                      {formatElapsed(record.startedAt, now)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onToggleRecord()}
                  disabled={busy === 'record'}
                  className={smallBtnClass}
                >
                  {record.active ? t.obsRecordStop : t.obsRecordStart}
                </button>
              </div>
            </div>

            {/* Audio */}
            <div className={sectionClass}>
              <h3 className="text-sm font-semibold mb-2">{t.obsAudioTitle}</h3>
              {audioInputs.length === 0 ? (
                <p className="text-xs text-neutral-500">{t.obsAudioEmpty}</p>
              ) : (
                <ul className="space-y-2">
                  {audioInputs.map((input) => (
                    <li
                      key={input.name}
                      className="flex items-center gap-2"
                      data-testid="caster-obs-audio-input"
                    >
                      <span
                        className="w-36 shrink-0 truncate text-xs text-neutral-300"
                        title={input.name}
                      >
                        {input.name}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={input.muted ? 0 : input.volumeMul}
                        disabled={input.muted}
                        aria-label={format(t.obsVolumeAria, {
                          input: input.name,
                        })}
                        onChange={(e) =>
                          void changeVolume(
                            input.name,
                            Number(e.target.value)
                          ).catch(() => undefined)
                        }
                        className="flex-1 accent-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void changeMute(input.name, !input.muted).catch(
                            (err) =>
                              addToast(
                                format(t.obsActionError, {
                                  message: (err as Error)?.message || '',
                                }),
                                'error'
                              )
                          )
                        }
                        aria-label={format(
                          input.muted ? t.obsAudioUnmute : t.obsAudioMute,
                          { input: input.name }
                        )}
                        aria-pressed={input.muted}
                        className={`shrink-0 px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                          input.muted
                            ? 'bg-red-500/20 border-red-500/50 text-red-300'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        M
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
