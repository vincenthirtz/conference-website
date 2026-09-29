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
//
// Passe « Le Ruban » (lot 10C) : états en Chip — le stream en cours prend le
// ton `live` (la lueur), l'enregistrement le ton erreur ; mêmes confirmations.

import { useEffect, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logCasterAction } from '@/utils/caster/auditClient';

import {
  errNoticeClass,
  inputClass,
  labelClass,
  panelClass,
  panelTitleClass,
  sectionClass,
  smallBtnClass,
  warnNoticeClass,
} from './fieldClasses';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import { useObs } from './useObs';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

/** hh:mm:ss depuis un epoch de départ (durée stream/record). */
function formatElapsed(startedAt: number, now: number): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Ton de la puce d'état de la connexion OBS. */
const PHASE_TONE: Record<string, ChipTone> = {
  connected: 'ok',
  connecting: 'warn',
};

export default function ObsPanel() {
  const t = useAdminT(nsAdminCasterScenes);
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

  return (
    <section className={panelClass} data-testid="caster-obs-panel">
      {dialog}

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className={panelTitleClass}>{t.obsTitle}</h2>
        <Chip
          tone={PHASE_TONE[phase] ?? 'neutral'}
          data-testid="caster-obs-status"
        >
          {statusLabel}
        </Chip>
      </div>
      <p className="mt-1 text-xs text-[var(--t3,#a39ba6)] mb-3">{t.obsIntro}</p>

      {browserWarning && (
        <div className={`mb-3 px-3 py-2 text-xs ${warnNoticeClass}`}>
          {t.obsBrowserWarning}
        </div>
      )}

      {reconnectFailedAttempts != null && (
        <div className={`mb-3 px-3 py-2 text-xs ${errNoticeClass}`}>
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
        <AdminButton
          variant={phase === 'disconnected' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => void onConnectClick()}
          data-testid="caster-obs-connect"
        >
          {phase === 'disconnected' ? t.obsConnect : t.obsDisconnect}
        </AdminButton>
      </div>
      <p className="text-[11px] text-[var(--t4,#807984)] mt-1.5">
        {t.obsPasswordNote}
      </p>

      {connectErrorLabel && (
        <p
          className="mt-2 text-xs text-[var(--err,#ff6b6b)]"
          data-testid="caster-obs-error"
        >
          {connectErrorLabel}
        </p>
      )}

      {phase === 'connected' && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Scènes */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)] mb-1">
              {t.obsScenesTitle}
            </h3>
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
                    className={`h-[30px] px-2.5 rounded-[var(--r-ctrl,4px)] border font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] transition-colors ${
                      name === currentScene
                        ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.22)] text-[var(--or-100,#f6e1ff)]'
                        : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-[var(--line,rgba(194,196,201,.12))]">
              <button
                type="button"
                onClick={() => void onSetupScenes()}
                disabled={busy === 'setup'}
                className={smallBtnClass}
                data-testid="caster-obs-setup-scenes"
              >
                {busy === 'setup' ? t.obsSetupScenesRunning : t.obsSetupScenes}
              </button>
              <p className="text-[11px] text-[var(--t4,#807984)] mt-1.5">
                {t.obsSetupScenesHint}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Stream */}
            <div className={sectionClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                    {t.obsStreamTitle}
                  </h3>
                  <Chip
                    tone={stream.active ? 'live' : 'neutral'}
                    data-testid="caster-obs-stream-state"
                  >
                    {stream.active && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lf,#7fca65)]"
                      />
                    )}
                    {stream.active ? t.obsStreamLive : t.obsStreamOff}
                  </Chip>
                  {stream.active && stream.startedAt != null && (
                    <span className="font-mono text-xs font-bold tabular-nums text-[var(--t1,#f4edf7)]">
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
              <p className="text-[11px] text-[var(--t4,#807984)] mt-1.5">
                {t.obsStreamKeyNote}
              </p>
            </div>

            {/* Record */}
            <div className={sectionClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                    {t.obsRecordTitle}
                  </h3>
                  <Chip tone={record.active ? 'err' : 'neutral'}>
                    {record.active ? t.obsRecordOn : t.obsRecordOff}
                  </Chip>
                  {record.active && record.startedAt != null && (
                    <span className="font-mono text-xs font-bold tabular-nums text-[var(--t1,#f4edf7)]">
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
              <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)] mb-2">
                {t.obsAudioTitle}
              </h3>
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
                        className="flex-1 accent-[var(--or,#b467d1)]"
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
                        className={`h-[30px] w-[30px] shrink-0 rounded-[var(--r-ctrl,4px)] border font-[family-name:var(--fd)] text-[12px] font-bold ${
                          input.muted
                            ? 'bg-[rgba(255,107,107,.18)] border-[rgba(255,107,107,.55)] text-[#ffc2c2]'
                            : 'bg-[var(--s1,#100812)] border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)]'
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
