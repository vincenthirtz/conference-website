// components/admin/draft/DraftStatusPanel.tsx
// Header row for the captain page : status pill, progress count, and the
// admin action buttons (Init, Start, Auto-pick now). Buttons are wired by
// the parent page — this component is purely presentation + dispatch.

import type { DraftState } from '@/types/draft';
import { DraftTimer } from './DraftTimer';

type Props = {
  state: DraftState | null;
  busy?: boolean;
  onInit?: () => Promise<void> | void;
  onStart?: () => Promise<void> | void;
  onAutoPick?: () => Promise<void> | void;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-neutral-700 text-neutral-200',
  in_progress: 'bg-emerald-700 text-white',
  completed: 'bg-sky-700 text-white',
  cancelled: 'bg-red-700 text-white',
};

export function DraftStatusPanel({
  state,
  busy,
  onInit,
  onStart,
  onAutoPick,
}: Props) {
  if (!state) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/40 p-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            No draft yet
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Initialise the draft to seed the ban/pick steps from the game
            registry.
          </p>
        </div>
        {onInit ? (
          <button
            type="button"
            onClick={() => void onInit()}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Initialising…' : 'Initialise draft'}
          </button>
        ) : null}
      </div>
    );
  }

  const { draft, flow } = state;
  const total = flow.steps.length;
  const done = draft.current_step;
  const canStart =
    draft.status === 'pending' &&
    draft.current_step === 0 &&
    !!draft.team1_side &&
    !!draft.team2_side;
  const currentStep = state.steps.find(
    (s) => s.step_number === draft.current_step + 1
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-700/50 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            STATUS_TONE[draft.status] ?? 'bg-neutral-700 text-white'
          }`}
        >
          {STATUS_LABEL[draft.status] ?? draft.status}
        </span>
        <div className="text-sm text-neutral-300">
          Game {draft.game_index} · {draft.game.toUpperCase()} · {done}/{total}{' '}
          steps
          {draft.fearless ? (
            <span className="ml-2 rounded bg-amber-700/30 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
              fearless
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <DraftTimer deadlineAt={currentStep?.deadline_at ?? null} />
        {canStart && onStart ? (
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start draft
          </button>
        ) : null}
        {draft.status === 'in_progress' && onAutoPick ? (
          <button
            type="button"
            onClick={() => void onAutoPick()}
            disabled={busy}
            className="rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Auto-pick now
          </button>
        ) : null}
      </div>
    </div>
  );
}
