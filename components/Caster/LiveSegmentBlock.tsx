// components/Caster/LiveSegmentBlock.tsx
//
// Bloc "Segment en cours" du Cockpit caster.
//
// 3 etats :
//   - run live + segment live → countdown, progress bar, status badge
//   - run live + pas de segment live → "en attente du prochain segment"
//   - pas de run live → cf. parent (affiche assignations a la place)
//
// Lot 6 (run-of-show) : countdown timing aligne sur le Director.
//   - Segment courant : grand timer "Restant MM:SS" ou "Depassement MM:SS"
//     base sur duration_min. Couleur : vert > 2min, amber 30s-2min ou overrun
//     < 2min, rouge overrun >= 2min. Si duration_min null → "Sans duree
//     definie" (pas de countdown).
//   - Segment suivant : "Demarre dans MM:SS" base sur le plannedStartAt
//     calcule par computeRunSchedule (meme source de verite que le Director).
//     Si plannedStartAt est dans le passe → "Demarre maintenant".

import { useEffect, useMemo, useState } from 'react';
import type { EventRun, EventSegment } from '@/types/events';
import {
  computeRunSchedule,
  type ComputedRunSchedule,
} from '@/utils/eventSchedule';
import { useT, format } from '@/lib/i18n/useT';

type LiveSegmentDict = ReturnType<typeof useT<'liveSegmentBlock'>>;

type Props = {
  run: EventRun | null;
  currentSegment: EventSegment | null;
  nextSegment: EventSegment | null;
  /**
   * Planning pre-calcule par le parent (ex: cockpit) pour partager la meme
   * horloge (tick 1s) entre plusieurs blocs. Si absent, on recalcule en
   * interne — utile pour tests / usages standalone.
   */
  schedule?: ComputedRunSchedule | null;
};

function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(totalSeconds);
  const mm = Math.floor(abs / 60);
  const ss = Math.floor(abs % 60);
  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const getStatusBadge = (
  t: LiveSegmentDict
): Record<string, { label: string; cls: string }> => ({
  upcoming: { label: t.statusUpcoming, cls: 'bg-gray-700/60 text-gray-200' },
  live: { label: t.statusLive, cls: 'bg-red-500/80 text-white animate-pulse' },
  done: { label: t.statusDone, cls: 'bg-emerald-600/60 text-emerald-50' },
  skipped: { label: t.statusSkipped, cls: 'bg-amber-600/60 text-amber-50' },
});

const getTypeLabel = (t: LiveSegmentDict): Record<string, string> => ({
  match: t.typeMatch,
  break: t.typeBreak,
  intro: t.typeIntro,
  outro: t.typeOutro,
  custom: t.typeCustom,
});

/**
 * Hook tick 1s visibility-gated. Skip setInterval si l'onglet est cache
 * (economie batterie mobile). Re-snap a Date.now() au retour visible pour
 * eviter un saut visuel.
 */
function useNowTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return now;
}

