// features/admin/diffusion/ui/PublicMvpOverlayPanel.tsx — Diffusion ›
// Overlays › « Sondage MVP du public » : tout ce qui touche au vote du public
// dans la source OBS `/overlay/regie`, au même endroit.
//   1. Tester à l'écran : un faux vote animé, marqué TEST, dans la vraie
//      source — on règle la scène sur le vrai visuel avant le direct ;
//   2. Réglages : durée par défaut, position, détail Twitch / Discord ;
//   3. En direct : le vote de chaque match du tournoi choisi (ouvrir, clore,
//      décompte qui se rafraîchit) — le panneau de l'onglet Résultats.

import { useEffect, useState, type FormEvent } from 'react';
import * as z from 'zod';
import { useToast } from '@/components/Toast';
import { useOverlayPresence } from '@/hooks/useOverlayPresence';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminMvpOverlay from '@/lib/i18n/locales/admin-fr/adminMvpOverlay';
import StatsMvpPanel from '@/components/admin/tournament/StatsMvpPanel';
import { DEMO_TOTAL_MS } from '@/utils/overlay/publicMvpDemo';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanEyebrow,
  rubanFormInput,
  rubanHelp,
  rubanLabel,
  rubanMuted,
} from '@/features/ruban/ruban';
import { withAdminQuery } from '../../_shared/query';
import { useMvpOverlay } from '../hooks/useMvpOverlay';
import type { MvpOverlaySettings } from '../schemas';

const POSITIONS = ['top', 'center', 'bottom'] as const;

const settingsSchema = z.object({
  window_minutes: z.number().int().min(1).max(360),
  position: z.enum(POSITIONS),
  show_sources: z.boolean(),
});

/** Secondes restantes d'un test, rafraîchies chaque seconde. */
function useSecondsLeft(until: string | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) {
      setLeft(0);
      return undefined;
    }
    const end = new Date(until).getTime();
    const tick = () =>
      setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return left;
}

function PublicMvpOverlayPanel({
  tournamentId,
  canTuneSettings,
}: {
  /** Tournoi choisi en tête de page (`?tournament=`), ou null. */
  tournamentId: string | null;
  /** `manage_broadcast` : sans lui, réglages en lecture seule. */
  canTuneSettings: boolean;
}) {
  const t = useAdminT(nsAdminMvpOverlay);
  const { addToast } = useToast();
  const presence = useOverlayPresence();
  const { query, save, test } = useMvpOverlay();
  const state = query.data ?? null;
  const [draft, setDraft] = useState<MvpOverlaySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = draft ?? state?.settings ?? null;
  const secondsLeft = useSecondsLeft(
    state?.demo.active ? state.demo.until : null
  );
  const testing = !!state?.demo.active && secondsLeft > 0;
  const regieLive = presence?.isLive('regie') ?? false;

  async function run(fn: () => Promise<unknown>, ok: string, ko: string) {
    setBusy(true);
    try {
      await fn();
      addToast(ok, 'success');
      return true;
    } catch (err: unknown) {
      addToast((err as Error)?.message || ko, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse(settings);
    if (!parsed.success) return;
    if (await run(() => save(parsed.data), t.saved, t.errorSave))
      setDraft(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--t1,#f4edf7)]">
          {t.title}
        </h2>
        <p className={`mt-1 text-sm ${rubanMuted}`}>{t.subtitle}</p>
      </div>

      {query.isError && (
        <p className="text-sm text-[var(--err,#ff6b6b)]">{t.errorLoad}</p>
      )}

      {/* 1. Tester à l'écran */}
      <section className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={rubanEyebrow}>{t.testTitle}</p>
          <Chip tone={regieLive ? 'ok' : 'warn'}>
            {regieLive ? t.regieLive : t.regieOffline}
          </Chip>
        </div>
        <p className={rubanHelp}>
          {format(t.testHint, { seconds: Math.round(DEMO_TOTAL_MS / 1000) })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AdminButton
            variant="primary"
            size="sm"
            disabled={busy || !state}
            onClick={() =>
              void run(() => test('test-start'), t.testStarted, t.errorTest)
            }
            data-testid="mvp-overlay-test-start"
          >
            {testing ? t.testRestart : t.testStart}
          </AdminButton>
          {testing && (
            <>
              <AdminButton
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => test('test-stop'), t.testStopped, t.errorTest)
                }
              >
                {t.testStop}
              </AdminButton>
              <span className="text-sm tabular-nums text-[var(--t2,#c7bfca)]">
                {format(t.testRunning, { seconds: secondsLeft })}
              </span>
            </>
          )}
        </div>
      </section>

      {/* 2. Réglages */}
      {settings && (
        <form
          onSubmit={onSave}
          className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] p-4"
        >
          <p className={rubanEyebrow}>{t.settingsTitle}</p>
          {!canTuneSettings && (
            <p className={rubanHelp}>{t.readOnlySettings}</p>
          )}
          <fieldset
            disabled={!canTuneSettings || busy}
            className="mt-3 grid gap-4 sm:grid-cols-3"
          >
            <label>
              <span className={rubanLabel}>{t.windowLabel}</span>
              <input
                type="number"
                min={1}
                max={360}
                className={`${rubanFormInput} !w-28 font-mono`}
                value={settings.window_minutes}
                onChange={(e) =>
                  setDraft({
                    ...settings,
                    window_minutes: Number(e.target.value),
                  })
                }
              />
            </label>
            <div>
              <span className={rubanLabel}>{t.positionLabel}</span>
              <div
                role="radiogroup"
                aria-label={t.positionLabel}
                className="flex gap-1.5"
              >
                {POSITIONS.map((p) => (
                  <AdminButton
                    key={p}
                    type="button"
                    size="sm"
                    role="radio"
                    aria-checked={settings.position === p}
                    variant={settings.position === p ? 'secondary' : 'ghost'}
                    onClick={() => setDraft({ ...settings, position: p })}
                  >
                    {p === 'top'
                      ? t.positionTop
                      : p === 'center'
                        ? t.positionCenter
                        : t.positionBottom}
                  </AdminButton>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 self-end text-sm text-[var(--t2,#c7bfca)]">
              <input
                type="checkbox"
                checked={settings.show_sources}
                onChange={(e) =>
                  setDraft({ ...settings, show_sources: e.target.checked })
                }
              />
              {t.showSourcesLabel}
            </label>
          </fieldset>
          {canTuneSettings && (
            <AdminButton
              type="submit"
              variant="primary"
              size="sm"
              className="mt-4"
              disabled={busy || !draft}
            >
              {t.save}
            </AdminButton>
          )}
        </form>
      )}

      {/* 3. En direct */}
      <section>
        <p className={`mb-3 ${rubanEyebrow}`}>{t.liveTitle}</p>
        {tournamentId ? (
          <StatsMvpPanel
            kind="public"
            tournamentId={tournamentId}
            defaultMinutes={state?.settings.window_minutes}
          />
        ) : (
          <p className={`text-sm ${rubanMuted}`}>{t.noTournament}</p>
        )}
      </section>
    </div>
  );
}

// Son propre cache de requêtes : la page qui l'accueille n'en monte pas (le
// panneau est chargé à la demande, cf. pages/admin/diffusion/overlays.tsx).
export default withAdminQuery(PublicMvpOverlayPanel);
