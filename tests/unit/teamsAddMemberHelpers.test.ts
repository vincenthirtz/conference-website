// Tests pour utils/teams/addMember.ts
//
// Vise les helpers extraits pour mutualiser la logique entre les 3 endpoints
// d'ajout de membre (capitaine, admin, discord) :
//   - validateBattleTag
//   - resolveUserIdByEmail
//   - insertTeamMember (avec et sans pre-check max_players)
//   - setTeamCaptain

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthListUsers,
  setCreateUserResult,
} from './__helpers__/supabaseMock';
import {
  validateBattleTag,
  resolveUserIdByEmail,
  insertTeamMember,
  setTeamCaptain,
  BATTLE_TAG_REGEX,
} from '../../utils/teams/addMember';

// S5a: tenantId obligatoire dans InsertTeamMemberInput.
const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * validateBattleTag
 * ---------------------------------------------------------*/

describe('validateBattleTag', () => {
  it('accepts a well-formed BattleTag and returns it trimmed', () => {
    expect(validateBattleTag('Player#1234')).toBe('Player#1234');
    expect(validateBattleTag('  Player#1234  ')).toBe('Player#1234');
  });

  it('accepts up to 6-digit discriminators (Blizzard reality)', () => {
    expect(validateBattleTag('Foo#123')).toBe('Foo#123');
    expect(validateBattleTag('Foo#123456')).toBe('Foo#123456');
  });

  it('rejects empty / null / undefined input', () => {
    expect(() => validateBattleTag('')).toThrow(/BattleTag/);
    expect(() => validateBattleTag(null)).toThrow(/BattleTag/);
    expect(() => validateBattleTag(undefined)).toThrow(/BattleTag/);
  });

  it('rejects names shorter than 2 chars or non-alphanumeric', () => {
    expect(() => validateBattleTag('A#1234')).toThrow();
    expect(() => validateBattleTag('Pla yer#1234')).toThrow(); // space
    expect(() => validateBattleTag('Player-x#1234')).toThrow(); // dash
  });

  it('rejects discriminator with wrong digit count', () => {
    expect(() => validateBattleTag('Player#12')).toThrow();
    expect(() => validateBattleTag('Player#1234567')).toThrow();
    expect(() => validateBattleTag('Player#abcd')).toThrow();
  });

  it('exposes the canonical regex for reuse / cross-checks', () => {
    expect(BATTLE_TAG_REGEX.test('Player#1234')).toBe(true);
    expect(BATTLE_TAG_REGEX.test('bad')).toBe(false);
  });
});

/* -----------------------------------------------------------
 * resolveUserIdByEmail
 * ---------------------------------------------------------*/

