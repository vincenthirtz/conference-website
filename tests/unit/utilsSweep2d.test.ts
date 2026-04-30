// Sweep 2d: utility helpers at low coverage.
//
// Targets:
//  - utils/teamImport.ts (real importTeams)
//  - utils/stages/autoAdvance.ts (real tryAutoAdvanceFromMatch)
//  - utils/staffLogs.ts (fetchStaffLogs / fetchStaffLogsFiltered / formatStaffLog)

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { computeStageStandings } = vi.hoisted(() => ({
  computeStageStandings: vi.fn(async () => [] as any[]),
}));
vi.mock('@/utils/stages/standings', () => ({ computeStageStandings }));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import { importTeams, slugify } from '../../utils/teamImport';
import { tryAutoAdvanceFromMatch } from '../../utils/stages/autoAdvance';
import {
  fetchStaffLogs,
  fetchStaffLogsFiltered,
  formatStaffLog,
} from '../../utils/staffLogs';

beforeEach(() => {
  resetSupabaseMock();
  computeStageStandings.mockClear();
});

/* -----------------------------------------------------------
 * slugify
 * ---------------------------------------------------------*/

describe('slugify', () => {
  it('removes accents and lowercases', () => {
    expect(slugify('Équipe Champion')).toBe('equipe-champion');
  });
  it('strips non-alphanumeric runs', () => {
    expect(slugify('Hello---World!!  Foo')).toBe('hello-world-foo');
  });
  it('trims leading/trailing dashes', () => {
    expect(slugify('---abc---')).toBe('abc');
  });
});

/* -----------------------------------------------------------
 * importTeams
 * ---------------------------------------------------------*/

describe('importTeams', () => {
  it('throws when too many rows', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ name: `T${i}` }));
    await expect(
      importTeams(rows, { sourceLabel: 'csv_import' })
    ).rejects.toThrow(/Trop de lignes/);
  });

  it('records error rows for missing names', async () => {
    const result = await importTeams(
      [{ name: '' }, { name: 'OK' }],
      { sourceLabel: 'csv_import' }
    );
    expect(result.created).toBe(1);
    expect(result.errors[0].message).toContain('manquant');
    expect((store.teams as any[])).toHaveLength(1);
  });

  it('records error rows for too-long names', async () => {
    const result = await importTeams(
      [{ name: 'a'.repeat(150) }],
      { sourceLabel: 'csv_import' }
    );
    expect(result.created).toBe(0);
    expect(result.errors[0].message).toContain('Nom trop long');
  });

  it('skips duplicates (case-insensitive)', async () => {
    store.teams = [{ id: 't-existing', name: 'Alpha' }] as any;
    const result = await importTeams(
      [{ name: 'alpha' }, { name: 'Beta' }],
      { sourceLabel: 'csv_import' }
    );
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(1);
  });

  it('inserts players into team_members', async () => {
    const result = await importTeams(
      [
        {
          name: 'Squad',
          short_name: 'SQ',
          country: 'FR',
          players: ['P1#1234', 'P2#5678', '   '],
        },
      ],
      { sourceLabel: 'csv_import' }
    );
    expect(result.created).toBe(1);
    // 2 non-empty players inserted
    expect((store.team_members as any[]).length).toBe(2);
  });

  it('upserts into tournament_teams when tournamentId provided', async () => {
    const result = await importTeams(
      [{ name: 'Squad' }],
      {
        sourceLabel: 'toornament_import',
        tournamentId: 't-tour',
        staffId: 's-1',
      }
    );
    expect(result.created).toBe(1);
    // staff_logs inserted (defensive against shared-cache reorderings under
    // vitest's --no-isolate; the table key is created lazily by the mock).
    expect((store.staff_logs ?? []).length).toBe(1);
    // tournament_teams entry written via upsert
    expect((store.tournament_teams ?? []).length).toBe(1);
  });
});

/* -----------------------------------------------------------
 * tryAutoAdvanceFromMatch
 * ---------------------------------------------------------*/

