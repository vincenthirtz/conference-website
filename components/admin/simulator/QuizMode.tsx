import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { FormatType } from '@/types/admin';
import type { SimConfig } from '@/utils/simulatorSerialization';
import { FORMAT_LABELS } from '@/utils/simulatorSerialization';
import { FAKE_MAPS } from '@/utils/simulatorFakeData';
import { SEED_COLORS } from './SimMatchCard';

// WebGL backdrop is browser-only and heavy — load it lazily, client-side only.
const CelebrationCanvas = dynamic(() => import('./CelebrationCanvas'), {
  ssr: false,
});

/** Result of one simulated run, surfaced on the reveal slide. */
export type QuizOutcome = {
  championName: string | null;
  championSeed: number | null;
  podium: { name: string; seed: number }[];
  matchesPlayed: number;
  mapsPlayed: number;
  upsets: number;
  teamCount: number;
};

type Props = {
  config: SimConfig;
  setConfig: (updater: (c: SimConfig) => SimConfig) => void;
  validCountsFor: (f: FormatType) => number[];
  /** Build + simulate one occurrence, stash it, and return the reveal data. */
  onLaunch: () => QuizOutcome;
  /** Commit the last launched simulation to the form editor and switch modes. */
  onOpenInEditor: () => void;
};

const FORMAT_ICONS: Record<FormatType, string> = {
  single_elim: '⚔️',
  double_elim: '♻️',
  swiss: '🔀',
  round_robin: '🔁',
  showmatch: '🎯',
};

const BEST_OF_OPTIONS = [1, 3, 5, 7] as const;
const SWISS_ROUND_OPTIONS = [3, 5, 7, 9] as const;

type Screen =
  | { kind: 'wizard' }
  | { kind: 'rolling' }
  | { kind: 'reveal'; outcome: QuizOutcome };

