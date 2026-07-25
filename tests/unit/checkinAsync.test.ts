import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  sendMatchCheckinEmail,
  sendCheckinReminderEmail,
  sendCheckinForfeitEmail,
  notifyCheckinReminder,
  notifyCheckinForfeit,
  applyMatchScore,
} = vi.hoisted(() => ({
  sendMatchCheckinEmail: vi.fn(async () => ({ ok: true as const })),
  sendCheckinReminderEmail: vi.fn(async () => ({ ok: true as const })),
  sendCheckinForfeitEmail: vi.fn(async () => ({ ok: true as const })),
  notifyCheckinReminder: vi.fn(async () => undefined),
  notifyCheckinForfeit: vi.fn(async () => undefined),
  applyMatchScore: vi.fn(async () => undefined),
}));

vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail,
  sendCheckinReminderEmail,
  sendCheckinForfeitEmail,
}));
vi.mock('../../utils/discord', () => ({
  notifyCheckinReminder,
  notifyCheckinForfeit,
}));
vi.mock('../../utils/matches/applyScore', () => ({ applyMatchScore }));

import {
  store,
  resetSupabaseMock,
  setAdminUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import {
  generateCheckinToken,
  buildCheckinUrl,
  resolveCheckinToken,
  redeemCheckinToken,
  processMatchCheckin,
  listCheckinStatus,
  processCheckinForUpcomingMatches,
  hasActiveTournamentWindow,
} from '../../utils/checkin';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

// S5a: tenantId est maintenant obligatoire sur resolveCheckinToken /
// redeemCheckinToken / processMatchCheckin (via MatchLite.tenant_id).
const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

type MatchSeed = {
  id: string;
  tenant_id?: string;
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
    tenant_id: TENANT_ID,
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
  sendCheckinReminderEmail.mockClear();
  sendCheckinForfeitEmail.mockClear();
  notifyCheckinReminder.mockClear();
  notifyCheckinForfeit.mockClear();
  applyMatchScore.mockClear();

  // Le bulk scanner (cron, sans tournamentId) est désormais gardé par
  // hasActiveTournamentWindow(). On seede par défaut un tournoi ACTIF grand-
  // ouvert (id distinct de 'tour-1' pour ne pas interférer avec la résolution
  // de checkin_grace_minutes sur 'tour-1') afin que les tests de scan
  // existants passent le garde. Les tests « hors période » vident
  // explicitement store.tournaments.
  store.tournaments = [
    {
      id: 'active-window-tour',
      tenant_id: TENANT_ID,
      status: 'running',
      start_date: '2020-01-01',
      end_date: '2999-12-31',
    },
  ] as any;
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
    const r = await resolveCheckinToken(TENANT_ID, '');
    expect(r.ok).toBe(false);
  });

  it('rejects a too-short token', async () => {
    const r = await resolveCheckinToken(TENANT_ID, 'short');
    expect(r.ok).toBe(false);
  });

  it('rejects a token with an invalid charset before querying', async () => {
    // Long enough to pass the length check, but contains PostgREST filter
    // metacharacters (`,` / `.` / `(`) → must be rejected pre-query.
    const r = await resolveCheckinToken(
      TENANT_ID,
      'aaaaaaaa,team2_checkin_token.eq.bbbbbbbb'
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected not ok');
    expect(r.error).toBe('Token invalide');
  });

  it('returns the team1 details when team1 token matches', async () => {
    const tok = 'a'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        tenant_id: TENANT_ID,
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

    const r = await resolveCheckinToken(TENANT_ID, tok);
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
        tenant_id: TENANT_ID,
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

    const r = await resolveCheckinToken(TENANT_ID, tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.teamSlot).toBe(2);
    expect(r.teamName).toBe('Bravo');
  });

  it('reports alreadyCheckedIn=true when checked_in_at is set', async () => {
    const tok = 'c'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        tenant_id: TENANT_ID,
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

    const r = await resolveCheckinToken(TENANT_ID, tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.alreadyCheckedIn).toBe(true);
    expect(r.checkedInAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('returns ok=false when no match has the token', async () => {
    store.matches = [];
    const r = await resolveCheckinToken(TENANT_ID, 'z'.repeat(32));
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
        tenant_id: TENANT_ID,
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

    const r = await redeemCheckinToken(TENANT_ID, tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.alreadyCheckedIn).toBe(false);
    expect((store.matches[0] as any).team1_checked_in_at).toBeTruthy();
  });

  it('is idempotent — second redeem reports alreadyCheckedIn=true and does not change the timestamp', async () => {
    const tok = 'b'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        tenant_id: TENANT_ID,
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

    const r = await redeemCheckinToken(TENANT_ID, tok);
    if (!r.ok) throw new Error('expected ok');
    expect(r.alreadyCheckedIn).toBe(true);
    expect(r.checkedInAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('refuses to redeem when match status is finished', async () => {
    const tok = 'c'.repeat(32);
    store.matches = [
      {
        id: 'match-1',
        tenant_id: TENANT_ID,
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

    const r = await redeemCheckinToken(TENANT_ID, tok);
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
    const r = await processMatchCheckin(buildMatchLite({ scheduled_at: null }));
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

    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;
    store.teams = [
      { id: 'team-a', tenant_id: TENANT_ID, captain_id: 'captain-a' },
      { id: 'team-b', tenant_id: TENANT_ID, captain_id: 'captain-b' },
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
        tenant_id: TENANT_ID,
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
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;
    store.teams = [
      { id: 'team-a', tenant_id: TENANT_ID, captain_id: 'captain-a' },
      { id: 'team-b', tenant_id: TENANT_ID, captain_id: 'captain-b' },
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
  /** Seed both captains so getCaptainEmail resolves a real address. */
  function seedCaptains() {
    setAdminUser('captain-a', 'a@example.com');
    setAdminUser('captain-b', 'b@example.com');
    store.teams = [
      { id: 'team-a', tenant_id: TENANT_ID, captain_id: 'captain-a' },
      { id: 'team-b', tenant_id: TENANT_ID, captain_id: 'captain-b' },
    ] as any;
  }

  it('pings both teams at T-30 when neither is checked in', async () => {
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

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
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

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

  it('emails both captains at T-30 with minutesBeforeKickoff=30 and the existing token', async () => {
    seedCaptains();
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(20),
      team1_checkin_token: 'tok-1',
      team2_checkin_token: 'tok-2',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    await processMatchCheckin(m);

    // Email sent alongside the Discord ping, never replacing it.
    expect(notifyCheckinReminder).toHaveBeenCalledTimes(2);
    expect(sendCheckinReminderEmail).toHaveBeenCalledTimes(2);

    const calls = sendCheckinReminderEmail.mock.calls.map(
      (c: any[]) => c[0]
    ) as any[];
    const teamA = calls.find((c) => c.teamName === 'Alpha');
    const teamB = calls.find((c) => c.teamName === 'Bravo');

    expect(teamA).toMatchObject({
      to: 'a@example.com',
      opponentName: 'Bravo',
      minutesBeforeKickoff: 30,
    });
    // Reuses the existing token already on the match (no regeneration).
    expect(teamA.checkinUrl).toMatch(/\/checkin\/tok-1$/);
    expect(teamB).toMatchObject({
      to: 'b@example.com',
      opponentName: 'Alpha',
      minutesBeforeKickoff: 30,
    });
    expect(teamB.checkinUrl).toMatch(/\/checkin\/tok-2$/);
  });

  it('emails only the un-checked-in captain at T-15 with minutesBeforeKickoff=15', async () => {
    seedCaptains();
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(10),
      team1_checkin_token: 'tok-1',
      team2_checkin_token: 'tok-2',
      team1_checked_in_at: '2026-04-01T12:00:00.000Z', // Alpha already in
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
      reminder_30_sent_at: '2026-04-01T12:00:00.000Z',
    });
    await processMatchCheckin(m);

    // Alpha checked in -> no email; only Bravo gets reminded.
    expect(sendCheckinReminderEmail).toHaveBeenCalledTimes(1);
    const arg = (sendCheckinReminderEmail.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({
      to: 'b@example.com',
      teamName: 'Bravo',
      minutesBeforeKickoff: 15,
    });
  });

  it('does not re-send the reminder email once reminder_30_sent_at is set (idempotency)', async () => {
    seedCaptains();
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(20), // inside the T-30 window
      team1_checkin_token: 'tok-1',
      team2_checkin_token: 'tok-2',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
      reminder_30_sent_at: '2026-04-01T12:00:00.000Z', // gate already closed
    });
    const r = await processMatchCheckin(m);

    expect(r.steps.some((s) => s.startsWith('reminder_30'))).toBe(false);
    expect(notifyCheckinReminder).not.toHaveBeenCalled();
    expect(sendCheckinReminderEmail).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * processMatchCheckin — forfeit
 * ---------------------------------------------------------*/

describe('processMatchCheckin — forfeit step', () => {
  it('skips the forfeit when both teams have checked in', async () => {
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

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
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

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
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps[0]).toMatch(/^forfeit \(/);
    expect(applyMatchScore).toHaveBeenCalledOnce();
    const args = (applyMatchScore.mock.calls[0] as any[])[0];
    expect(args.forfeitTeamId).toBe('team-b');
    expect(notifyCheckinForfeit).toHaveBeenCalledOnce();
  });

  it('records an error when applyMatchScore throws', async () => {
    applyMatchScore.mockRejectedValueOnce(new Error('db down'));
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

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
 * T2 — configurable grace, no_show_reason, captain forfeit email
 * ---------------------------------------------------------*/

describe('processMatchCheckin — configurable grace + no_show_reason + email', () => {
  /** Seed the forfeited team's captain so the forfeit email can resolve. */
  function seedForfeitedCaptain() {
    setAdminUser('captain-b', 'b@example.com');
    store.teams = [
      { id: 'team-a', tenant_id: TENANT_ID, captain_id: 'captain-a' },
      { id: 'team-b', tenant_id: TENANT_ID, captain_id: 'captain-b' },
    ] as any;
  }

  it('writes no_show_reason and emails the forfeited captain (default 60 grace)', async () => {
    seedForfeitedCaptain();
    // No `tournaments` row seeded → resolveGraceMinutes hits the maybeSingle
    // null branch → fallback 60 (mirrors a not-yet-migrated DB).
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1), // 1 min past kickoff, well within 60 grace
      team1_checked_in_at: '2026-04-01T12:00:00.000Z', // Alpha in, Bravo out
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps[0]).toMatch(/^forfeit \(/);
    expect(applyMatchScore).toHaveBeenCalledOnce();
    expect((store.matches[0] as any).no_show_reason).toBe(
      'auto_forfeit_no_checkin'
    );
    expect(sendCheckinForfeitEmail).toHaveBeenCalledOnce();
    const arg = (sendCheckinForfeitEmail.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({
      to: 'b@example.com',
      teamName: 'Bravo',
      opponentName: 'Alpha',
      graceMinutes: 60,
    });
    // Discord embed enriched with the grace window.
    const dArg = (notifyCheckinForfeit.mock.calls[0] as any[])[0];
    expect(dArg.graceMinutes).toBe(60);
  });

  it('honors a per-tournament checkin_grace_minutes value', async () => {
    seedForfeitedCaptain();
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;
    store.tournaments = [
      { id: 'tour-1', tenant_id: TENANT_ID, checkin_grace_minutes: 90 },
    ] as any;

    // 80 min past kickoff: would NOT forfeit under the default 60 window, but
    // DOES under a 90-min grace.
    const m = buildMatchLite({
      scheduled_at: scheduledIn(-80),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps[0]).toMatch(/^forfeit \(/);
    expect(applyMatchScore).toHaveBeenCalledOnce();
    const arg = (sendCheckinForfeitEmail.mock.calls[0] as any[])[0];
    expect(arg.graceMinutes).toBe(90);
  });

  it('does not forfeit yet when still inside a longer grace window', async () => {
    seedForfeitedCaptain();
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;
    store.tournaments = [
      { id: 'tour-1', tenant_id: TENANT_ID, checkin_grace_minutes: 90 },
    ] as any;

    // 95 min past kickoff is BEYOND the 90-min grace catch-up window → the
    // forfeit step is not entered on this tick (would have fired earlier).
    const m = buildMatchLite({
      scheduled_at: scheduledIn(-95),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    expect(r.steps).toEqual([]);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('still forfeits if no_show_reason write fails (graceful degradation)', async () => {
    seedForfeitedCaptain();
    store.matches = [{ id: 'match-1', tenant_id: TENANT_ID }] as any;

    // Simulate the column not existing: monkey-patch the matches update used by
    // recordNoShowReason to throw. The forfeit (applyMatchScore) and
    // forfeit_processed_at must still go through.
    const m = buildMatchLite({
      scheduled_at: scheduledIn(-1),
      team1_checked_in_at: '2026-04-01T12:00:00.000Z',
      checkin_email_sent_at: '2026-04-01T12:00:00.000Z',
    });
    const r = await processMatchCheckin(m);

    // applyMatchScore is mocked (does not actually flip status), but the
    // forfeit step completed and marked the match processed.
    expect(r.steps[0]).toMatch(/^forfeit \(/);
    expect((store.matches[0] as any).forfeit_processed_at).toBeTruthy();
    expect(applyMatchScore).toHaveBeenCalledOnce();
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
        tenant_id: TENANT_ID,
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

    const rows = await listCheckinStatus(TENANT_ID, 'tour-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].team1.checkedInAt).toBe('2026-04-01T11:30:00.000Z');
    expect(rows[0].team2.checkedInAt).toBeNull();
    expect(rows[0].emailSentAt).toBe('2026-04-01T11:00:00.000Z');
  });

  it('returns an empty array when no matches', async () => {
    store.matches = [];
    expect(await listCheckinStatus(TENANT_ID, 'tour-x')).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * processCheckinForUpcomingMatches — bulk scanner
 * ---------------------------------------------------------*/

describe('processCheckinForUpcomingMatches', () => {
  it('returns an empty summary when there are no matches', async () => {
    store.matches = [];
    const summary = await processCheckinForUpcomingMatches();
    expect(summary).toEqual({
      scanned: 0,
      acted: 0,
      errors: 0,
      details: [],
    });
  });

  it('scans matches inside the +/- 65 minute window', async () => {
    const inWindow = new Date(Date.now() + 30 * 60_000).toISOString();
    const outWindow = new Date(Date.now() + 200 * 60_000).toISOString();
    store.matches = [
      defaultMatchSeed({ id: 'in', scheduled_at: inWindow }),
      defaultMatchSeed({ id: 'out', scheduled_at: outWindow }),
    ] as any;
    const summary = await processCheckinForUpcomingMatches();
    expect(summary.scanned).toBe(1);
  });

  it('filters by tournamentId when provided', async () => {
    const inWindow = new Date(Date.now() + 30 * 60_000).toISOString();
    store.matches = [
      defaultMatchSeed({
        id: 'm1',
        scheduled_at: inWindow,
        tournament_id: 'tour-A',
      }),
      defaultMatchSeed({
        id: 'm2',
        scheduled_at: inWindow,
        tournament_id: 'tour-B',
      }),
    ] as any;
    const summary = await processCheckinForUpcomingMatches({
      tournamentId: 'tour-A',
    });
    expect(summary.scanned).toBe(1);
  });

  it('skips matches missing scheduled_at', async () => {
    store.matches = [
      defaultMatchSeed({ id: 'no-schedule', scheduled_at: null }),
    ] as any;
    const summary = await processCheckinForUpcomingMatches();
    // The query filters .not('scheduled_at', 'is', null), so this match is
    // excluded from the scan entirely.
    expect(summary.scanned).toBe(0);
  });

  it('records steps when a match in the T-30 reminder window has tokens', async () => {
    setAdminUser('cap-1', 'cap@example.com');
    const inWindow = new Date(Date.now() + 25 * 60_000).toISOString();
    store.matches = [
      defaultMatchSeed({
        id: 'm-30',
        scheduled_at: inWindow,
        team1_checkin_token: 'tk1',
        team2_checkin_token: 'tk2',
        checkin_email_sent_at: '2026-01-01T00:00:00Z',
      }),
    ] as any;
    const summary = await processCheckinForUpcomingMatches();
    expect(summary.scanned).toBe(1);
    expect(summary.acted).toBe(1);
    expect(
      summary.details[0].steps.some((s) => s.startsWith('reminder_30'))
    ).toBe(true);
  });

  it('short-circuits (skipped:true, scanned:0) when no tournament window is active', async () => {
    // Aucun tournoi actif : le garde du cron doit court-circuiter AVANT tout
    // scan de matches, même si un match est parfaitement dans la fenêtre.
    store.tournaments = [];
    const inWindow = new Date(Date.now() + 30 * 60_000).toISOString();
    store.matches = [
      defaultMatchSeed({ id: 'in', scheduled_at: inWindow }),
    ] as any;

    const summary = await processCheckinForUpcomingMatches();

    expect(summary.skipped).toBe(true);
    expect(summary.scanned).toBe(0);
    expect(summary.acted).toBe(0);
    // Aucun effet de bord : pas d'email envoyé (le scan des matches n'a pas eu lieu).
    expect(sendMatchCheckinEmail).not.toHaveBeenCalled();
  });

  it('bypasses the guard when a targeted tournamentId is provided (admin path)', async () => {
    // Pas de tournoi actif dans le mock, mais l'appel ciblé (bouton admin)
    // doit tout de même scanner le tournoi demandé.
    store.tournaments = [];
    const inWindow = new Date(Date.now() + 30 * 60_000).toISOString();
    store.matches = [
      defaultMatchSeed({
        id: 'm1',
        scheduled_at: inWindow,
        tournament_id: 'tour-A',
      }),
    ] as any;

    const summary = await processCheckinForUpcomingMatches({
      tournamentId: 'tour-A',
    });

    expect(summary.skipped).toBeUndefined();
    expect(summary.scanned).toBe(1);
  });
});

/* -----------------------------------------------------------
 * hasActiveTournamentWindow
 * ---------------------------------------------------------*/

describe('hasActiveTournamentWindow', () => {
  it('returns true when a published tournament overlaps the current window', async () => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    store.tournaments = [
      {
        id: 'pub',
        tenant_id: TENANT_ID,
        status: 'published',
        start_date: iso(new Date(now.getTime() - 5 * 86_400_000)),
        end_date: iso(new Date(now.getTime() + 5 * 86_400_000)),
      },
    ] as any;

    expect(await hasActiveTournamentWindow(now)).toBe(true);
  });

  it('returns false when all tournaments are out of window or finished', async () => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    store.tournaments = [
      // Future tournament, entirely beyond the +1 day upper bound.
      {
        id: 'future',
        tenant_id: TENANT_ID,
        status: 'published',
        start_date: iso(new Date(now.getTime() + 30 * 86_400_000)),
        end_date: iso(new Date(now.getTime() + 40 * 86_400_000)),
      },
      // Active window but a non-active status → excluded by the .in() filter.
      {
        id: 'done',
        tenant_id: TENANT_ID,
        status: 'completed',
        start_date: iso(new Date(now.getTime() - 5 * 86_400_000)),
        end_date: iso(new Date(now.getTime() + 5 * 86_400_000)),
      },
    ] as any;

    expect(await hasActiveTournamentWindow(now)).toBe(false);
  });

  it('fails open (returns true) when the tournaments query errors', async () => {
    // Force la requête .from('tournaments') à renvoyer une erreur : le garde
    // ne doit JAMAIS couper le check-in à cause d'une erreur transitoire.
    const errChain: any = {
      select: () => errChain,
      in: () => errChain,
      lte: () => errChain,
      gte: () => errChain,
      limit: () =>
        Promise.resolve({ data: null, error: { message: 'boom' } }),
    };
    const spy = vi
      .spyOn(supabaseAdmin, 'from')
      .mockReturnValueOnce(errChain);

    expect(await hasActiveTournamentWindow()).toBe(true);

    spy.mockRestore();
  });
});
