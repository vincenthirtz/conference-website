// Tests for utils/teams/invitations.ts — the invite-accept lifecycle reused by
// the Discord bot AND the web team-creation flows.
//
// Covers the gap that previously had no direct unit coverage:
//   - createInvitation guards (captain≠invitee, duplicate-pending blocked,
//     already-member blocked, BattleTag format, web-origin source/specialty)
//   - acceptInvitation (only invitee accepts; expiry → 410 + auto-cancel;
//     one-team check; inserts member with role + specialty; demande→approved)
//   - rejectInvitation / cancelInvitation authz
//   - listPendingInvitationsForUser (fresh only)
//
// Uses the shared in-memory supabaseMock harness.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  createInvitation,
  acceptInvitation,
  rejectInvitation,
  cancelInvitation,
  listPendingInvitationsForUser,
  INVITATION_EXPIRY_DAYS,
} from '../../utils/teams/invitations';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TEAM = 'team-1';
const CAPTAIN = 'captain-1';
const INVITEE = 'invitee-1';

function isoIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  resetSupabaseMock();
  store.team_members = [] as any;
  store.demandes = [] as any;
  store.tournament_teams = [] as any;
  store.tournaments = [] as any;
  store.teams = [{ id: TEAM, tenant_id: TENANT, captain_id: CAPTAIN }] as any;
});

/* -----------------------------------------------------------
 * createInvitation
 * ---------------------------------------------------------*/