export default function QuizMode({
  config,
  setConfig,
  validCountsFor,
  onLaunch,
  onOpenInEditor,
}: Props) {
  const tx = useAdminT('adminTournamentSimulator');
  const [stepIdx, setStepIdx] = useState(0);
  const [screen, setScreen] = useState<Screen>({ kind: 'wizard' });
  const rollTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rollTimer.current) window.clearTimeout(rollTimer.current);
    };
  }, []);

  // Step ids depend on the chosen format (Swiss adds a rounds step, double
  // elimination adds a grand-final-reset step). Intro is step 0, recap is last.
  const steps = useMemo<string[]>(() => {
    const s = ['intro', 'format', 'teams', 'bestof', 'maps'];
    if (config.formatType === 'swiss') s.push('swiss');
    if (config.formatType === 'double_elim') s.push('reset');
    s.push('recap');
    return s;
  }, [config.formatType]);

  const clampedIdx = Math.min(stepIdx, steps.length - 1);
  const current = steps[clampedIdx];
  const isFirst = clampedIdx === 0;
  const isLast = clampedIdx === steps.length - 1;

  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);
  const goBack = useCallback(() => {
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);

  // Apply a config change from a single-choice slide, then auto-advance for a
  // snappy "quiz" feel. The format slide keeps its own advance (it reshapes the
  // remaining steps) but the pattern is the same.
  const pickAndAdvance = useCallback(
    (mutate: (c: SimConfig) => SimConfig) => {
      setConfig(mutate);
      window.setTimeout(goNext, 260);
    },
    [setConfig, goNext]
  );

  const pickFormat = useCallback(
    (f: FormatType) => {
      pickAndAdvance((c) => {
        const valid = validCountsFor(f);
        const teamCount = valid.includes(c.teamCount)
          ? c.teamCount
          : valid.includes(8)
            ? 8
            : valid[Math.floor(valid.length / 2)];
        return {
          ...c,
          formatType: f,
          teamCount,
          stageCount: f === 'showmatch' ? 1 : c.stageCount,
        };
      });
    },
    [pickAndAdvance, validCountsFor]
  );

  const handleLaunch = useCallback(() => {
    setScreen({ kind: 'rolling' });
    rollTimer.current = window.setTimeout(() => {
      const outcome = onLaunch();
      setScreen({ kind: 'reveal', outcome });
    }, 850);
  }, [onLaunch]);

  const handleReplay = useCallback(() => {
    setScreen({ kind: 'rolling' });
    rollTimer.current = window.setTimeout(() => {
      const outcome = onLaunch();
      setScreen({ kind: 'reveal', outcome });
    }, 650);
  }, [onLaunch]);

  const handleRestart = useCallback(() => {
    setScreen({ kind: 'wizard' });
    setStepIdx(0);
  }, []);

  // Keyboard navigation while in the wizard.
  useEffect(() => {
    if (screen.kind !== 'wizard') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'Enter' && current === 'intro') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen.kind, current, goNext, goBack]);

  const mapMax = FAKE_MAPS.length;
  const mapOptions = useMemo(
    () =>
      Array.from(new Set([3, 5, 7, mapMax]))
        .filter((n) => n >= 3 && n <= mapMax)
        .sort((a, b) => a - b),
    [mapMax]
  );

  /* -------------------------------------------------------------- reveal */
  if (screen.kind === 'rolling') {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-16 flex flex-col items-center justify-center min-h-[480px]">
        <div className="text-7xl animate-bounce">🎲</div>
        <p className="mt-6 text-lg font-semibold text-neutral-200 animate-pulse">
          {tx.quizRolling}
        </p>
      </div>
    );
  }

  if (screen.kind === 'reveal') {
    const o = screen.outcome;
    const seedClass =
      (o.championSeed != null && SEED_COLORS[o.championSeed]) ||
      'bg-purple-500/20 text-purple-200 border-purple-500/30';
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 overflow-hidden">
        {/* Champion hero with WebGL celebration backdrop */}
        <div className="relative min-h-[380px] flex flex-col items-center justify-center px-6 py-12 text-center">
          <CelebrationCanvas />
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">
              {tx.quizChampionLabel}
            </p>
            <div className="mt-3 text-6xl drop-shadow-[0_4px_24px_rgba(250,204,21,0.4)]">
              🏆
            </div>
            <h2 className="mt-4 text-4xl font-black text-white drop-shadow">
              {o.championName ?? tx.quizNoChampion}
            </h2>
            {o.championSeed != null && (
              <span
                className={`mt-3 inline-block px-3 py-1 rounded-full text-xs font-semibold border ${seedClass}`}
              >
                {format(tx.quizSeedShort, { n: o.championSeed })}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 pb-8 -mt-2 space-y-6">
          {/* Podium */}
          {o.podium.length > 1 && (
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/70 mb-2 text-center">
                {tx.quizPodiumLabel}
              </p>
              <div className="flex items-end justify-center gap-3">
                {[1, 0, 2].map((rank) => {
                  const team = o.podium[rank];
                  if (!team) return null;
                  const heights = ['h-20', 'h-28', 'h-14'];
                  const medals = ['🥈', '🥇', '🥉'];
                  return (
                    <div
                      key={rank}
                      className="flex flex-col items-center w-28"
                    >
                      <div className="text-2xl">{medals[rank]}</div>
                      <div className="text-sm font-semibold text-white truncate max-w-[7rem] text-center">
                        {team.name}
                      </div>
                      <div
                        className={`mt-2 w-full ${heights[rank]} rounded-t-lg border border-white/10 ${
                          rank === 0
                            ? 'bg-amber-500/20'
                            : rank === 1
                              ? 'bg-neutral-400/20'
                              : 'bg-orange-700/20'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fun stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: tx.quizStatTeams, value: o.teamCount },
              { label: tx.quizStatMatches, value: o.matchesPlayed },
              { label: tx.quizStatMaps, value: o.mapsPlayed },
              { label: tx.quizStatUpsets, value: o.upsets },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center"
              >
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-neutral-400 mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={handleReplay}
              title={tx.quizReplayTitle}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow transition-colors"
            >
              🎲 {tx.quizReplay}
            </button>
            <button
              onClick={onOpenInEditor}
              title={tx.quizOpenEditorTitle}
              className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-sm font-semibold shadow transition-colors"
            >
              {tx.quizOpenEditor}
            </button>
            <button
              onClick={handleRestart}
              className="px-5 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold shadow transition-colors"
            >
              {tx.quizRestart}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- wizard */
  const progressSteps = steps.slice(1); // exclude intro from the dot bar
  const progressIdx = clampedIdx - 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-10 min-h-[480px] flex flex-col">
      {/* Progress dots */}
      {!isFirst && (
        <div className="flex items-center justify-center gap-2 mb-8">
          {progressSteps.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i === progressIdx
                  ? 'w-8 bg-purple-500'
                  : i < progressIdx
                    ? 'w-4 bg-purple-500/50'
                    : 'w-4 bg-white/10'
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center">
        {current === 'intro' && (
          <div className="text-center max-w-xl mx-auto">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-3xl font-black text-white">
              {tx.quizIntroTitle}
            </h2>
            <p className="mt-3 text-neutral-400">{tx.quizIntroSubtitle}</p>
            <button
              onClick={goNext}
              className="mt-8 px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-base font-bold shadow-lg transition-colors"
            >
              {tx.quizStart} →
            </button>
          </div>
        )}

        {current === 'format' && (
          <QuestionShell
            title={tx.quizQFormat}
            hint={tx.quizQFormatHint}
            stepLabel={format(tx.quizStepOf, {
              current: progressIdx + 1,
              total: progressSteps.length,
            })}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(FORMAT_LABELS) as FormatType[]).map((f) => (
                <ChoiceCard
                  key={f}
                  selected={config.formatType === f}
                  onClick={() => pickFormat(f)}
                  icon={FORMAT_ICONS[f]}
                  title={FORMAT_LABELS[f]}
                  recommended={
                    f === 'single_elim' ? tx.quizRecommended : undefined
                  }
                  desc={
                    f === 'single_elim'
                      ? tx.quizFmtSingleDesc
                      : f === 'double_elim'
                        ? tx.quizFmtDoubleDesc
                        : f === 'swiss'
                          ? tx.quizFmtSwissDesc
                          : f === 'round_robin'
                            ? tx.quizFmtRoundRobinDesc
                            : tx.quizFmtShowmatchDesc
                  }
                />
              ))}
            </div>
          </QuestionShell>
        )}

        {current === 'teams' && (
          <QuestionShell
            title={tx.quizQTeams}
            hint={tx.quizQTeamsHint}
            stepLabel={format(tx.quizStepOf, {
              current: progressIdx + 1,
              total: progressSteps.length,
            })}
          >
            <div className="flex flex-wrap justify-center gap-3">
              {validCountsFor(config.formatType).map((n) => (
                <BigChip
                  key={n}
                  selected={config.teamCount === n}
                  recommended={n === 8 ? tx.quizRecommended : undefined}
                  onClick={() =>
                    pickAndAdvance((c) => ({ ...c, teamCount: n }))
                  }
                >
                  {n}
                </BigChip>
              ))}
            </div>
          </QuestionShell>
        )}

        {current === 'bestof' && (
          <QuestionShell
            title={tx.quizQBestOf}
            hint={tx.quizQBestOfHint}
            stepLabel={format(tx.quizStepOf, {
              current: progressIdx + 1,
              total: progressSteps.length,
            })}
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {BEST_OF_OPTIONS.map((bo) => (
                <ChoiceCard
                  key={bo}
                  selected={config.bestOf === bo}
                  recommended={bo === 3 ? tx.quizRecommended : undefined}
                  onClick={() => pickAndAdvance((c) => ({ ...c, bestOf: bo }))}
                  title={`BO${bo}`}
                  desc={
                    bo === 1
                      ? tx.quizBoDescOne
                      : bo === 3
                        ? tx.quizBoDescThree
                        : bo === 5
                          ? tx.quizBoDescFive
                          : tx.quizBoDescSeven
                  }
                />
              ))}
            </div>
          </QuestionShell>
        )}

        {current === 'maps' && (
          <QuestionShell
            title={tx.quizQMaps}
            hint={tx.quizQMapsHint}
            stepLabel={format(tx.quizStepOf, {
              current: progressIdx + 1,
              total: progressSteps.length,
            })}
          >
            <div className="flex flex-wrap justify-center gap-3">
              {mapOptions.map((n) => (
                <BigChip
                  key={n}
                  selected={config.mapPoolSize === n}
                  recommended={n === 7 ? tx.quizRecommended : undefined}
                  onClick={() =>
                    pickAndAdvance((c) => ({ ...c, mapPoolSize: n }))
                  }
                >
                  {n}
                </BigChip>
              ))}
            </div>
          </QuestionShell>
        )}

        {current === 'swiss' && (
          <QuestionShell
            title={tx.quizQSwiss}
            hint={tx.quizQSwissHint}
            stepLabel={format(tx.quizStepOf, {
              current: progressIdx + 1,
              total: progressSteps.length,
            })}
          >
            <div className="flex flex-wrap justify-center gap-3">
              {SWISS_ROUND_OPTIONS.map((n) => (
                <BigChip
                  key={n}
                  selected={config.swissRounds === n}
                  recommended={n === 5 ? tx.quizRecommended : undefined}
                  onClick={() =>
                    pickAndAdvance((c) => ({ ...c, swissRounds: n }))
                  }
                >
                  {n}
                </BigChip>
              ))}
            </div>
          </QuestionShell>
        )}

        {current === 'reset' && (
          <QuestionShell
            title={tx.quizQReset}
            hint={tx.quizQResetHint}
            stepLabel={format(tx.quizStepOf, {
              current: progressIdx + 1,
              total: progressSteps.length,
            })}
          >
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              <ChoiceCard
                selected={config.grandFinalReset}
                onClick={() =>
                  pickAndAdvance((c) => ({ ...c, grandFinalReset: true }))
                }
                icon="♻️"
                title={tx.quizResetYes}
                desc=""
              />
              <ChoiceCard
                selected={!config.grandFinalReset}
                onClick={() =>
                  pickAndAdvance((c) => ({ ...c, grandFinalReset: false }))
                }
                icon="🏁"
                title={tx.quizResetNo}
                desc=""
                recommended={tx.quizRecommended}
              />
            </div>
          </QuestionShell>
        )}

        {current === 'recap' && (
          <div className="text-center max-w-xl mx-auto">
            <div className="text-5xl mb-3">✨</div>
            <h2 className="text-2xl font-black text-white">
              {tx.quizRecapTitle}
            </h2>
            <p className="mt-2 text-neutral-400">{tx.quizRecapSubtitle}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-left">
              <RecapRow
                label={tx.quizRecapFormat}
                value={FORMAT_LABELS[config.formatType]}
              />
              <RecapRow
                label={tx.quizRecapTeams}
                value={String(config.teamCount)}
              />
              <RecapRow
                label={tx.quizRecapBestOf}
                value={`BO${config.bestOf}`}
              />
              <RecapRow
                label={tx.quizRecapMaps}
                value={format(tx.mapPoolValue, { count: config.mapPoolSize })}
              />
              {config.formatType === 'swiss' && (
                <RecapRow
                  label={tx.quizRecapRounds}
                  value={format(tx.quizRoundsUnit, {
                    count: config.swissRounds,
                  })}
                />
              )}
              {config.formatType === 'double_elim' && (
                <RecapRow
                  label={tx.quizRecapReset}
                  value={config.grandFinalReset ? tx.quizYes : tx.quizNo}
                />
              )}
            </div>
            <button
              onClick={handleLaunch}
              className="mt-8 px-10 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-lg font-black shadow-xl transition-all hover:scale-[1.02]"
            >
              🎲 {tx.quizLaunch}
            </button>
          </div>
        )}
      </div>

      {/* Footer nav */}
      {!isFirst && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/5">
          <button
            onClick={goBack}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium text-neutral-300 transition-colors"
          >
            ← {tx.quizBack}
          </button>
          {!isLast && (
            <button
              onClick={goNext}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium text-white transition-colors"
            >
              {tx.quizNext} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ atoms */

function QuestionShell({
  title,
  hint,
  stepLabel,
  children,
}: {
  title: string;
  hint: string;
  stepLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-purple-200/70">
          {stepLabel}
        </p>
        <h2 className="mt-1 text-2xl font-black text-white">{title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function RecommendedBadge({ label }: { label: string }) {
  return (
    <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-amber-500 text-[10px] font-bold text-neutral-950 shadow">
      ★ {label}
    </span>
  );
}

function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  desc,
  recommended,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: string;
  title: string;
  desc: string;
  recommended?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left rounded-xl border p-4 transition-all hover:scale-[1.02] ${
        selected
          ? 'border-purple-500 bg-purple-600/15 ring-1 ring-purple-500/40'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      {recommended && <RecommendedBadge label={recommended} />}
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <div className="font-bold text-white">{title}</div>
      {desc && <div className="text-xs text-neutral-400 mt-1">{desc}</div>}
    </button>
  );
}

function BigChip({
  selected,
  onClick,
  children,
  recommended,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  recommended?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative min-w-[4.5rem] h-16 rounded-xl border text-2xl font-black transition-all hover:scale-105 ${
        selected
          ? 'border-purple-500 bg-purple-600/20 text-white ring-1 ring-purple-500/40'
          : 'border-white/10 bg-white/[0.03] text-neutral-200 hover:bg-white/[0.06]'
      }`}
    >
      {recommended && <RecommendedBadge label={recommended} />}
      {children}
    </button>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="text-sm font-semibold text-white mt-0.5">{value}</div>
    </div>
  );
}
