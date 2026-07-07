// components/draft/SpectatorView.tsx
// Stream-friendly spectator UI for a live MOBA draft (Lot 5).
// Layout : 2 columns of 5 picks (splash arts), center column with the
// timer + current step indicator, full-width bans row at the bottom.
//
// Design notes :
//   - Dark background (transparent-friendly for OBS chromakey).
//   - 16:9 oriented but reflows down to 1280px wide.
//   - Reuses DraftTimer (admin captain UI, Lot 4) for the countdown.

import type { DraftState, GameHero, MatchDraftStep } from '@/types/draft';
import { DraftTimer } from '@/components/admin/draft/DraftTimer';
import { useT, format } from '@/lib/i18n/useT';

type DraftSpectatorDict = ReturnType<typeof useT<'draftSpectator'>>;

type Props = {
  state: DraftState | null;
  /** Override the title (e.g. "Phoenix vs. Dragons · BO3 game 2"). */
  title?: string;
};

const SIDE_COLOR: Record<string, string> = {
  blue: 'from-sky-600/40 via-sky-700/20 to-transparent',
  red: 'from-rose-600/40 via-rose-700/20 to-transparent',
  radiant: 'from-emerald-600/40 via-emerald-700/20 to-transparent',
  dire: 'from-orange-600/40 via-orange-700/20 to-transparent',
};

const getSideLabel = (t: DraftSpectatorDict): Record<string, string> => ({
  blue: t.sideBlue,
  red: t.sideRed,
  radiant: t.sideRadiant,
  dire: t.sideDire,
});

function heroFor(
  step: MatchDraftStep,
  state: DraftState
): GameHero | null {
  if (!step.hero_id) return null;
  return (
    state.team1Picks.find((h) => h.id === step.hero_id) ??
    state.team2Picks.find((h) => h.id === step.hero_id) ??
    state.bannedHeroes.find((h) => h.id === step.hero_id) ??
    null
  );
}

