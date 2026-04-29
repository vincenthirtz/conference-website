import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const {
  sendMatchCheckinEmail,
  notifyCheckinReminder,
  notifyCheckinForfeit,
  applyMatchScore,
} = vi.hoisted(() => ({
  sendMatchCheckinEmail: vi.fn(async () => ({ ok: true as const })),
  notifyCheckinReminder: vi.fn(async () => undefined),
  notifyCheckinForfeit: vi.fn(async () => undefined),
  applyMatchScore: vi.fn(async () => undefined),
}));

vi.mock('../../utils/email', () => ({ sendMatchCheckinEmail }));
vi.mock('../../utils/discord', () => ({
  notifyCheckinReminder,
  notifyCheckinForfeit,
}));
vi.mock('../../utils/matches/applyScore', () => ({ applyMatchScore }));

import {
  store,
  resetSupabaseMock,
  setAdminUser,
} from './__helpers__/supabaseMock';

import {
  generateCheckinToken,
  buildCheckinUrl,
  resolveCheckinToken,
  redeemCheckinToken,
  processMatchCheckin,
  listCheckinStatus,
} from '../../utils/checkin';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

type MatchSeed = {
  id: string;
  status?: string;
  is_bye?: boolean | null;
  scheduled_at?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  team1_checkin_token?: string | null;
  team2_checkin_token?: string | null;
  team1_checked_in_at?: string | null;
  team2_checked_in_at?: string | null;
  checkin_email_sent_at?: string | null;
  reminder_30_sent_at?: string | null;
  reminder_15_sent_at?: string | null;
  forfeit_processed_at?: string | null;
  tournament_id?: string | null;
};

function defaultMatchSeed(overrides: Partial<MatchSeed> = {}): MatchSeed {
  return {
    id: 'match-1',
    status: 'pending',
    is_bye: false,
    scheduled_at: null,
    team1_id: 'team-a',
    team2_id: 'team-b',
    team1_checkin_token: null,
    team2_checkin_token: null,
    team1_checked_in_at: null,
    team2_checked_in_at: null,
    checkin_email_sent_at: null,
    reminder_30_sent_at: null,
    reminder_15_sent_at: null,
    forfeit_processed_at: null,
    tournament_id: 'tour-1',
    ...overrides,
  };
}

/** Build the MatchLite shape that processMatchCheckin expects. */
function buildMatchLite(over: Partial<MatchSeed> = {}) {
  const m = defaultMatchSeed(over);
  return {
    ...m,
    team1: { id: 'team-a', name: 'Alpha', discord_role_id: null },
    team2: { id: 'team-b', name: 'Bravo', discord_role_id: null },
    tournament: { id: 'tour-1', name: 'Cup 2026' },
  } as any;
}

/** Build a scheduled_at ISO string for `minutesFromNow` minutes ahead/behind. */
function scheduledIn(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

beforeEach(() => {
  resetSupabaseMock();
  sendMatchCheckinEmail.mockClear();
  notifyCheckinReminder.mockClear();
  notifyCheckinForfeit.mockClear();
  applyMatchScore.mockClear();
});

/* -----------------------------------------------------------
 * Token helpers (pure)
 * ---------------------------------------------------------*/

describe('generateCheckinToken', () => {
  it('returns a base64url string of at least 16 characters', () => {
    const tok = generateCheckinToken();
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tok.length).toBeGreaterThanOrEqual(16);
  });

  it('generates different tokens on subsequent calls', () => {
    const a = generateCheckinToken();
    const b = generateCheckinToken();
    expect(a).not.toBe(b);
  });
});

describe('buildCheckinUrl', () => {
  it('appends the token under /checkin/', () => {
    const url = buildCheckinUrl('abc123');
    expect(url).toMatch(/\/checkin\/abc123$/);
  });

  it('does not double the slash if SITE_URL ends with /', () => {
    // The function trims a trailing slash from SITE_URL — assert there's
    // exactly one slash before "checkin/".
    const url = buildCheckinUrl('xyz');
    expect(url).not.toMatch(/\/\/checkin/);
  });
});

/* -----------------------------------------------------------
 * resolveCheckinToken
 * ---------------------------------------------------------*/

