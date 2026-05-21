// components/Caster/LiveSegmentBlock.tsx
//
// Bloc "Segment en cours" du Cockpit caster.
//
// 3 etats :
//   - run live + segment live → countdown, progress bar, status badge
//   - run live + pas de segment live → "en attente du prochain segment"
//   - pas de run live → cf. parent (affiche assignations a la place)

import { useEffect, useState } from 'react';
import type { EventRun, EventSegment } from '@/types/events';

type Props = {
  run: EventRun | null;
  currentSegment: EventSegment | null;
  nextSegment: EventSegment | null;
};

function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const mm = Math.floor(abs / 60);
  const ss = Math.floor(abs % 60);
  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  upcoming: { label: 'A venir', cls: 'bg-gray-700/60 text-gray-200' },
  live: { label: 'EN DIRECT', cls: 'bg-red-500/80 text-white animate-pulse' },
  done: { label: 'Termine', cls: 'bg-emerald-600/60 text-emerald-50' },
  skipped: { label: 'Passe', cls: 'bg-amber-600/60 text-amber-50' },
};

const TYPE_LABEL: Record<string, string> = {
  match: 'Match',
  break: 'Pause',
  intro: 'Intro',
  outro: 'Outro',
  custom: 'Segment',
};

export default function LiveSegmentBlock({
  run,
  currentSegment,
  nextSegment,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!run) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white mb-1">
          Pas d event en cours
        </div>
        <p className="text-xs text-gray-400">
          Aucun event_run n est actuellement en direct sur ce tenant. Tes
          prochaines assignations s affichent ci-dessous.
        </p>
      </div>
    );
  }

  if (!currentSegment) {
    return (
      <div className="rounded-2xl border border-purple-500/30 bg-purple-900/20 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-100">
            En direct
          </span>
          <span className="text-xs text-gray-300">{run.name}</span>
        </div>
        <div className="text-sm font-semibold text-white mb-2">
          En attente du prochain segment
        </div>
        {nextSegment && (
          <div className="text-xs text-gray-300">
            Prochain :{' '}
            <span className="text-white">
              {nextSegment.title || TYPE_LABEL[nextSegment.type] || 'Segment'}
            </span>
            {nextSegment.duration_min
              ? ` • ${nextSegment.duration_min} min`
              : ''}
          </div>
        )}
      </div>
    );
  }

  // Live segment : countdown / progress.
  const startedAtMs = currentSegment.started_at
    ? Date.parse(currentSegment.started_at)
    : null;
  const durationMin = currentSegment.duration_min ?? null;
  const durationMs = durationMin ? durationMin * 60_000 : null;

  let elapsedSeconds = 0;
  let remainingSeconds: number | null = null;
  let progress = 0;
  if (startedAtMs) {
    elapsedSeconds = Math.floor((now - startedAtMs) / 1000);
    if (durationMs) {
      remainingSeconds = Math.floor((startedAtMs + durationMs - now) / 1000);
      progress = Math.min(
        100,
        Math.max(0, ((now - startedAtMs) / durationMs) * 100)
      );
    }
  }

  const badge = STATUS_BADGE[currentSegment.status] ?? STATUS_BADGE.upcoming;
  const typeLabel = TYPE_LABEL[currentSegment.type] ?? 'Segment';

  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-950/20 p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.cls}`}
        >
          {badge.label}
        </span>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-gray-200">
          {typeLabel}
        </span>
        <span className="text-xs text-gray-400 truncate">{run.name}</span>
      </div>
      <h2 className="text-lg font-bold text-white mb-2 leading-tight">
        {currentSegment.title || typeLabel}
      </h2>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg bg-black/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            Ecoule
          </div>
          <div className="text-lg font-mono font-semibold text-white tabular-nums">
            {formatDuration(elapsedSeconds)}
          </div>
        </div>
        <div className="rounded-lg bg-black/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            {remainingSeconds !== null && remainingSeconds < 0
              ? 'Depasse de'
              : 'Restant'}
          </div>
          <div
            className={`text-lg font-mono font-semibold tabular-nums ${
              remainingSeconds !== null && remainingSeconds < 60
                ? 'text-amber-300'
                : 'text-white'
            }`}
          >
            {remainingSeconds === null ? '—' : formatDuration(remainingSeconds)}
          </div>
        </div>
      </div>

      {durationMs && (
        <div
          className="h-1.5 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full transition-all duration-500 ${
              progress >= 100
                ? 'bg-amber-400'
                : 'bg-gradient-to-r from-purple-400 to-pink-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
