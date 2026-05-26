// Tests for the pure computeDraftTimer helper (the React hook itself is a
// thin wrapper around setInterval + computeDraftTimer; covering the helper
// covers the interesting edge cases without rigging up a React renderer).

import { describe, it, expect } from 'vitest';
import { computeDraftTimer } from '../../hooks/useDraftTimer';

const NOW = Date.parse('2026-05-26T12:00:00.000Z');

describe('computeDraftTimer', () => {
  it('returns 0/false when there is no deadline', () => {
    expect(computeDraftTimer(null, NOW)).toEqual({
      secondsLeft: 0,
      expired: false,
    });
  });

  it('returns 0/false when the deadline string is malformed', () => {
    expect(computeDraftTimer('not-a-date', NOW)).toEqual({
      secondsLeft: 0,
      expired: false,
    });
  });

  it('counts seconds left when the deadline is in the future', () => {
    const deadline = new Date(NOW + 15_400).toISOString();
    expect(computeDraftTimer(deadline, NOW)).toEqual({
      secondsLeft: 16,
      expired: false,
    });
  });

  it('rounds up partial seconds so 999ms still shows 1s', () => {
    const deadline = new Date(NOW + 999).toISOString();
    expect(computeDraftTimer(deadline, NOW)).toEqual({
      secondsLeft: 1,
      expired: false,
    });
  });

  it('flags expired exactly at the deadline', () => {
    const deadline = new Date(NOW).toISOString();
    expect(computeDraftTimer(deadline, NOW)).toEqual({
      secondsLeft: 0,
      expired: true,
    });
  });

  it('flags expired in the past', () => {
    const deadline = new Date(NOW - 5_000).toISOString();
    expect(computeDraftTimer(deadline, NOW)).toEqual({
      secondsLeft: 0,
      expired: true,
    });
  });
});
