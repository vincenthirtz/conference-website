import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/supabase', () => ({ supabaseAdmin: {} }));

import { formatStaffLog } from '../../utils/staffLogs';
import type { StaffLog } from '../../types/staffLogs';

function makeLog(overrides: Partial<StaffLog> = {}): StaffLog {
  return {
    id: 'log-1',
    created_at: '2026-04-01T12:00:00.000Z',
    staff_id: 'staff-1',
    action: 'login',
    entity_type: null,
    entity_id: null,
    tournament_id: null,
    payload: null,
    staff: null,
    ...overrides,
  };
}

describe('formatStaffLog', () => {
  it('translates known action codes to French labels', () => {
    expect(formatStaffLog(makeLog({ action: 'login' })).readableAction).toBe(
      'Connexion'
    );
    expect(
      formatStaffLog(makeLog({ action: 'create_tournament' })).readableAction
    ).toBe('Création tournoi');
    expect(
      formatStaffLog(makeLog({ action: 'auto_advance_stage' })).readableAction
    ).toBe('Avancement automatique phase');
  });

  it('falls back to the raw action code if not in the map', () => {
    // Cast a fake action through to exercise the fallback branch.
    const log = makeLog({ action: 'totally_unknown' as any });
    expect(formatStaffLog(log).readableAction).toBe('totally_unknown');
  });

  it('builds readableEntity as "<type> #<id>" when both are present', () => {
    const log = makeLog({ entity_type: 'team', entity_id: 'abc' });
    expect(formatStaffLog(log).readableEntity).toBe('team #abc');
  });

  it('omits the id segment when entity_id is null', () => {
    const log = makeLog({ entity_type: 'tournament', entity_id: null });
    expect(formatStaffLog(log).readableEntity).toBe('tournament');
  });

  it('returns null readableEntity when entity_type is null', () => {
    expect(formatStaffLog(makeLog()).readableEntity).toBeNull();
  });

  it('formats the date in fr-FR locale', () => {
    const log = makeLog({ created_at: '2026-04-01T12:00:00.000Z' });
    const out = formatStaffLog(log);
    expect(out.date).toMatch(/01\/04\/2026/);
  });

  it('preserves all original fields on the output', () => {
    const log = makeLog({
      payload: { value: 42 },
      tournament_id: 'tid',
    });
    const out = formatStaffLog(log);
    expect(out.payload).toEqual({ value: 42 });
    expect(out.tournament_id).toBe('tid');
    expect(out.id).toBe('log-1');
    // Augmented fields are present too
    expect(out.readableAction).toBeTruthy();
  });
});
