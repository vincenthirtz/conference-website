import { describe, it, expect, vi } from 'vitest';
import {
  computeRequiredWins,
  hasTeamReachedRequiredWins,
  isSeriesFinished,
  getSeriesWinnerFromScores,
} from '../../utils/matches/computeRequiredWins';

describe('computeRequiredWins', () => {
  it.each([
    ['bo1', 1],
    ['bo3', 2],
    ['bo5', 3],
    ['bo7', 4],
    ['bo9', 5],
    ['bo2', 2],
    ['single_map', 1],
    ['map_decider', 1],
  ])('%s → %d', (format, expected) => {
    expect(computeRequiredWins(format)).toBe(expected);
  });

  it('returns 1 for null/undefined/unknown formats', () => {
    expect(computeRequiredWins(null)).toBe(1);
    expect(computeRequiredWins(undefined)).toBe(1);
    expect(computeRequiredWins('unknown')).toBe(1);
    expect(computeRequiredWins('')).toBe(1);
  });

  it('logs a warning for unknown string formats', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    computeRequiredWins('freeforall');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Format inconnu')
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('freeforall'));

    warnSpy.mockRestore();
  });

  it('does not warn for known formats', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    computeRequiredWins('bo3');
    computeRequiredWins('bo5');
    computeRequiredWins('single_map');
    computeRequiredWins(null);
    computeRequiredWins(undefined);

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('is case-insensitive', () => {
    expect(computeRequiredWins('BO3')).toBe(2);
    expect(computeRequiredWins('Bo5')).toBe(3);
  });
});

describe('hasTeamReachedRequiredWins', () => {
  it('returns true when team has enough wins', () => {
    expect(hasTeamReachedRequiredWins(2, 'bo3')).toBe(true);
    expect(hasTeamReachedRequiredWins(3, 'bo5')).toBe(true);
  });

  it('returns false when team has not enough wins', () => {
    expect(hasTeamReachedRequiredWins(1, 'bo3')).toBe(false);
    expect(hasTeamReachedRequiredWins(0, 'bo1')).toBe(false);
  });
});

describe('isSeriesFinished', () => {
  it('returns true when either team reached required wins', () => {
    expect(isSeriesFinished(2, 0, 'bo3')).toBe(true);
    expect(isSeriesFinished(0, 2, 'bo3')).toBe(true);
    expect(isSeriesFinished(1, 0, 'bo1')).toBe(true);
  });

  it('returns false when series is ongoing', () => {
    expect(isSeriesFinished(1, 1, 'bo3')).toBe(false);
    expect(isSeriesFinished(0, 0, 'bo5')).toBe(false);
  });
});

describe('getSeriesWinnerFromScores', () => {
  it('returns team1 when team1 wins', () => {
    expect(getSeriesWinnerFromScores(2, 1, 'bo3')).toBe('team1');
    expect(getSeriesWinnerFromScores(3, 0, 'bo5')).toBe('team1');
  });

  it('returns team2 when team2 wins', () => {
    expect(getSeriesWinnerFromScores(0, 2, 'bo3')).toBe('team2');
    expect(getSeriesWinnerFromScores(1, 3, 'bo5')).toBe('team2');
  });

  it('returns null when series is undecided', () => {
    expect(getSeriesWinnerFromScores(1, 1, 'bo3')).toBeNull();
    expect(getSeriesWinnerFromScores(0, 0, 'bo1')).toBeNull();
  });

  it('returns tie when both reach required wins with equal scores', () => {
    // Exotic case: both at 2 wins in bo3
    expect(getSeriesWinnerFromScores(2, 2, 'bo3')).toBe('tie');
  });
});
