import { describe, it, expect, vi, afterEach } from 'vitest';
import { getEventStatus } from '../../utils/status';
import { ConferenceStatus } from '../../types/types';

describe('getEventStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The function splits on '-' then parses each piece via new Date().
  // Dates in this project use French localized strings like '15 mars 2026'.
  // A range looks like '15 mars 2026-16 mars 2026'.

  it('returns ONGOING when event date is today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15'));

    expect(getEventStatus('15 March 2026')).toBe(ConferenceStatus.ONGOING);
  });

  it('returns ONGOING when today is one of the event dates in a range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16'));

    expect(getEventStatus('15 March 2026-16 March 2026')).toBe(
      ConferenceStatus.ONGOING
    );
  });

  it('returns UPCOMING when event date is in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01'));

    expect(getEventStatus('15 March 2026')).toBe(ConferenceStatus.UPCOMING);
  });

  it('returns UPCOMING when any event date is in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14'));

    expect(getEventStatus('10 March 2026-15 March 2026')).toBe(
      ConferenceStatus.UPCOMING
    );
  });

  it('returns ENDED when all event dates are in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01'));

    expect(getEventStatus('15 March 2026')).toBe(ConferenceStatus.ENDED);
  });

  it('returns ENDED when all dates in a range are past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01'));

    expect(getEventStatus('10 March 2026-15 March 2026')).toBe(
      ConferenceStatus.ENDED
    );
  });
});
