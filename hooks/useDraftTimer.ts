// hooks/useDraftTimer.ts
// Lightweight countdown hook for the captain UI (Lot 4). Re-renders once
// per second while a deadline is in the future, then settles on
// `expired=true` so the UI can swap to the "auto-pick imminent" copy.

import { useEffect, useState } from 'react';

export type DraftTimerState = {
  secondsLeft: number;
  expired: boolean;
};

export function computeDraftTimer(
  deadlineAt: string | null,
  nowMs: number
): DraftTimerState {
  if (!deadlineAt) {
    return { secondsLeft: 0, expired: false };
  }
  const deadlineMs = Date.parse(deadlineAt);
  if (Number.isNaN(deadlineMs)) {
    return { secondsLeft: 0, expired: false };
  }
  const diffMs = deadlineMs - nowMs;
  if (diffMs <= 0) {
    return { secondsLeft: 0, expired: true };
  }
  return { secondsLeft: Math.ceil(diffMs / 1000), expired: false };
}

export function useDraftTimer(deadlineAt: string | null): DraftTimerState {
  const [state, setState] = useState<DraftTimerState>(() =>
    computeDraftTimer(deadlineAt, Date.now())
  );

  useEffect(() => {
    setState(computeDraftTimer(deadlineAt, Date.now()));
    if (!deadlineAt) return;
    const interval = window.setInterval(() => {
      setState(computeDraftTimer(deadlineAt, Date.now()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [deadlineAt]);

  return state;
}
