// components/admin/draft/DraftTimer.tsx
// Big-and-loud countdown for the captain UI (Lot 4).
// Color cue : neutral above 10s, amber 4-10s, red below 4s, "EXPIRED" past 0.

import { useDraftTimer } from '@/hooks/useDraftTimer';

type Props = {
  deadlineAt: string | null;
  /** Hide entirely when no deadline (e.g. draft pending). */
  hideWhenIdle?: boolean;
};

export function DraftTimer({ deadlineAt, hideWhenIdle = true }: Props) {
  const { secondsLeft, expired } = useDraftTimer(deadlineAt);

  if (!deadlineAt && hideWhenIdle) return null;

  let toneClass = 'bg-neutral-800 text-neutral-300';
  let label = '—';
  if (expired) {
    toneClass = 'bg-red-700 text-white animate-pulse';
    label = 'AUTO-PICK';
  } else if (deadlineAt) {
    if (secondsLeft <= 3) toneClass = 'bg-red-600 text-white';
    else if (secondsLeft <= 10) toneClass = 'bg-amber-600 text-white';
    else toneClass = 'bg-emerald-700 text-white';
    label = `${secondsLeft}s`;
  }

  return (
    <div
      className={`rounded-2xl px-6 py-4 text-3xl font-bold tracking-wider shadow-inner ${toneClass}`}
      aria-live="polite"
    >
      {label}
    </div>
  );
}
