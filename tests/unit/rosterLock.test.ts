import { describe, it, expect, vi } from 'vitest';

// rosterLock.ts imports supabaseAdmin at module load.
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: {},
}));

import { rosterLockErrorMessage } from '../../utils/teams/rosterLock';

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
