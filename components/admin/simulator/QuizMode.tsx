import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { FormatType } from '@/types/admin';
import type { SimConfig } from '@/utils/simulatorSerialization';
import { FORMAT_LABELS } from '@/utils/simulatorSerialization';
import { FAKE_MAPS } from '@/utils/simulatorFakeData';
import { SEED_COLORS } from './SimMatchCard';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';

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
  const tx = useAdminT(nsAdminTournamentSimulator);
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
      <div className="flex min-h-[480px] flex-col items-center justify-center rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-16">
        <div className="text-7xl animate-bounce">🎲</div>
        <p className="mt-6 text-lg font-semibold text-[var(--t2,#c7bfca)] animate-pulse">
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
      <div className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
        {/* Champion hero with WebGL celebration backdrop */}
        <div className="relative min-h-[380px] flex flex-col items-center justify-center px-6 py-12 text-center">
          <CelebrationCanvas />
          <div className="relative z-10">
            <p className="font-[family-name:var(--fd)] text-xs font-bold uppercase tracking-[0.28em] text-[#ffd9a3] [font-stretch:75%]">
              {tx.quizChampionLabel}
            </p>
            <div className="mt-3 text-6xl drop-shadow-[0_4px_24px_rgba(250,204,21,0.4)]">
              🏆
            </div>
            <h2 className="mt-4 text-4xl font-black text-[var(--t1,#f4edf7)] drop-shadow">
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
              <p className="mb-2 text-center font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
                {tx.quizPodiumLabel}
              </p>
              <div className="flex items-end justify-center gap-3">
                {[1, 0, 2].map((rank) => {
                  const team = o.podium[rank];
                  if (!team) return null;
                  const heights = ['h-20', 'h-28', 'h-14'];
                  const medals = ['🥈', '🥇', '🥉'];
                  return (
                    <div key={rank} className="flex flex-col items-center w-28">
                      <div className="text-2xl">{medals[rank]}</div>
                      <div className="text-sm font-semibold text-[var(--t1,#f4edf7)] truncate max-w-[7rem] text-center">
                        {team.name}
                      </div>
                      <div
                        className={`mt-2 w-full ${heights[rank]} rounded-t-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] ${
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
                className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-4 text-center"
              >
                <div className="text-2xl font-black text-[var(--t1,#f4edf7)]">
                  {s.value}
                </div>
                <div className="mt-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <AdminButton
              variant="primary"
              onClick={handleReplay}
              title={tx.quizReplayTitle}
            >
              🎲 {tx.quizReplay}
            </AdminButton>
            <AdminButton
              variant="secondary"
              onClick={onOpenInEditor}
              title={tx.quizOpenEditorTitle}
            >
              {tx.quizOpenEditor}
            </AdminButton>
            <AdminButton onClick={handleRestart}>{tx.quizRestart}</AdminButton>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- wizard */
  const progressSteps = steps.slice(1); // exclude intro from the dot bar
  const progressIdx = clampedIdx - 1;

  return (
    <div className="flex min-h-[480px] flex-col rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 sm:p-10">
      {/* Progress dots */}
      {!isFirst && (
        <div className="flex items-center justify-center gap-2 mb-8">
          {progressSteps.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i === progressIdx
                  ? 'w-8 bg-[var(--or,#b467d1)]'
                  : i < progressIdx
                    ? 'w-4 bg-[rgba(180,103,209,.5)]'
                    : 'w-4 bg-[var(--s3,#2f2732)]'
              }`}
            />
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center">
        {current === 'intro' && (
          <div className="text-center max-w-xl mx-auto">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-3xl font-black text-[var(--t1,#f4edf7)]">
              {tx.quizIntroTitle}
            </h2>
            <p className="mt-3 text-neutral-400">{tx.quizIntroSubtitle}</p>
            <AdminButton variant="primary" onClick={goNext} className="mt-8">
              {tx.quizStart} →
            </AdminButton>
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
            <h2 className="text-2xl font-black text-[var(--t1,#f4edf7)]">
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
            <AdminButton
              variant="primary"
              onClick={handleLaunch}
              className="mt-8"
            >
              🎲 {tx.quizLaunch}
            </AdminButton>
          </div>
        )}
      </div>

      {/* Footer nav */}
      {!isFirst && (
        <div className="mt-8 flex items-center justify-between border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
          <AdminButton size="sm" onClick={goBack}>
            ← {tx.quizBack}
          </AdminButton>
          {!isLast && (
            <AdminButton variant="secondary" size="sm" onClick={goNext}>
              {tx.quizNext} →
            </AdminButton>
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
        <p className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
          {stepLabel}
        </p>
        <h2 className="mt-1 text-2xl font-black text-[var(--t1,#f4edf7)]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function RecommendedBadge({ label }: { label: string }) {
  return (
    <span className="absolute -right-2 -top-2 rounded-[3px] border border-[rgba(245,165,36,.38)] bg-[#3a2a12] px-2 py-0.5 text-[10px] font-bold uppercase text-[#ffd9a3]">
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
      className={`relative rounded-[var(--r-ctrl,4px)] border p-4 text-left transition-colors ${
        selected
          ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.14)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] hover:border-[var(--t4,#807984)]'
      }`}
    >
      {recommended && <RecommendedBadge label={recommended} />}
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <div className="font-bold text-[var(--t1,#f4edf7)]">{title}</div>
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
      className={`relative h-16 min-w-[4.5rem] rounded-[var(--r-ctrl,4px)] border font-[family-name:var(--fd)] text-2xl font-black transition-colors ${
        selected
          ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.14)] text-[var(--t1,#f4edf7)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)]'
      }`}
    >
      {recommended && <RecommendedBadge label={recommended} />}
      {children}
    </button>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3">
      <div className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {label}
      </div>
      <div className="text-sm font-semibold text-[var(--t1,#f4edf7)] mt-0.5">
        {value}
      </div>
    </div>
  );
}
