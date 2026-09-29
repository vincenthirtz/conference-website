// components/admin/director/RunStatusHeader.tsx
// Feature: Run-of-show — Lot 3 + Lot 6 (timing/drift).
// Header de la page Director : nom du run, badge de statut, compteur segments,
// boutons start/end. La logique d'idempotency + confirmation est portee par
// le parent ; ce composant est presentationnel.
//
// Lot 6 : ajoute une mini-jauge horizontale "planned vs reel" + un delta texte
// signe/couleur. La jauge n'apparait que si on a un planning calcule.
//
// Passe « Le Ruban » (lot 5C) : statut en Chip (ton `live` = la seule lueur),
// boutons AdminButton — mêmes `data-testid`, mêmes gestes, même place.

import { useState } from 'react';
import { copyText } from '@/utils/clipboard';
import Link from 'next/link';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { runStatusLabel } from '@/utils/eventSegmentLabels';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import type { ComputedRunSchedule } from '@/utils/eventSchedule';
import type { EventRun, EventSegment } from '@/types/events';
import nsAdminDirectorRunStatusHeader from '@/lib/i18n/locales/admin-fr/adminDirectorRunStatusHeader';

type Props = {
  run: EventRun;
  segments: EventSegment[];
  /** Planning calcule (Lot 6). Null = pas d'affichage drift. */
  schedule?: ComputedRunSchedule | null;
  /**
   * Horloge "now" injectee par le parent — utile pour que le composant ne
   * re-tick pas de son cote (le parent gere le tick a 1s pour tout le monde).
   */
  nowMs?: number;
  onStartRun: () => void;
  onEndRun: () => void;
  busy?: boolean;
};