describe('tryAutoAdvanceFromMatch', () => {
  it('returns no_stage when stageId is null', async () => {
    const r = await tryAutoAdvanceFromMatch({ stageId: null, staffId: null });
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('no_stage');
  });

  it('returns stage_not_found', async () => {
    const r = await tryAutoAdvanceFromMatch({
      stageId: 'unknown',
      staffId: null,
    });
    expect(r.reason).toBe('stage_not_found');
  });

  it('returns stage_inactive', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: false,
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('stage_inactive');
  });

  it('returns no_advancement_rules when settings missing', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: { advancement_rules: null },
      },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('no_advancement_rules');
  });

  it('returns invalid_advancement_rules when both top/per_group missing', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: { target_stage_id: 't-target' },
        },
      },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('invalid_advancement_rules');
  });

  it('returns no_matches when stage has no matches', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 4,
            target_stage_id: 'target',
          },
        },
      },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('no_matches');
  });

  it('returns matches_pending when not all finished', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 4,
            target_stage_id: 'target',
          },
        },
      },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'pending' },
      { id: 'm2', stage_id: 's1', status: 'finished' },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('matches_pending');
  });

  it('returns target_stage_not_found', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 4,
            target_stage_id: 'missing-target',
          },
        },
      },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('target_stage_not_found');
  });

  it('returns target_stage_wrong_tournament', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 4,
            target_stage_id: 'target',
          },
        },
      },
      {
        id: 'target',
        tournament_id: 't-other',
        is_active: true,
      },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
    ] as any;
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('target_stage_wrong_tournament');
  });

  it('returns standings_empty', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 4,
            target_stage_id: 'target',
          },
        },
      },
      { id: 'target', tournament_id: 't1', is_active: true },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([]);
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.reason).toBe('standings_empty');
  });

  it('triggers advancement with advance_top and inserts seeded teams', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 2,
            target_stage_id: 'target',
            seed_by: 'standings',
          },
        },
      },
      { id: 'target', tournament_id: 't1', is_active: true },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
      { id: 'm2', stage_id: 's1', status: 'walkover' },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 'tA', rank: 1 },
      { teamId: 'tB', rank: 2 },
      { teamId: 'tC', rank: 3 },
    ] as any);
    const r = await tryAutoAdvanceFromMatch({
      stageId: 's1',
      staffId: 'staff-1',
    });
    expect(r.triggered).toBe(true);
    expect(r.advancedTeamIds).toEqual(['tA', 'tB']);
    expect((store.stage_teams as any[]).length).toBe(2);
    // source stage deactivated
    expect((store.tournament_stages as any[])[0].is_active).toBe(false);
    // staff log written
    expect((store.staff_logs as any[]).length).toBe(1);
  });

  it('returns already_advanced when target already contains the teams', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 2,
            target_stage_id: 'target',
          },
        },
      },
      { id: 'target', tournament_id: 't1', is_active: true },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
    ] as any;
    store.stage_teams = [
      { stage_id: 'target', team_id: 'tA' },
      { stage_id: 'target', team_id: 'tB' },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 'tA', rank: 1 },
      { teamId: 'tB', rank: 2 },
    ] as any);
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.triggered).toBe(false);
    expect(r.reason).toBe('already_advanced');
    expect((store.tournament_stages as any[])[0].is_active).toBe(false);
  });

  it('triggers per-group advancement', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_per_group: 1,
            target_stage_id: 'target',
            seed_by: 'manual',
          },
          group_assignments: {
            G1: ['tA', 'tB'],
            G2: ['tC', 'tD'],
          },
        },
      },
      { id: 'target', tournament_id: 't1', is_active: true },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 'tA', rank: 1 },
      { teamId: 'tB', rank: 3 },
      { teamId: 'tC', rank: 2 },
      { teamId: 'tD', rank: 4 },
    ] as any);
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.triggered).toBe(true);
    // top-1-per-group = first standings entry per group key
    expect(new Set(r.advancedTeamIds!)).toEqual(new Set(['tA', 'tC']));
  });

  it('handles seed_by=none', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: 't1',
        is_active: true,
        stage_type: 'group',
        settings: {
          advancement_rules: {
            advance_top: 1,
            target_stage_id: 'target',
            seed_by: 'none',
          },
        },
      },
      { id: 'target', tournament_id: 't1', is_active: true },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: 's1', status: 'finished' },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 'tA', rank: 1 },
    ] as any);
    const r = await tryAutoAdvanceFromMatch({ stageId: 's1', staffId: null });
    expect(r.triggered).toBe(true);
    const inserted = (store.stage_teams as any[])[0];
    expect(inserted.seed).toBe(null);
  });
});

/* -----------------------------------------------------------
 * staffLogs
 * ---------------------------------------------------------*/

describe('staffLogs helpers', () => {
  it('fetchStaffLogs returns rows from store', async () => {
    store.staff_logs = [
      {
        id: 'l1',
        staff_id: 's1',
        action: 'login',
        entity_type: null,
        entity_id: null,
        tournament_id: null,
        payload: null,
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ] as any;
    const rows = await fetchStaffLogs(50);
    expect(rows.length).toBe(1);
  });

  it('fetchStaffLogsFiltered respects filters', async () => {
    store.staff_logs = [
      {
        id: 'l1',
        staff_id: 's1',
        action: 'create_match',
        entity_type: 'match',
        tournament_id: 't1',
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'l2',
        staff_id: 's2',
        action: 'login',
        entity_type: null,
        tournament_id: null,
        created_at: '2026-04-02T00:00:00.000Z',
      },
    ] as any;
    const rows = await fetchStaffLogsFiltered({
      staff_id: 's1',
      action: 'create_match',
      entity_type: 'match',
      tournament_id: 't1',
      date_from: '2026-03-01T00:00:00.000Z',
      date_to: '2026-12-31T00:00:00.000Z',
    });
    expect(rows.length).toBe(1);
    expect((rows[0] as any).id).toBe('l1');
  });

  it('formatStaffLog returns readable fields', () => {
    const out = formatStaffLog({
      id: 'l1',
      created_at: '2026-04-01T12:00:00.000Z',
      staff_id: 's1',
      action: 'create_tournament',
      entity_type: 'tournament',
      entity_id: 't1',
      tournament_id: 't1',
      payload: null,
    } as any);
    expect(out.readableAction).toBe('Création tournoi');
    expect(out.readableEntity).toBe('tournament #t1');
    expect(typeof out.date).toBe('string');
  });

  it('formatStaffLog handles unknown action and missing entity', () => {
    const out = formatStaffLog({
      id: 'l2',
      created_at: '2026-04-01T00:00:00.000Z',
      staff_id: 's1',
      action: 'mystery_action' as any,
      entity_type: null,
      entity_id: null,
      tournament_id: null,
      payload: null,
    } as any);
    expect(out.readableAction).toBe('mystery_action');
    expect(out.readableEntity).toBeNull();
  });
});