describe('createInvitation', () => {
  it('creates a pending invite (website source) with role + specialty + battle_tag', async () => {
    const r = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      inviteeAuthUserId: INVITEE,
      role: 'player',
      battleTag: 'Inv#1234',
      specialty: 'support',
      source: 'website',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = (store.demandes as any[]).find((d) => d.id === r.data.id);
      expect(row.type).toBe('invite');
      expect(row.status).toBe('pending');
      expect(row.user_id).toBe(INVITEE);
      expect(row.team_id).toBe(TEAM);
      expect(row.source).toBe('website');
      expect(row.payload.captain_auth_user_id).toBe(CAPTAIN);
      expect(row.payload.desired_role).toBe('player');
      expect(row.payload.specialty).toBe('support');
      expect(row.payload.battle_tag).toBe('Inv#1234');
      // Web invites carry no Discord ids (null, not undefined).
      expect(row.payload.captain_discord_user_id).toBeNull();
      expect(row.payload.invitee_discord_user_id).toBeNull();
      // 7-day expiry (default).
      const days =
        (Date.parse(row.payload.expires_at) - Date.now()) /
        (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(INVITATION_EXPIRY_DAYS);
    }
  });

  it('keeps the discord_bot source + Discord ids for bot callers', async () => {
    const r = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      captainDiscordUserId: '111',
      inviteeAuthUserId: INVITEE,
      inviteeDiscordUserId: '222',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = (store.demandes as any[]).find((d) => d.id === r.data.id);
      expect(row.source).toBe('discord_bot');
      expect(row.payload.captain_discord_user_id).toBe('111');
      expect(row.payload.invitee_discord_user_id).toBe('222');
    }
  });

  it('rejects when captain === invitee (400)', async () => {
    const r = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      inviteeAuthUserId: CAPTAIN,
      source: 'website',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('rejects an invalid BattleTag (400)', async () => {
    const r = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      inviteeAuthUserId: INVITEE,
      battleTag: 'no_hash',
      source: 'website',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('blocks when the invitee is already a member of the team (400)', async () => {
    store.team_members = [
      { id: 'm1', tenant_id: TENANT, team_id: TEAM, user_id: INVITEE },
    ] as any;
    const r = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      inviteeAuthUserId: INVITEE,
      source: 'website',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('blocks a duplicate pending invite for the same (team, invitee) (409)', async () => {
    const first = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      inviteeAuthUserId: INVITEE,
      source: 'website',
    });
    expect(first.ok).toBe(true);
    const second = await createInvitation(TENANT, {
      teamId: TEAM,
      captainAuthUserId: CAPTAIN,
      inviteeAuthUserId: INVITEE,
      source: 'website',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.status).toBe(409);
  });
});

/* -----------------------------------------------------------
 * acceptInvitation
 * ---------------------------------------------------------*/

describe('acceptInvitation', () => {
  function seedPending(payloadOver: Record<string, unknown> = {}): string {
    const id = 'dem-accept';
    (store.demandes as any[]).push({
      id,
      tenant_id: TENANT,
      user_id: INVITEE,
      team_id: TEAM,
      type: 'invite',
      status: 'pending',
      source: 'website',
      payload: {
        captain_auth_user_id: CAPTAIN,
        desired_role: 'player',
        battle_tag: 'Inv#1234',
        specialty: 'support',
        expires_at: isoIn(3),
        ...payloadOver,
      },
      created_at: '2026-01-01T00:00:00.000Z',
    });
    return id;
  }

  it('inserts the member with role + specialty and marks the demande approved', async () => {
    const id = seedPending();
    const r = await acceptInvitation(TENANT, id, INVITEE);
    expect(r.ok).toBe(true);

    const member = (store.team_members as any[]).find(
      (m) => m.team_id === TEAM && m.user_id === INVITEE
    );
    expect(member).toBeTruthy();
    expect(member.role).toBe('player');
    expect(member.specialty).toBe('support');
    expect(member.battle_tag).toBe('Inv#1234');

    const row = (store.demandes as any[]).find((d) => d.id === id);
    expect(row.status).toBe('approved');
    expect(row.processed_at).toBeTruthy();
  });

  it('only the invitee can accept (403 for someone else)', async () => {
    const id = seedPending();
    const r = await acceptInvitation(TENANT, id, 'someone-else');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
    // No membership created.
    expect((store.team_members as any[]).length).toBe(0);
  });

  it('returns 410 and auto-cancels an expired invite', async () => {
    const id = seedPending({ expires_at: isoIn(-1) });
    const r = await acceptInvitation(TENANT, id, INVITEE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(410);
    const row = (store.demandes as any[]).find((d) => d.id === id);
    expect(row.status).toBe('cancelled');
    expect((store.team_members as any[]).length).toBe(0);
  });

  it('blocks when the invitee already belongs to a team (400)', async () => {
    store.team_members = [
      { id: 'm0', tenant_id: TENANT, team_id: 'other-team', user_id: INVITEE },
    ] as any;
    const id = seedPending();
    const r = await acceptInvitation(TENANT, id, INVITEE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('rejects accepting an already-processed invite (409)', async () => {
    const id = seedPending();
    (store.demandes as any[]).find((d) => d.id === id).status = 'approved';
    const r = await acceptInvitation(TENANT, id, INVITEE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });
});

/* -----------------------------------------------------------
 * reject / cancel
 * ---------------------------------------------------------*/

describe('rejectInvitation / cancelInvitation', () => {
  function seed(): string {
    const id = 'dem-rc';
    (store.demandes as any[]).push({
      id,
      tenant_id: TENANT,
      user_id: INVITEE,
      team_id: TEAM,
      type: 'invite',
      status: 'pending',
      source: 'website',
      payload: {
        captain_auth_user_id: CAPTAIN,
        desired_role: 'player',
        battle_tag: null,
        expires_at: isoIn(3),
      },
      created_at: '2026-01-01T00:00:00.000Z',
    });
    return id;
  }

  it('lets the invitee reject (status → rejected)', async () => {
    const id = seed();
    const r = await rejectInvitation(TENANT, id, INVITEE);
    expect(r.ok).toBe(true);
    expect((store.demandes as any[]).find((d) => d.id === id).status).toBe(
      'rejected'
    );
  });

  it('blocks a non-invitee from rejecting (403)', async () => {
    const id = seed();
    const r = await rejectInvitation(TENANT, id, CAPTAIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('lets the captain cancel (status → cancelled)', async () => {
    const id = seed();
    const r = await cancelInvitation(TENANT, id, CAPTAIN);
    expect(r.ok).toBe(true);
    expect((store.demandes as any[]).find((d) => d.id === id).status).toBe(
      'cancelled'
    );
  });

  it('blocks a non-captain from cancelling (403)', async () => {
    const id = seed();
    const r = await cancelInvitation(TENANT, id, INVITEE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});

/* -----------------------------------------------------------
 * listPendingInvitationsForUser
 * ---------------------------------------------------------*/

describe('listPendingInvitationsForUser', () => {
  it('returns only fresh pending invites for the user', async () => {
    store.demandes = [
      {
        id: 'fresh',
        tenant_id: TENANT,
        user_id: INVITEE,
        team_id: TEAM,
        type: 'invite',
        status: 'pending',
        payload: { captain_auth_user_id: CAPTAIN, expires_at: isoIn(3) },
        created_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'expired',
        tenant_id: TENANT,
        user_id: INVITEE,
        team_id: TEAM,
        type: 'invite',
        status: 'pending',
        payload: { captain_auth_user_id: CAPTAIN, expires_at: isoIn(-2) },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'other-user',
        tenant_id: TENANT,
        user_id: 'someone-else',
        team_id: TEAM,
        type: 'invite',
        status: 'pending',
        payload: { captain_auth_user_id: CAPTAIN, expires_at: isoIn(3) },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'approved',
        tenant_id: TENANT,
        user_id: INVITEE,
        team_id: TEAM,
        type: 'invite',
        status: 'approved',
        payload: { captain_auth_user_id: CAPTAIN, expires_at: isoIn(3) },
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const r = await listPendingInvitationsForUser(TENANT, INVITEE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = r.data.map((d) => d.id);
      expect(ids).toContain('fresh');
      expect(ids).not.toContain('expired');
      expect(ids).not.toContain('other-user');
      expect(ids).not.toContain('approved');
    }
  });
});