/** Ton de la puce de statut : `live` porte la seule lueur de la plateforme. */
const RUN_STATUS_TONE: Record<string, ChipTone> = {
  draft: 'neutral',
  live: 'live',
  done: 'ok',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function formatTimeHHMMSS(d: string | number | null) {
  if (d === null || d === undefined) return '—';
  try {
    return new Date(d).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(d);
  }
}

/** Formate un delta en secondes : "+3:42" / "-1:15" / "± 0:00". */
function formatDriftSec(secRaw: number): string {
  const sign = secRaw > 0 ? '+' : secRaw < 0 ? '-' : '± ';
  const abs = Math.abs(Math.round(secRaw));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

export default function RunStatusHeader({
  run,
  segments,
  schedule,
  nowMs,
  onStartRun,
  onEndRun,
  busy,
}: Props) {
  const t = useAdminT(nsAdminDirectorRunStatusHeader);
  const doneCount = segments.filter(
    (s) => s.status === 'done' || s.status === 'skipped'
  ).length;
  const total = segments.length;

  /* ----------------------------------------------------------------------
   * Drift gauge.
   * On dessine une barre horizontale dont la largeur = total planifie du
   * run (debut du 1er segment -> fin du dernier). Marqueurs :
   *  - "planned now" : ou devrait-on en etre maintenant si tout etait a
   *    l'heure (le run a-t-il vraiment commence ? planned start = scheduled).
   *  - "real now" : ou en est-on vraiment = planned now + driftSec.
   * Si la fenetre est vide ou si on n'a pas de schedule, on n'affiche rien.
   * -------------------------------------------------------------------- */
  let driftGauge: React.ReactNode = null;
  let driftLabel: React.ReactNode = null;
  if (schedule && schedule.segments.length > 0) {
    const first = schedule.segments[0];
    const last = schedule.segments[schedule.segments.length - 1];
    const startMs = new Date(first.plannedStartAt).getTime();
    const endMs = new Date(last.plannedEndAt).getTime();
    const totalMs = Math.max(0, endMs - startMs);
    // Si nowMs n'est pas fourni on tombe sur startMs (planning purement
    // previsionnel : marqueur reel = marqueur planifie -> drift visible
    // uniquement via le texte). Le parent Director passe toujours nowMs.
    const now = nowMs ?? startMs;
    // "planned now" : projection de l'horloge sur l'axe planifie. On clamp
    // [0, totalMs] pour que la barre ne deborde pas avant/apres le run.
    const plannedNowMs = Math.min(Math.max(now, startMs), endMs);
    // "real now" : planned + drift. Idem clamp.
    const realNowRawMs = plannedNowMs + schedule.driftSec * 1000;
    const realNowMs = Math.min(Math.max(realNowRawMs, startMs), endMs);

    const plannedPct =
      totalMs === 0 ? 0 : ((plannedNowMs - startMs) / totalMs) * 100;
    const realPct = totalMs === 0 ? 0 : ((realNowMs - startMs) / totalMs) * 100;

    const driftColor =
      schedule.driftSec > 30
        ? 'text-[var(--err,#ff6b6b)]'
        : schedule.driftSec < -30
          ? 'text-[var(--ok,#30d07e)]'
          : 'text-[var(--t3,#a39ba6)]';

    driftGauge = (
      <div
        className="relative h-2 w-[200px] rounded-full border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s3,#2f2732)]"
        title={format(t.driftTitle, {
          planned: formatTimeHHMMSS(plannedNowMs),
          real: formatTimeHHMMSS(realNowMs),
        })}
        aria-label={t.driftGaugeAria}
        data-testid="run-drift-gauge"
        data-drift-sec={Math.round(schedule.driftSec)}
      >
        {/* Marqueur planned now : ligne neutre. */}
        <span
          className="absolute top-[-3px] bottom-[-3px] w-[2px] rounded bg-[var(--t4,#807984)]"
          style={{ left: `calc(${plannedPct}% - 1px)` }}
          aria-hidden="true"
        />
        {/* Marqueur real now : couleur selon retard/avance. */}
        <span
          className={`absolute top-[-3px] bottom-[-3px] w-[2px] rounded ${
            schedule.driftSec > 30
              ? 'bg-[var(--err,#ff6b6b)]'
              : schedule.driftSec < -30
                ? 'bg-[var(--ok,#30d07e)]'
                : 'bg-[var(--t2,#c7bfca)]'
          }`}
          style={{ left: `calc(${realPct}% - 1px)` }}
          aria-hidden="true"
        />
      </div>
    );

    driftLabel = (
      <span
        className={`text-xs font-mono ${driftColor}`}
        data-testid="run-drift-label"
      >
        {formatDriftSec(schedule.driftSec)}
      </span>
    );
  }

  return (
    <>
      {/* Le director était le seul écran de la diffusion sans ses onglets :
          montés ici, la page étant gelée en taille. */}
      <DiffusionTabsNav active="runofshow" />
      <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[clamp(24px,3.2vw,36px)] text-[var(--t1,#f4edf7)]">
                {run.name}
              </h1>
              <Chip tone={RUN_STATUS_TONE[run.status] ?? 'neutral'}>
                {run.status === 'live' && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lf,#7fca65)]"
                  />
                )}
                {runStatusLabel(run.status)}
              </Chip>
            </div>
            <div className="mt-1 text-sm text-[var(--t3,#a39ba6)] flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="text-[var(--t4,#807984)]">{t.slugLabel}</span>{' '}
                <code className="text-xs">{run.slug}</code>
              </span>
              <span>
                <span className="text-[var(--t4,#807984)]">{t.dateLabel}</span>{' '}
                {formatDate(run.scheduled_at)}
              </span>
              {run.started_at && (
                <span>
                  <span className="text-[var(--t4,#807984)]">
                    {t.startedLabel}
                  </span>{' '}
                  {formatDate(run.started_at)}
                </span>
              )}
              {run.ended_at && (
                <span>
                  <span className="text-[var(--t4,#807984)]">
                    {t.endedLabel}
                  </span>{' '}
                  {formatDate(run.ended_at)}
                </span>
              )}
            </div>
            <div className="mt-2 text-sm text-[var(--t2,#c7bfca)]" data-numeric>
              <span className="font-medium text-[var(--t1,#f4edf7)]">
                {doneCount}
              </span>
              <span className="text-[var(--t4,#807984)]">
                {' '}
                / {total} {t.segmentsLabel}
              </span>
              <span className="text-[var(--t4,#807984)]">
                {' '}
                {total > 0 ? t.segmentsDone : ''}
              </span>
            </div>
            {driftGauge && (
              <div className="mt-3 flex items-center gap-3">
                {driftGauge}
                {driftLabel}
              </div>
            )}
          </div>
          <div
            className="flex items-center gap-2"
            data-testid="run-status-header-actions"
            data-run-status={run.status}
          >
            {run.status === 'draft' && (
              <AdminButton
                variant="primary"
                size="sm"
                onClick={onStartRun}
                disabled={busy}
                data-testid="run-start"
              >
                {t.startRun}
              </AdminButton>
            )}
            {run.status === 'live' && (
              <AdminButton
                variant="danger"
                size="sm"
                onClick={onEndRun}
                disabled={busy}
                data-testid="run-end"
              >
                {t.endRun}
              </AdminButton>
            )}
            {run.status === 'done' && (
              <Chip data-testid="run-done-label">{t.runDone}</Chip>
            )}
          </div>
        </div>
        <DirectorShortcuts runId={run.id} t={t} />
      </div>
    </>
  );
}

/**
 * Les écrans voisins du director, depuis le director.
 *
 * C'ÉTAIT UN CUL-DE-SAC : un fil d'Ariane vers le run-of-show, rien d'autre.
 * Or on conduit un run en regardant la console live, en parlant au cockpit,
 * et on colle l'URL de CE run dans OBS — trois allers-retours par le menu.
 * Ici, et pas dans la page : elle est gelée en taille.
 */
function DirectorShortcuts({
  runId,
  t,
}: {
  runId: string;
  t: typeof nsAdminDirectorRunStatusHeader.fr;
}) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const path = `/overlay/${runId}`;
  const copy = async () => {
    // Un échec est dit (l'URL reste lisible, à sélectionner à la main).
    const ok = await copyText(`${window.location.origin}${path}`);
    setCopied(ok ? 'ok' : 'failed');
    setTimeout(() => setCopied(null), ok ? 1500 : 4000);
  };
  const chip =
    'inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]';
  return (
    <nav
      aria-label={t.shortcutsLabel}
      className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3"
    >
      <Link href="/admin/broadcast/live" className={chip}>
        {t.shortcutLive}
      </Link>
      <Link href="/admin/regie" className={chip}>
        {t.shortcutCockpit}
      </Link>
      <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[var(--t3,#a39ba6)]">
        <code className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-2 py-1 text-[var(--or-200,#eec4ff)]">
          {path}
        </code>
        <button type="button" onClick={() => void copy()} className={chip}>
          <span aria-live="polite">
            {copied === 'ok'
              ? t.overlayCopied
              : copied === 'failed'
                ? t.overlayCopyFailed
                : t.overlayCopy}
          </span>
        </button>
        <a href={path} target="_blank" rel="noreferrer" className={chip}>
          {t.overlayOpen}
        </a>
      </span>
    </nav>
  );
}
