import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  rosterLockErrorMessage,
  isTeamRosterLocked,
} from '../../utils/teams/rosterLock';

type Reg = { tournament_id: string };
type Tournament = {
  id: string;
  name: string | null;
  roster_locked_at: string | null;
  status: string;
};

const TEAM_ID = 'team-1';

function seedRegistrations(rows: Reg[]) {
  // The mock filters by team_id (the rosterLock query does .eq('team_id', …)),
  // so attach the test team_id automatically to keep the seeds compact.
  store.tournament_teams = rows.map((r) => ({ ...r, team_id: TEAM_ID })) as any;
}

function seedTournaments(rows: Tournament[]) {
  store.tournaments = rows as any;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('rosterLockErrorMessage', () => {
  it('returns the unlocked message when status is not locked', () => {
    expect(rosterLockErrorMessage({ locked: false })).toBe(
      'Roster non verrouille'
    );
  });

  it('includes the tournament name when provided', () => {
    const msg = rosterLockErrorMessage({
      locked: true,
      tournamentId: 'tid-123456',
      tournamentName: 'Coupe Hiver',
      lockedAt: '2026-01-15T10:00:00.000Z',
    });
    expect(msg).toContain('"Coupe Hiver"');
    expect(msg).toContain('force=true');
  });

  it('falls back to a tournament id prefix when no name is set', () => {
    const msg = rosterLockErrorMessage({
      locked: true,
      tournamentId: '0123456789abcdef',
      tournamentName: null,
      lockedAt: '2026-01-15T10:00:00.000Z',
    });
    // Falls back to first 8 chars of the id
    expect(msg).toContain('"01234567"');
  });

  it('formats the lock date in fr-FR locale', () => {
    const msg = rosterLockErrorMessage({
      locked: true,
      tournamentId: 'tid',
      tournamentName: 'X',
      lockedAt: '2026-01-15T10:00:00.000Z',
    });
    // toLocaleString('fr-FR') uses DD/MM/YYYY — assert the day/month digits appear.
    expect(msg).toMatch(/15\/01\/2026/);
  });
});

describe('isTeamRosterLocked', () => {
  it('returns unlocked when the team has no tournament registrations', async () => {
    seedRegistrations([]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns unlocked when none of the registered tournaments has a lock date', async () => {
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Open Spring',
        roster_locked_at: null,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns unlocked when the lock date is in the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Future Cup',
        roster_locked_at: future,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns locked with tournament details when at least one lock date has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      {
        id: 't1',
        name: 'Hiver 2026',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status).toEqual({
      locked: true,
      tournamentId: 't1',
      tournamentName: 'Hiver 2026',
      lockedAt: past,
    });
  });

  it('ignores archived tournaments even if their lock date has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't-archived' }]);
    seedTournaments([
      {
        id: 't-archived',
        name: 'Old',
        roster_locked_at: past,
        status: 'archived',
      },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('ignores completed tournaments even if their lock date has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't-done' }]);
    seedTournaments([
      {
        id: 't-done',
        name: 'Done',
        roster_locked_at: past,
        status: 'completed',
      },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('returns the first locking tournament when several are locked', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([
      { tournament_id: 't1' },
      { tournament_id: 't2' },
    ]);
    seedTournaments([
      {
        id: 't1',
        name: 'First',
        roster_locked_at: past,
        status: 'in_progress',
      },
      {
        id: 't2',
        name: 'Second',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(true);
    if (status.locked) {
      expect(status.tournamentId).toBe('t1');
    }
  });

  it('skips registrations with a null tournament_id', async () => {
    seedRegistrations([{ tournament_id: null as unknown as string }]);
    seedTournaments([]);
    const status = await isTeamRosterLocked(TEAM_ID);
    expect(status.locked).toBe(false);
  });

  it('falls back to a null tournament name when none is set on the row', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedRegistrations([{ tournament_id: 't1' }]);
    seedTournaments([
      { id: 't1', name: null, roster_locked_at: past, status: 'in_progress' },
    ]);
    const status = await isTeamRosterLocked(TEAM_ID);
    if (!status.locked) throw new Error('expected locked');
    expect(status.tournamentName).toBeNull();
  });
});