describe('resolveCheckinToken', () => {
  it('rejects an empty token', async () => {
    const r = await resolveCheckinToken('');
    expect(r.ok).toBe(false);
  });

  it('rejects a too-short token', async () => {
    const r = await resolveCheckinToken('short');
    expect(r.ok).toBe(false);
  });

  it('returns the team1 details when team1 token matches', async () => {
    const tok = 'a'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        status: 'pending',
        scheduled_at: scheduledIn(45),
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: 'other-token',
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
        tournament: { id: 'tour-1', name: 'Cup 2026' },
      },
    ] as any;

    const r = await resolveCheckinToken(tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.matchId).toBe('match-1');
    expect(r.teamSlot).toBe(1);
    expect(r.teamName).toBe('Alpha');
    expect(r.opponentName).toBe('Bravo');
    expect(r.tournamentName).toBe('Cup 2026');
    expect(r.alreadyCheckedIn).toBe(false);
  });

  it('returns teamSlot=2 when team2 token matches', async () => {
    const tok = 'b'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        status: 'pending',
        scheduled_at: scheduledIn(45),
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: 'something-else-32-chars-padding',
        team2_checkin_token: tok,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;

    const r = await resolveCheckinToken(tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.teamSlot).toBe(2);
    expect(r.teamName).toBe('Bravo');
  });

  it('reports alreadyCheckedIn=true when checked_in_at is set', async () => {
    const tok = 'c'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        status: 'pending',
        scheduled_at: scheduledIn(15),
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: '2026-04-01T12:00:00.000Z',
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;

    const r = await resolveCheckinToken(tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.alreadyCheckedIn).toBe(true);
    expect(r.checkedInAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('returns ok=false when no match has the token', async () => {
    store.matches = [];
    const r = await resolveCheckinToken('z'.repeat(32));
    expect(r.ok).toBe(false);
  });
});

/* -----------------------------------------------------------
 * redeemCheckinToken
 * ---------------------------------------------------------*/

describe('redeemCheckinToken', () => {
  it('writes team1_checked_in_at when the team has not yet checked in', async () => {
    const tok = 'a'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        status: 'pending',
        scheduled_at: scheduledIn(15),
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;

    const r = await redeemCheckinToken(tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.alreadyCheckedIn).toBe(false);
    expect((store.matches[0] as any).team1_checked_in_at).toBeTruthy();
  });

  it('is idempotent — second redeem reports alreadyCheckedIn=true and does not change the timestamp', async () => {
    const tok = 'b'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        status: 'pending',
        scheduled_at: scheduledIn(15),
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: '2026-04-01T12:00:00.000Z',
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;

    const r = await redeemCheckinToken(tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.alreadyCheckedIn).toBe(true);
    expect(r.checkedInAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('refuses to redeem when match status is finished', async () => {
    const tok = 'c'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        status: 'finished',
        scheduled_at: scheduledIn(-30),
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;

    const r = await redeemCheckinToken(tok);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Check-in fermé/);
  });
});

/* -----------------------------------------------------------
 * processMatchCheckin — early returns
 * ---------------------------------------------------------*/

describe('processMatchCheckin — early returns', () => {
  it('returns no steps for a bye match', async () => {
    const r = await processMatchCheckin(buildMatchLite({ is_bye: true }));
    expect(r.steps).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('returns no steps for a non-pending match', async () => {
    const r = await processMatchCheckin(
      buildMatchLite({ status: 'finished', scheduled_at: scheduledIn(45) })
    );
    expect(r.steps).toEqual([]);
  });

  it('returns no steps when scheduled_at is missing', async () => {
    const r = await processMatchCheckin(
      buildMatchLite({ scheduled_at: null })
    );
    expect(r.steps).toEqual([]);
  });

  it('returns no steps when one team is missing', async () => {
    const r = await processMatchCheckin(
      buildMatchLite({ scheduled_at: scheduledIn(45), team2_id: null })
    );
    expect(r.steps).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * processMatchCheckin — T-60 open step
 * ---------------------------------------------------------*/

describe('processMatchCheckin — T-60 open step', () => {
  it('generates tokens, sends emails, and marks the match', async () => {
    setAdminUser('captain-a', 'a@example.com');
    setAdminUser('captain-b', 'b@example.com');

    store.matches = [{ id: 'match-1' }] as any;
    store.teams = [
      { id: 'team-a', captain_id: 'captain-a' },
      { id: 'team-b', captain_id: 'captain-b' },
    ] as any;

    const m = buildMatchLite({ scheduled_at: scheduledIn(45) }); // inside the 60-min window
    const r = await processMatchCheckin(m);

    expect(r.steps[0]).toMatch(/email_sent \(2 recipients\)/);
    expect(sendMatchCheckinEmail).toHaveBeenCalledTimes(2);
    expect((store.matches[0] as any).checkin_email_sent_at).toBeTruthy();
    expect((store.matches[0] as any).team1_checkin_token).toBeTruthy();
    expect((store.matches[0] as any).team2_checkin_token).toBeTruthy();
  });

  it('does not re-send emails if checkin_email_sent_at is already set', async () => {
    store.matches = [
      {
        id: 'match-1',
        checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
      },
    ] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(45),
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps).toEqual([]);
    expect(sendMatchCheckinEmail).not.toHaveBeenCalled();
  });

  it('skips the email of a team that is already checked in', async () => {
    setAdminUser('captain-b', 'b@example.com');
    store.matches = [{ id: 'match-1' }] as any;
    store.teams = [
      { id: 'team-a', captain_id: 'captain-a' },
      { id: 'team-b', captain_id: 'captain-b' },
    ] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(45),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps[0]).toMatch(/email_sent \(1 recipients\)/);
    expect(sendMatchCheckinEmail).toHaveBeenCalledTimes(1);
  });
});

/* -----------------------------------------------------------
 * processMatchCheckin — Discord reminders
 * ---------------------------------------------------------*/

describe('processMatchCheckin — reminders', () => {
  it('pings both teams at T-30 when neither is checked in', async () => {
    store.matches = [{ id: 'match-1' }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(20),
      team1_checkin_token: 'tok-1',
      team2_checkin_token: 'tok-2',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps).toContain('reminder_30 (2 pinged)');
    expect(notifyCheckinReminder).toHaveBeenCalledTimes(2);
    expect((store.matches[0] as any).reminder_30_sent_at).toBeTruthy();
  });

  it('skips checked-in teams in the T-15 reminder', async () => {
    store.matches = [{ id: 'match-1' }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(10),
      team1_checkin_token: 'tok-1',
      team2_checkin_token: 'tok-2',
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
      reminder_30_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps).toContain('reminder_15 (1 pinged)');
    expect(notifyCheckinReminder).toHaveBeenCalledTimes(1);
  });
});

/* -----------------------------------------------------------
 * processMatchCheckin — forfeit
 * ---------------------------------------------------------*/

describe('processMatchCheckin — forfeit step', () => {
  it('skips the forfeit when both teams have checked in', async () => {
    store.matches = [{ id: 'match-1' }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      team2_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps).toContain('forfeit_skipped (both teams checked in)');
    expect(applyMatchScore).not.toHaveBeenCalled();
    expect((store.matches[0] as any).forfeit_processed_at).toBeTruthy();
  });

  it('cancels the match when no team checked in', async () => {
    store.matches = [{ id: 'match-1' }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1),
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps).toContain('forfeit_both_cancelled');
    expect((store.matches[0] as any).status).toBe('cancelled');
    expect((store.matches[0] as any).forfeit_processed_at).toBeTruthy();
  });

  it('forfeits the missing team to the present one', async () => {
    store.matches = [{ id: 'match-1' }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps[0]).toMatch(/^forfeit \(/);
    expect(applyMatchScore).toHaveBeenCalledOnce();
    const args = applyMatchScore.mock.calls[0][0] as any;
    expect(args.forfeitTeamId).toBe('team-b');
    expect(notifyCheckinForfeit).toHaveBeenCalledOnce();
  });

  it('records an error when applyMatchScore throws', async () => {
    applyMatchScore.mockRejectedValueOnce(new Error('db down'));
    store.matches = [{ id: 'match-1' }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1),
      team2_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.errors[0]).toMatch(/applyMatchScore forfeit/);
    expect(r.steps).toEqual([]); // step push happens after the call returns
  });
});

/* -----------------------------------------------------------
 * listCheckinStatus
 * ---------------------------------------------------------*/

describe('listCheckinStatus', () => {
  it('returns a normalized row per match for the tournament', async () => {
    store.matches = [
      {
        id: 'match-1',
        scheduled_at: '2026-04-01T12:00:00.000Z',
        status: 'pending',
        tournament_id: 'tour-1',
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checked_in_at: '2026-04-01T11:30:00.000Z',
        team2_checked_in_at: null,
        checkin_email_sent_at: '2026-04-01T11:00:00.000Z',
        reminder_30_sent_at: null,
        reminder_15_sent_at: null,
        forfeit_processed_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;

    const rows = await listCheckinStatus('tour-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].team1.checkedInAt).toBe('2026-04-01T11:30:00.000Z');
    expect(rows[0].team2.checkedInAt).toBeNull();
    expect(rows[0].emailSentAt).toBe('2026-04-01T11:00:00.000Z');
  });

  it('returns an empty array when no matches', async () => {
    store.matches = [];
    expect(await listCheckinStatus('tour-x')).toEqual([]);
  });
});
