// components/admin/director/RunStatusHeader.tsx
// Feature: Run-of-show — Lot 3.
// Header de la page Director : nom du run, badge de statut, compteur segments,
// boutons start/end. La logique d'idempotency + confirmation est portee par
// le parent ; ce composant est presentationnel.

import {
  runStatusBadgeClasses,
  runStatusDotClasses,
  runStatusLabel,
} from '@/utils/eventSegmentLabels';
import type { EventRun, EventSegment } from '@/types/events';

type Props = {
  run: EventRun;
  segments: EventSegment[];
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

export default function RunStatusHeader({
  run,
  segments,
  onStartRun,
  onEndRun,
  busy,
}: Props) {
  const doneCount = segments.filter(
    (s) => s.status === 'done' || s.status === 'skipped'
  ).length;
  const total = segments.length;

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
              <span className="text-neutral-500">Slug :</span>{' '}
              <code className="text-xs">{run.slug}</code>
            </span>
            <span>
              <span className="text-neutral-500">Date :</span>{' '}
              {formatDate(run.scheduled_at)}
            </span>
            {run.started_at && (
              <span>
                <span className="text-neutral-500">Demarre :</span>{' '}
                {formatDate(run.started_at)}
              </span>
            )}
            {run.ended_at && (
              <span>
                <span className="text-neutral-500">Termine :</span>{' '}
                {formatDate(run.ended_at)}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-neutral-300">
            <span className="font-medium">{doneCount}</span>
            <span className="text-neutral-500"> / {total} segments</span>
            <span className="text-neutral-500">
              {' '}
              {total > 0 ? 'termines' : ''}
            </span>
          </div>
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
              Demarrer le run
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
              Terminer le run
            </button>
          )}
          {run.status === 'done' && (
            <span
              className="px-4 py-2 rounded-lg bg-neutral-800 text-sm text-neutral-400 border border-neutral-700"
              data-testid="run-done-label"
            >
              Run termine
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
