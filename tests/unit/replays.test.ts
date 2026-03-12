import { describe, it, expect } from 'vitest';
import { replays } from '../../config/replays';

describe('replays config', () => {
  it('contains at least one replay', () => {
    expect(replays.length).toBeGreaterThan(0);
  });

  it('each replay has a title and youtubeId', () => {
    for (const replay of replays) {
      expect(replay.title.trim()).toBeTruthy();
      expect(replay.youtubeId.trim()).toBeTruthy();
    }
  });

  it('youtubeIds are valid format (11 chars, alphanumeric + -_)', () => {
    const youtubeIdPattern = /^[a-zA-Z0-9_-]{10,12}$/;
    for (const replay of replays) {
      expect(replay.youtubeId).toMatch(youtubeIdPattern);
    }
  });

  it('titles are unique', () => {
    const titles = replays.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('youtubeIds are unique', () => {
    const ids = replays.map((r) => r.youtubeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dates are provided and non-empty when present', () => {
    for (const replay of replays) {
      if (replay.date !== undefined) {
        expect(replay.date.trim()).toBeTruthy();
      }
    }
  });
});