function PickSlot({
  step,
  hero,
  isCurrent,
  side,
}: {
  step: MatchDraftStep;
  hero: GameHero | null;
  isCurrent: boolean;
  side: 'left' | 'right';
}) {
  const t = useT('draftSpectator');
  return (
    <div
      className={`relative h-24 overflow-hidden rounded-xl border ${
        isCurrent
          ? 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
          : 'border-neutral-800/70'
      } bg-neutral-950/80`}
    >
      {hero?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hero.image_url}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${
            side === 'right' ? '-scale-x-100' : ''
          }`}
          loading="lazy"
        />
      ) : null}
      <div
        className={`absolute inset-0 bg-gradient-to-${
          side === 'left' ? 'r' : 'l'
        } from-neutral-950 via-neutral-950/40 to-transparent`}
      />
      <div
        className={`relative flex h-full items-center justify-between gap-3 p-3 ${
          side === 'right' ? 'flex-row-reverse text-right' : ''
        }`}
      >
        <div className={side === 'right' ? 'text-right' : ''}>
          <div className="text-[10px] uppercase tracking-widest text-neutral-400">
            {format(t.pickLabel, { num: step.step_number })}
            {step.auto_picked ? t.autoSuffix : ''}
          </div>
          <div className="text-xl font-bold leading-tight text-white">
            {hero?.name ?? '—'}
          </div>
          {hero?.title ? (
            <div className="text-xs italic text-neutral-300">
              {hero.title}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BanSlot({
  step,
  hero,
  isCurrent,
}: {
  step: MatchDraftStep;
  hero: GameHero | null;
  isCurrent: boolean;
}) {
  const t = useT('draftSpectator');
  return (
    <div
      className={`relative h-12 w-12 overflow-hidden rounded border ${
        isCurrent ? 'border-amber-400' : 'border-neutral-800'
      } bg-neutral-950`}
      title={
        hero
          ? format(t.banned, { name: hero.name })
          : format(t.awaitingBan, { num: step.step_number })
      }
    >
      {hero?.icon_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hero.icon_url}
          alt={hero.name}
          className="h-full w-full object-cover grayscale"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-600">
          #{step.step_number}
        </div>
      )}
      {hero ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-0.5 w-full rotate-[-20deg] bg-rose-500/80" />
        </div>
      ) : null}
    </div>
  );
}

function TeamColumn({
  state,
  team,
  side,
}: {
  state: DraftState;
  team: 'team1' | 'team2';
  side: 'left' | 'right';
}) {
  const t = useT('draftSpectator');
  const SIDE_LABEL = getSideLabel(t);
  const sideKey =
    team === 'team1' ? state.draft.team1_side : state.draft.team2_side;
  const gradient = sideKey ? SIDE_COLOR[sideKey] : 'from-neutral-800/60 via-transparent to-transparent';
  const label = sideKey ? SIDE_LABEL[sideKey] : team.toUpperCase();
  const picks = state.steps.filter(
    (s) => s.action === 'pick' && s.side === team
  );
  const currentStepNumber = state.draft.current_step + 1;

  return (
    <div
      className={`flex h-full flex-col gap-2 rounded-2xl bg-gradient-to-b ${gradient} p-3`}
    >
      <div
        className={`text-xs font-bold uppercase tracking-widest text-white ${
          side === 'right' ? 'text-right' : ''
        }`}
      >
        {label}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {picks.map((step) => (
          <PickSlot
            key={step.id}
            step={step}
            hero={heroFor(step, state)}
            isCurrent={step.step_number === currentStepNumber}
            side={side}
          />
        ))}
      </div>
    </div>
  );
}

function BansRow({ state }: { state: DraftState }) {
  const t = useT('draftSpectator');
  const bans = state.steps.filter((s) => s.action === 'ban');
  const currentStepNumber = state.draft.current_step + 1;
  return (
    <div className="rounded-2xl bg-neutral-950/60 p-3">
      <div className="mb-2 text-xs uppercase tracking-widest text-neutral-500">
        {t.bans}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bans.map((step) => (
          <BanSlot
            key={step.id}
            step={step}
            hero={heroFor(step, state)}
            isCurrent={step.step_number === currentStepNumber}
          />
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: DraftState }) {
  const map: Record<string, string> = {
    pending: 'bg-neutral-700 text-neutral-200',
    in_progress: 'bg-emerald-700 text-white',
    completed: 'bg-sky-700 text-white',
    cancelled: 'bg-red-700 text-white',
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${
        map[state.draft.status] ?? 'bg-neutral-700 text-white'
      }`}
    >
      {state.draft.status.replace('_', ' ')}
    </span>
  );
}

export function SpectatorView({ state, title }: Props) {
  const t = useT('draftSpectator');
  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-500">
        {t.draftNotStarted}
      </div>
    );
  }

  const currentStep = state.steps.find(
    (s) => s.step_number === state.draft.current_step + 1
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 p-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">
              {state.draft.game.toUpperCase()} · {t.gameShort}{' '}
              {state.draft.game_index}
              {state.draft.fearless ? t.fearlessSuffix : ''}
            </div>
            <h1 className="text-xl font-bold text-white">
              {title ?? t.draftTitle}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge state={state} />
            <DraftTimer
              deadlineAt={currentStep?.deadline_at ?? null}
              hideWhenIdle={false}
            />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
          <TeamColumn state={state} team="team1" side="left" />
          <div className="hidden items-center justify-center md:flex">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-6 text-center">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                {t.step}
              </div>
              <div className="text-3xl font-bold text-white">
                {Math.min(state.draft.current_step + 1, state.flow.steps.length)}
                <span className="text-neutral-500"> / {state.flow.steps.length}</span>
              </div>
              {currentStep ? (
                <div className="mt-1 text-xs text-neutral-400">
                  {currentStep.action.toUpperCase()} · {currentStep.phase.replace('_', ' ')}
                </div>
              ) : null}
            </div>
          </div>
          <TeamColumn state={state} team="team2" side="right" />
        </div>

        <BansRow state={state} />
      </div>
    </div>
  );
}
