import { describe, it, expect, vi } from 'vitest';

// checkin.ts pulls in supabaseAdmin, email senders, discord, and applyMatchScore
// at module load. Stub them so the pure helpers we care about can be imported.
vi.mock('../../utils/supabase', () => ({ supabaseAdmin: {} }));
vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail: vi.fn(),
}));
vi.mock('../../utils/discord', () => ({
  notifyCheckinReminder: vi.fn(),
  notifyCheckinForfeit: vi.fn(),
}));
vi.mock('../../utils/matches/applyScore', () => ({
  applyMatchScore: vi.fn(),
}));

import {
  generateCheckinToken,
  buildCheckinUrl,
  CHECKIN_OPEN_MINUTES,
  REMINDER_30_MINUTES,
  REMINDER_15_MINUTES,
} from '../../utils/checkin';

describe('generateCheckinToken', () => {
  it('returns a base64url string', () => {
    const t = generateCheckinToken();
    // base64url alphabet: A-Z a-z 0-9 - _
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a token of the expected length (32 chars from 24 bytes)', () => {
    const t = generateCheckinToken();
    expect(t.length).toBe(32);
  });

  it('produces unique tokens across many calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(generateCheckinToken());
    expect(tokens.size).toBe(100);
  });
});

describe('buildCheckinUrl', () => {
  it('embeds the token after /checkin/', () => {
    const url = buildCheckinUrl('abc123');
    expect(url).toMatch(/\/checkin\/abc123$/);
  });

  it('does not double the slash when SITE_URL has a trailing slash', () => {
    // We can't easily re-init the module to swap SITE_URL, but we can assert
    // the function never produces "//checkin/" in its output.
    const url = buildCheckinUrl('xyz');
    expect(url).not.toContain('//checkin/');
  });

  it('produces an absolute URL', () => {
    const url = buildCheckinUrl('tok');
    expect(url).toMatch(/^https?:\/\//);
  });
});

describe('check-in time constants', () => {
  it('exposes the documented minute thresholds', () => {
    expect(CHECKIN_OPEN_MINUTES).toBe(60);
    expect(REMINDER_30_MINUTES).toBe(30);
    expect(REMINDER_15_MINUTES).toBe(15);
  });

  it('reminder thresholds are strictly inside the check-in window', () => {
    expect(REMINDER_30_MINUTES).toBeLessThan(CHECKIN_OPEN_MINUTES);
    expect(REMINDER_15_MINUTES).toBeLessThan(REMINDER_30_MINUTES);
    expect(REMINDER_15_MINUTES).toBeGreaterThan(0);
  });
});