export default function LiveSegmentBlock({
  run,
  currentSegment,
  nextSegment,
  schedule,
}: Props) {
  const t = useT('liveSegmentBlock');
  const STATUS_BADGE = getStatusBadge(t);
  const TYPE_LABEL = getTypeLabel(t);
  const tickEnabled = !!run;
  const now = useNowTick(tickEnabled);

  // Si le parent ne fournit pas de schedule, on le calcule localement. On
  // garde la meme horloge (now) pour rester coherent avec les countdowns.
  const localSchedule = useMemo<ComputedRunSchedule | null>(() => {
    if (schedule !== undefined) return schedule;
    if (!run) return null;
    // Pour le calcul standalone on n'a pas la liste complete des segments :
    // on assemble currentSegment + nextSegment. C'est partial mais suffit a
    // produire le plannedStartAt du nextSegment quand le parent ne le pousse
    // pas. Le parent (cockpit) passe le vrai schedule, c'est le chemin
    // prefere.
    const segs: EventSegment[] = [];
    if (currentSegment) segs.push(currentSegment);
    if (nextSegment) segs.push(nextSegment);
    if (segs.length === 0) return null;
    return computeRunSchedule(run, segs, now);
  }, [schedule, run, currentSegment, nextSegment, now]);

  if (!run) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white mb-1">
          {t.noEventTitle}
        </div>
        <p className="text-xs text-gray-400">{t.noEventBody}</p>
      </div>
    );
  }

  // Helper : sous-ligne "Demarre dans MM:SS" pour le segment suivant.
  // Renvoie null si on ne peut pas la calculer (pas de schedule, pas de
  // nextSegment, etc.).
  const renderNextStartHint = () => {
    if (!nextSegment) return null;
    const nextTiming = localSchedule?.segments.find(
      (s) => s.segmentId === nextSegment.id
    );
    if (!nextTiming) return null;
    const startMs = Date.parse(nextTiming.plannedStartAt);
    if (!Number.isFinite(startMs)) return null;
    const diffSec = Math.floor((startMs - now) / 1000);
    if (diffSec <= 0) {
      return (
        <span className="text-amber-300 font-medium">{t.startsNow}</span>
      );
    }
    return (
      <span className="text-gray-200">
        {t.startsIn}{' '}
        <span className="font-mono tabular-nums text-white">
          {formatDuration(diffSec)}
        </span>
      </span>
    );
  };

  if (!currentSegment) {
    return (
      <div className="rounded-2xl border border-purple-500/30 bg-purple-900/20 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-100">
            {t.liveBadge}
          </span>
          <span className="text-xs text-gray-300">{run.name}</span>
        </div>
        <div className="text-sm font-semibold text-white mb-2">
          {t.waitingNextSegment}
        </div>
        {nextSegment && (
          <div className="text-xs text-gray-300 space-y-1">
            <div>
              {t.nextLabel}{' '}
              <span className="text-white">
                {nextSegment.title ||
                  TYPE_LABEL[nextSegment.type] ||
                  t.segmentFallback}
              </span>
              {nextSegment.duration_min
                ? format(t.minSuffix, { min: nextSegment.duration_min })
                : ''}
            </div>
            {renderNextStartHint() && <div>{renderNextStartHint()}</div>}
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

  // overrun = depassement positif (en secondes). 0 si pas encore depasse ou
  // si on ne peut pas mesurer. Calcule en local pour rester aligne avec le
  // tick 1s local, mais le schedule du parent expose la meme info.
  const overrunSec =
    remainingSeconds !== null && remainingSeconds < 0
      ? -remainingSeconds
      : 0;

  // Couleur du timer principal : vert > 2min restants, amber 30s-2min ou
  // overrun < 2min, rouge overrun >= 2min. Si pas de duree → gris.
  let timerColorCls = 'text-white';
  let timerLabel: string = t.timerRemaining;
  let timerValue = '—';

  if (remainingSeconds === null) {
    timerColorCls = 'text-gray-400';
    timerLabel = t.timerNoDuration;
    timerValue = '—';
  } else if (overrunSec > 0) {
    timerLabel = t.timerOverrun;
    timerValue = formatDuration(overrunSec);
    timerColorCls =
      overrunSec >= 120 ? 'text-red-400' : 'text-amber-300';
  } else {
    timerLabel = t.timerRemaining;
    timerValue = formatDuration(remainingSeconds);
    if (remainingSeconds > 120) {
      timerColorCls = 'text-emerald-300';
    } else if (remainingSeconds >= 30) {
      timerColorCls = 'text-amber-300';
    } else {
      // < 30s restants : amber appuye (le rouge est reserve a l'overrun >=2min
      // pour escalader au caster qu'il faut clore / demander au Director).
      timerColorCls = 'text-amber-300';
    }
  }

  const badge = STATUS_BADGE[currentSegment.status] ?? STATUS_BADGE.upcoming;
  const typeLabel = TYPE_LABEL[currentSegment.type] ?? t.segmentFallback;

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
      <h2 className="text-lg font-bold text-white mb-3 leading-tight">
        {currentSegment.title || typeLabel}
      </h2>

      {/* Bloc countdown principal — grand format, role="timer" pour a11y. */}
      <div className="rounded-xl bg-black/50 border border-white/5 px-4 py-3 mb-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
          {timerLabel}
        </div>
        <div
          role="timer"
          aria-live="off"
          aria-label={`${timerLabel} ${timerValue}`}
          className={`text-4xl font-mono font-bold tabular-nums leading-none ${timerColorCls}`}
        >
          {timerValue}
        </div>
      </div>

      {/* Bloc ecoule (secondaire, contexte) */}
      <div className="rounded-lg bg-black/40 px-3 py-2 mb-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-400">
          {t.elapsed}
        </div>
        <div className="text-sm font-mono font-semibold text-white tabular-nums">
          {formatDuration(elapsedSeconds)}
        </div>
      </div>

      {durationMs && (
        <div
          className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3"
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

      {/* Sous-bloc : prochain segment + countdown jusqu'a son demarrage. */}
      {nextSegment && (
        <div className="rounded-lg bg-black/30 px-3 py-2 text-xs text-gray-300 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 truncate">
            <span className="text-gray-500">{t.nextShort} </span>
            <span className="text-white">
              {nextSegment.title ||
                TYPE_LABEL[nextSegment.type] ||
                t.segmentFallback}
            </span>
          </div>
          {renderNextStartHint() && (
            <div className="shrink-0">{renderNextStartHint()}</div>
          )}
        </div>
      )}
    </div>
  );
}
