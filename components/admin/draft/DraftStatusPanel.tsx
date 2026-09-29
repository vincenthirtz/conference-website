// components/admin/draft/DraftStatusPanel.tsx
// Header row for the captain page : status pill, progress count, and the
// admin action buttons (Init, Start, Auto-pick now). Buttons are wired by
// the parent page — this component is purely presentation + dispatch.

import type { DraftState } from '@/types/draft';
import { DraftTimer } from './DraftTimer';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

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

const STATUS_TONE: Record<string, ChipTone> = {
  pending: 'neutral',
  in_progress: 'live',
  completed: 'ok',
  cancelled: 'err',
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
      <div className="flex items-center justify-between rounded-[var(--r-card,14px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
        <div>
          <div className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
            No draft yet
          </div>
          <p className="mt-1 text-sm text-[var(--t3,#a39ba6)]">
            Initialise the draft to seed the ban/pick steps from the game
            registry.
          </p>
        </div>
        {onInit ? (
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => void onInit()}
            disabled={busy}
          >
            {busy ? 'Initialising…' : 'Initialise draft'}
          </AdminButton>
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
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={STATUS_TONE[draft.status] ?? 'neutral'}>
          {STATUS_LABEL[draft.status] ?? draft.status}
        </Chip>
        <div className="text-sm text-[var(--t2,#c7bfca)]">
          Game {draft.game_index} · {draft.game.toUpperCase()} · {done}/{total}{' '}
          steps
          {draft.fearless ? (
            <span className="ml-2">
              <Chip tone="warn">fearless</Chip>
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <DraftTimer deadlineAt={currentStep?.deadline_at ?? null} />
        {canStart && onStart ? (
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => void onStart()}
            disabled={busy}
          >
            Start draft
          </AdminButton>
        ) : null}
        {draft.status === 'in_progress' && onAutoPick ? (
          <AdminButton
            size="sm"
            onClick={() => void onAutoPick()}
            disabled={busy}
          >
            Auto-pick now
          </AdminButton>
        ) : null}
      </div>
    </div>
  );
}
