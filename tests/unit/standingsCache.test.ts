import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/supabase', () => ({ supabaseAdmin: {} }));

import {
  getCachedStandings,
  setCachedStandings,
  invalidateStandingsCache,
  invalidateAllStandingsCache,
} from '../../utils/stages/standingsCache';

const fakeStandings = [
  { teamId: 'a', rank: 1 },
  { teamId: 'b', rank: 2 },
] as any;

beforeEach(() => {
  invalidateAllStandingsCache();
});

afterEach(() => {
  vi.useRealTimers();
  invalidateAllStandingsCache();
});

describe('standingsCache', () => {
  it('returns null when nothing is cached', () => {
    expect(getCachedStandings('stage-1')).toBeNull();
  });

  it('returns cached standings within the TTL', () => {
    setCachedStandings('stage-1', fakeStandings);
    expect(getCachedStandings('stage-1')).toEqual(fakeStandings);
  });

  it('isolates entries by stageId', () => {
    setCachedStandings('stage-1', fakeStandings);
    expect(getCachedStandings('stage-2')).toBeNull();
  });

  it('expires entries past the 5-minute TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

    setCachedStandings('stage-1', fakeStandings);

    // 5 min 1 sec later
    vi.setSystemTime(new Date('2026-04-01T12:05:01Z'));
    expect(getCachedStandings('stage-1')).toBeNull();
  });

  it('keeps entries just under the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

    setCachedStandings('stage-1', fakeStandings);

    vi.setSystemTime(new Date('2026-04-01T12:04:59Z'));
    expect(getCachedStandings('stage-1')).toEqual(fakeStandings);
  });

  it('overwrites a previous entry with the latest standings', () => {
    setCachedStandings('stage-1', fakeStandings);
    const newer = [{ teamId: 'c', rank: 1 }] as any;
    setCachedStandings('stage-1', newer);
    expect(getCachedStandings('stage-1')).toEqual(newer);
  });

  it('invalidateStandingsCache clears only the targeted entry', () => {
    setCachedStandings('stage-1', fakeStandings);
    setCachedStandings('stage-2', fakeStandings);

    invalidateStandingsCache('stage-1');

    expect(getCachedStandings('stage-1')).toBeNull();
    expect(getCachedStandings('stage-2')).toEqual(fakeStandings);
  });

  it('invalidateAllStandingsCache clears every entry', () => {
    setCachedStandings('stage-1', fakeStandings);
    setCachedStandings('stage-2', fakeStandings);

    invalidateAllStandingsCache();

    expect(getCachedStandings('stage-1')).toBeNull();
    expect(getCachedStandings('stage-2')).toBeNull();
  });

  it('expired entry triggers eviction (subsequent get does not resurrect it)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

    setCachedStandings('stage-1', fakeStandings);
    vi.setSystemTime(new Date('2026-04-01T12:10:00Z'));

    expect(getCachedStandings('stage-1')).toBeNull();
    // Even rolling time backwards should not resurrect the entry
    vi.setSystemTime(new Date('2026-04-01T12:00:30Z'));
    expect(getCachedStandings('stage-1')).toBeNull();
  });
});
