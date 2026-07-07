// components/admin/director/RunStatusHeader.tsx
// Feature: Run-of-show — Lot 3 + Lot 6 (timing/drift).
// Header de la page Director : nom du run, badge de statut, compteur segments,
// boutons start/end. La logique d'idempotency + confirmation est portee par
// le parent ; ce composant est presentationnel.
//
// Lot 6 : ajoute une mini-jauge horizontale "planned vs reel" + un delta texte
// signe/couleur. La jauge n'apparait que si on a un planning calcule.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  runStatusBadgeClasses,
  runStatusDotClasses,
  runStatusLabel,
} from '@/utils/eventSegmentLabels';
import type { ComputedRunSchedule } from '@/utils/eventSchedule';
import type { EventRun, EventSegment } from '@/types/events';

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
  const t = useAdminT('adminDirectorRunStatusHeader');
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
        ? 'text-red-400'
        : schedule.driftSec < -30
          ? 'text-emerald-400'
          : 'text-neutral-400';

    driftGauge = (
      <div
        className="relative h-2 w-[200px] rounded-full bg-neutral-800/80 border border-neutral-700/60"
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
          className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-neutral-400/80 rounded"
          style={{ left: `calc(${plannedPct}% - 1px)` }}
          aria-hidden="true"
        />
        {/* Marqueur real now : couleur selon retard/avance. */}
        <span
          className={`absolute top-[-3px] bottom-[-3px] w-[2px] rounded ${
            schedule.driftSec > 30
              ? 'bg-red-400'
              : schedule.driftSec < -30
                ? 'bg-emerald-400'
                : 'bg-neutral-300'
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
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{run.name}</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${runStatusBadgeClasses(
                run.status
              )}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${runStatusDotClasses(
                  run.status
                )}`}
              />
              {runStatusLabel(run.status)}
            </span>
          </div>
          <div className="mt-1 text-sm text-neutral-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <span className="text-neutral-500">{t.slugLabel}</span>{' '}
              <code className="text-xs">{run.slug}</code>
            </span>
            <span>
              <span className="text-neutral-500">{t.dateLabel}</span>{' '}
              {formatDate(run.scheduled_at)}
            </span>
            {run.started_at && (
              <span>
                <span className="text-neutral-500">{t.startedLabel}</span>{' '}
                {formatDate(run.started_at)}
              </span>
            )}
            {run.ended_at && (
              <span>
                <span className="text-neutral-500">{t.endedLabel}</span>{' '}
                {formatDate(run.ended_at)}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-neutral-300">
            <span className="font-medium">{doneCount}</span>
            <span className="text-neutral-500">
              {' '}
              / {total} {t.segmentsLabel}
            </span>
            <span className="text-neutral-500">
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
            <button
              type="button"
              onClick={onStartRun}
              disabled={busy}
              data-testid="run-start"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
            >
              {t.startRun}
            </button>
          )}
          {run.status === 'live' && (
            <button
              type="button"
              onClick={onEndRun}
              disabled={busy}
              data-testid="run-end"
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
            >
              {t.endRun}
            </button>
          )}
          {run.status === 'done' && (
            <span
              className="px-4 py-2 rounded-lg bg-neutral-800 text-sm text-neutral-400 border border-neutral-700"
              data-testid="run-done-label"
            >
              {t.runDone}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
