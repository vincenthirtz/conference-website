// components/admin/draft/DraftBoard.tsx
// Visual grid of every step in the draft flow. Each cell shows :
//   - the step number + phase label
//   - the side (team1/team2) with a Blue/Red/Radiant/Dire color cue
//   - the picked/banned hero icon + name once committed
//   - "AUTO" tag when the engine auto-picked
//   - a "current step" pulsing border so the operator knows what's next

import type {
  DraftState,
  MatchDraftStep,
  GameHero,
} from '@/types/draft';

type Props = {
  state: DraftState;
};

function heroFor(
  step: MatchDraftStep,
  state: DraftState
): GameHero | null {
  if (!step.hero_id) return null;
  return (
    state.bannedHeroes.find((h) => h.id === step.hero_id) ??
    state.team1Picks.find((h) => h.id === step.hero_id) ??
    state.team2Picks.find((h) => h.id === step.hero_id) ??
    null
  );
}

function sideTone(
  step: MatchDraftStep,
  state: DraftState
): { label: string; cls: string } {
  const side =
    step.side === 'team1' ? state.draft.team1_side : state.draft.team2_side;
  switch (side) {
    case 'blue':
      return { label: 'Blue', cls: 'border-sky-500/60 bg-sky-500/10' };
    case 'red':
      return { label: 'Red', cls: 'border-rose-500/60 bg-rose-500/10' };
    case 'radiant':
      return {
        label: 'Radiant',
        cls: 'border-emerald-500/60 bg-emerald-500/10',
      };
    case 'dire':
      return {
        label: 'Dire',
        cls: 'border-orange-500/60 bg-orange-500/10',
      };
    default:
      return {
        label: step.side === 'team1' ? 'Team 1' : 'Team 2',
        cls: 'border-neutral-600 bg-neutral-800/40',
      };
  }
}

export function DraftBoard({ state }: Props) {
  const currentStepNumber = state.draft.current_step + 1;
  const isCompleted = state.draft.status === 'completed';

  // Group steps by phase for a more legible layout.
  const phases = Array.from(
    new Set(state.flow.steps.map((s) => s.phase))
  );

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const phaseSteps = state.flow.steps.filter((s) => s.phase === phase);
        return (
          <div key={phase}>
            <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
              {phase.replace('_', ' ')}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {phaseSteps.map((flowStep) => {
                const row = state.steps.find(
                  (s) => s.step_number === flowStep.step_number
                );
                const hero = row ? heroFor(row, state) : null;
                const tone = row
                  ? sideTone(row, state)
                  : { label: '—', cls: 'border-neutral-700' };
                const isCurrent =
                  !isCompleted &&
                  flowStep.step_number === currentStepNumber;
                const isBan = flowStep.action === 'ban';
                return (
                  <div
                    key={flowStep.step_number}
                    className={`relative flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${tone.cls} ${
                      isCurrent
                        ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-neutral-950'
                        : ''
                    } ${isBan ? 'opacity-90' : ''}`}
                  >
                    <div className="w-6 text-center text-xs font-bold text-neutral-400">
                      {flowStep.step_number}
                    </div>
                    {hero ? (
                      <>
                        {hero.icon_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hero.icon_url}
                            alt=""
                            className={`h-10 w-10 rounded-md object-cover ${
                              isBan ? 'grayscale' : ''
                            }`}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-neutral-700" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-white">
                            {hero.name}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {isBan ? 'BAN' : 'PICK'} · {tone.label}
                            {row?.auto_picked ? ' · AUTO' : ''}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-1 items-center gap-3">
                        <div className="h-10 w-10 rounded-md border border-dashed border-neutral-600" />
                        <div>
                          <div className="font-medium text-neutral-400">
                            Awaiting {isBan ? 'ban' : 'pick'}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {tone.label}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
