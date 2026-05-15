// tests/unit/utilsBotRoleSync.test.ts
// Tests pour utils/botRoleSync.ts — résolution authUserId → SnapshotUser.
// Critique parce que le bot rejette les events qui ne portent pas
// { discordUserId, team: {discordRoleId, isCaptain, ...} }. Si ce helper
// renvoie le mauvais shape, le role-sync push events redeviennent silencieux.

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  resolveRoleSyncUser,
  resolvePreviousTeamRoleId,
} from '../../utils/botRoleSync';

const AUTH_ID = 'user-1';
const DISCORD_ID = '900000000000000001';
const TEAM_ID = '550e8400-e29b-41d4-a716-446655440b01';

beforeEach(() => {
  resetSupabaseMock();
});

describe('resolveRoleSyncUser', () => {
  it('returns null when user has no Discord link', async () => {
    store.user_discord_links = [];
    const result = await resolveRoleSyncUser(AUTH_ID);
    expect(result).toBeNull();
  });

  it('returns user with team=null when not in a team', async () => {
    store.user_discord_links = [
      {
        auth_user_id: AUTH_ID,
        discord_user_id: DISCORD_ID,
        discord_username: 'alice',
      },
    ] as any;
    store.team_members = [];
    const result = await resolveRoleSyncUser(AUTH_ID);
    expect(result).not.toBeNull();
    expect(result!.discordUserId).toBe(DISCORD_ID);
    expect(result!.team).toBeNull();
    expect(result!.staffRole).toBeNull();
  });

  it('returns full team shape with isCaptain=true when user is captain', async () => {
    store.user_discord_links = [
      {
        auth_user_id: AUTH_ID,
        discord_user_id: DISCORD_ID,
        discord_username: 'alice',
      },
    ] as any;
    store.team_members = [
      {
        team_id: TEAM_ID,
        user_id: AUTH_ID,
        role: 'tank',
        is_substitute: false,
        team: {
          id: TEAM_ID,
          name: 'Phoenix',
          captain_id: AUTH_ID,
          discord_role_id: '1234567890',
        },
      },
    ] as any;
    const result = await resolveRoleSyncUser(AUTH_ID);
    expect(result).not.toBeNull();
    expect(result!.team).toEqual({
      id: TEAM_ID,
      name: 'Phoenix',
      discordRoleId: '1234567890',
      isCaptain: true,
      isSubstitute: false,
      role: 'tank',
    });
  });

  it('returns isCaptain=false when user is not captain of their team', async () => {
    store.user_discord_links = [
      {
        auth_user_id: AUTH_ID,
        discord_user_id: DISCORD_ID,
      },
    ] as any;
    store.team_members = [
      {
        team_id: TEAM_ID,
        user_id: AUTH_ID,
        role: 'support',
        is_substitute: false,
        team: {
          id: TEAM_ID,
          name: 'Phoenix',
          captain_id: 'someone-else',
          discord_role_id: '1234567890',
        },
      },
    ] as any;
    const result = await resolveRoleSyncUser(AUTH_ID);
    expect(result!.team!.isCaptain).toBe(false);
  });

  it('attaches staffRole when user is in staff table', async () => {
    store.user_discord_links = [
      { auth_user_id: AUTH_ID, discord_user_id: DISCORD_ID },
    ] as any;
    store.team_members = [];
    store.staff = [{ auth_user_id: AUTH_ID, role: 'admin' }] as any;
    const result = await resolveRoleSyncUser(AUTH_ID);
    expect(result!.staffRole).toBe('admin');
  });

  it('returns null when user is not in user_discord_links table', async () => {
    store.user_discord_links = [
      { auth_user_id: 'someone-else', discord_user_id: '111' },
    ] as any;
    const result = await resolveRoleSyncUser(AUTH_ID);
    expect(result).toBeNull();
  });
});

describe('resolvePreviousTeamRoleId', () => {
  it('returns discord_role_id of the team', async () => {
    store.teams = [
      { id: TEAM_ID, discord_role_id: 'role-123' },
    ] as any;
    const result = await resolvePreviousTeamRoleId(TEAM_ID);
    expect(result).toBe('role-123');
  });

  it('returns null when team not found', async () => {
    store.teams = [];
    const result = await resolvePreviousTeamRoleId(TEAM_ID);
    expect(result).toBeNull();
  });

  it('returns null when team has no discord_role_id', async () => {
    store.teams = [{ id: TEAM_ID, discord_role_id: null }] as any;
    const result = await resolvePreviousTeamRoleId(TEAM_ID);
    expect(result).toBeNull();
  });
});