describe('resolveUserIdByEmail', () => {
  it('returns 400 when email is empty', async () => {
    const r = await resolveUserIdByEmail({ email: '   ', create: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('finds an existing user (case-insensitive) without create', async () => {
    setAuthListUsers([
      { id: 'u-existing', email: 'foo@example.com' },
      { id: 'u-other', email: 'other@example.com' },
    ]);
    const r = await resolveUserIdByEmail({
      email: 'FOO@EXAMPLE.COM',
      create: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe('u-existing');
      expect(r.created).toBe(false);
    }
  });

  it('returns 404 when not found and create=false', async () => {
    setAuthListUsers([{ id: 'u-1', email: 'foo@example.com' }]);
    const r = await resolveUserIdByEmail({
      email: 'missing@example.com',
      create: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it('creates a new user when create=true and not found', async () => {
    // findOrCreateUserByEmail uses listUsers internally to build its emailMap
    setAuthListUsers([]);
    setCreateUserResult({
      data: {
        user: {
          id: 'u-new',
          email: 'new@example.com',
          user_metadata: { role: 'player' },
          created_at: '2026-01-01T00:00:00.000Z',
        } as any,
      },
      error: null,
    });
    const r = await resolveUserIdByEmail({
      email: 'new@example.com',
      create: true,
      defaultRole: 'player',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe('u-new');
      expect(r.created).toBe(true);
    }
  });

  it('reuses an existing user when create=true and email already known', async () => {
    setAuthListUsers([{ id: 'u-existing', email: 'foo@example.com' }]);
    const r = await resolveUserIdByEmail({
      email: 'foo@example.com',
      create: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe('u-existing');
      expect(r.created).toBe(false);
    }
  });
});

/* -----------------------------------------------------------
 * insertTeamMember
 * ---------------------------------------------------------*/

describe('insertTeamMember', () => {
  beforeEach(() => {
    store.team_members = [] as any;
    store.tournament_teams = [] as any;
  });

  it('inserts a new member and returns the id', async () => {
    const r = await insertTeamMember({
      tenantId: TENANT_ID,
      teamId: 'team-1',
      userId: 'u-1',
      role: 'player',
      battleTag: 'Player#1234',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.memberId).toBeTruthy();
      expect((store.team_members as any[]).length).toBe(1);
      expect((store.team_members as any[])[0]).toMatchObject({
        team_id: 'team-1',
        user_id: 'u-1',
        role: 'player',
        battle_tag: 'Player#1234',
      });
    }
  });

  it('carries specialty into the inserted row when provided', async () => {
    const r = await insertTeamMember({
      tenantId: TENANT_ID,
      teamId: 'team-1',
      userId: 'u-1',
      role: 'player',
      battleTag: 'Player#1234',
      specialty: 'support',
    });
    expect(r.ok).toBe(true);
    expect((store.team_members as any[])[0]).toMatchObject({
      user_id: 'u-1',
      role: 'player',
      specialty: 'support',
    });
  });

  it('omits specialty from payload when null/undefined', async () => {
    const r = await insertTeamMember({
      tenantId: TENANT_ID,
      teamId: 'team-1',
      userId: 'u-1',
      role: 'player',
      specialty: null,
    });
    expect(r.ok).toBe(true);
    expect((store.team_members as any[])[0].specialty).toBeUndefined();
  });

  it('omits battle_tag from payload when not provided (Discord endpoint)', async () => {
    const r = await insertTeamMember({
      tenantId: TENANT_ID,
      teamId: 'team-1',
      userId: 'u-1',
      role: 'player',
    });
    expect(r.ok).toBe(true);
    expect((store.team_members as any[])[0].battle_tag).toBeUndefined();
  });

  it('flags is_substitute when the role is substitute', async () => {
    const r = await insertTeamMember({
      tenantId: TENANT_ID,
      teamId: 'team-1',
      userId: 'u-1',
      role: 'substitute',
      battleTag: 'Sub#1234',
    });
    expect(r.ok).toBe(true);
    expect((store.team_members as any[])[0]).toMatchObject({
      role: 'substitute',
      is_substitute: true,
    });
  });

  it('does not flag is_substitute for a plain player', async () => {
    await insertTeamMember({
      tenantId: TENANT_ID,
      teamId: 'team-1',
      userId: 'u-1',
      role: 'player',
      battleTag: 'Player#1234',
    });
    expect((store.team_members as any[])[0].is_substitute).toBeUndefined();
  });

  describe('with enforceMaxPlayersPreCheck', () => {
    it('rejects with isMaxPlayersViolation when team is at limit', async () => {
      store.team_members = [
        { id: 'm1', tenant_id: TENANT_ID, team_id: 'team-1', role: 'player' },
        { id: 'm2', tenant_id: TENANT_ID, team_id: 'team-1', role: 'player' },
      ] as any;
      store.tournament_teams = [
        {
          tenant_id: TENANT_ID,
          team_id: 'team-1',
          tournament_id: 'tour-1',
          tournaments: { max_players: 2 },
        },
      ] as any;
      const r = await insertTeamMember({
        tenantId: TENANT_ID,
        teamId: 'team-1',
        userId: 'u-new',
        role: 'player',
        battleTag: 'New#1234',
        enforceMaxPlayersPreCheck: true,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.isMaxPlayersViolation).toBe(true);
        expect(r.status).toBe(400);
      }
      // Pas insere
      expect((store.team_members as any[]).length).toBe(2);
    });

    it('skips the check when adding a coach (coachs ne comptent pas)', async () => {
      store.team_members = [
        { id: 'm1', tenant_id: TENANT_ID, team_id: 'team-1', role: 'player' },
        { id: 'm2', tenant_id: TENANT_ID, team_id: 'team-1', role: 'player' },
      ] as any;
      store.tournament_teams = [
        {
          tenant_id: TENANT_ID,
          team_id: 'team-1',
          tournament_id: 'tour-1',
          tournaments: { max_players: 2 },
        },
      ] as any;
      const r = await insertTeamMember({
        tenantId: TENANT_ID,
        teamId: 'team-1',
        userId: 'u-coach',
        role: 'coach',
        enforceMaxPlayersPreCheck: true,
      });
      expect(r.ok).toBe(true);
    });

    it('does not count coaches against the limit', async () => {
      store.team_members = [
        { id: 'm1', tenant_id: TENANT_ID, team_id: 'team-1', role: 'coach' },
        { id: 'm2', tenant_id: TENANT_ID, team_id: 'team-1', role: 'coach' },
      ] as any;
      store.tournament_teams = [
        {
          tenant_id: TENANT_ID,
          team_id: 'team-1',
          tournament_id: 'tour-1',
          tournaments: { max_players: 1 },
        },
      ] as any;
      const r = await insertTeamMember({
        tenantId: TENANT_ID,
        teamId: 'team-1',
        userId: 'u-new',
        role: 'player',
        enforceMaxPlayersPreCheck: true,
      });
      // 0 non-coach membres + 1 nouveau = 1, sous la limite de 1
      expect(r.ok).toBe(true);
    });

    it('passes when enforceMaxPlayersPreCheck is false (Discord)', async () => {
      store.team_members = [
        { id: 'm1', tenant_id: TENANT_ID, team_id: 'team-1', role: 'player' },
        { id: 'm2', tenant_id: TENANT_ID, team_id: 'team-1', role: 'player' },
      ] as any;
      store.tournament_teams = [
        {
          tenant_id: TENANT_ID,
          team_id: 'team-1',
          tournament_id: 'tour-1',
          tournaments: { max_players: 2 },
        },
      ] as any;
      const r = await insertTeamMember({
        tenantId: TENANT_ID,
        teamId: 'team-1',
        userId: 'u-new',
        role: 'player',
        // pas de enforceMaxPlayersPreCheck
      });
      expect(r.ok).toBe(true);
    });
  });
});

/* -----------------------------------------------------------
 * setTeamCaptain
 * ---------------------------------------------------------*/

describe('setTeamCaptain', () => {
  beforeEach(() => {
    store.teams = [
      { id: 'team-1', captain_id: null },
      { id: 'team-2', captain_id: 'u-old' },
    ] as any;
  });

  it('updates the team captain_id', async () => {
    const r = await setTeamCaptain(
      'team-1',
      'u-new',
      'ce69a726-773e-4d12-b5eb-d2503aa752b4'
    );
    expect(r.ok).toBe(true);
    const t = (store.teams as any[]).find((x) => x.id === 'team-1');
    expect(t.captain_id).toBe('u-new');
  });

  it('overwrites an existing captain', async () => {
    const r = await setTeamCaptain(
      'team-2',
      'u-new',
      'ce69a726-773e-4d12-b5eb-d2503aa752b4'
    );
    expect(r.ok).toBe(true);
    const t = (store.teams as any[]).find((x) => x.id === 'team-2');
    expect(t.captain_id).toBe('u-new');
  });
});
