// tests/unit/apiBotReconcileTeamChannels.test.ts
//
// GET /api/bot/v1/reconcile/team-channels — cron de réconciliation Discord.
// Couvre : filtre active-only (is_active + deleted_at), mapping des membres
// (dont le flag capitaine + substitute), omission des membres non liés à
// Discord, dédup, résolution du capitaine, et pagination limit/offset.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/reconcile/team-channels';

const TEAM_A = '550e8400-e29b-41d4-a716-446655440c01';
const TEAM_B = '550e8400-e29b-41d4-a716-446655440c02';
const TEAM_INACTIVE = '550e8400-e29b-41d4-a716-446655440c03';
const TEAM_DELETED = '550e8400-e29b-41d4-a716-446655440c04';

function makeBotReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();

  store.teams = [
    {
      id: TEAM_A,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      slug: 'alpha',
      is_active: true,
      deleted_at: null,
      discord_role_id: 'role-a',
      discord_channel_id: 'chan-a',
      discord_voice_channel_id: 'voice-a',
      captain_id: 'user-cap-a',
    },
    {
      id: TEAM_B,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Bravo',
      slug: 'bravo',
      is_active: true,
      deleted_at: null,
      discord_role_id: null,
      discord_channel_id: null,
      discord_voice_channel_id: null,
      // captain has no Discord link
      captain_id: 'user-cap-b',
    },
    {
      id: TEAM_INACTIVE,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Inactive',
      slug: 'inactive',
      is_active: false,
      deleted_at: null,
      discord_role_id: 'role-x',
      discord_channel_id: 'chan-x',
      discord_voice_channel_id: 'voice-x',
      captain_id: 'user-cap-a',
    },
    {
      id: TEAM_DELETED,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Deleted',
      slug: 'deleted',
      is_active: true,
      deleted_at: '2026-01-01T00:00:00.000Z',
      discord_role_id: 'role-y',
      discord_channel_id: 'chan-y',
      discord_voice_channel_id: 'voice-y',
      captain_id: 'user-cap-a',
    },
  ] as any;

  store.team_members = [
    // Team A: captain (linked) + one regular member (linked) + one substitute
    // (linked) + one unlinked member (must be omitted) + a duplicate of the
    // captain user (dedup by discordUserId).
    {
      id: 'tm-a-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: 'user-cap-a',
      role: 'captain',
      is_substitute: false,
    },
    {
      id: 'tm-a-mem',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: 'user-mem-a',
      role: 'player',
      is_substitute: false,
    },
    {
      id: 'tm-a-sub',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: 'user-sub-a',
      role: 'player',
      is_substitute: true,
    },
    {
      id: 'tm-a-unlinked',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: 'user-unlinked-a',
      role: 'player',
      is_substitute: false,
    },
    {
      id: 'tm-a-cap-dup',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: 'user-cap-a',
      role: 'captain',
      is_substitute: false,
    },
    // Team B: one linked member; captain (user-cap-b) is unlinked.
    {
      id: 'tm-b-mem',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_B,
      user_id: 'user-mem-b',
      role: 'player',
      is_substitute: false,
    },
  ] as any;

  // user_discord_links is GLOBAL — no tenant_id column.
  store.user_discord_links = [
    { auth_user_id: 'user-cap-a', discord_user_id: 'discord-cap-a' },
    { auth_user_id: 'user-mem-a', discord_user_id: 'discord-mem-a' },
    { auth_user_id: 'user-sub-a', discord_user_id: 'discord-sub-a' },
    { auth_user_id: 'user-mem-b', discord_user_id: 'discord-mem-b' },
    // user-unlinked-a and user-cap-b intentionally have NO link.
  ] as any;
});

describe('GET /api/bot/v1/reconcile/team-channels', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler({ ...makeBotReq(), headers: { host: 'h' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await handler(makeBotReq({}, 'POST'), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns only active, non-deleted teams', async () => {
    const res = makeRes();
    await handler(makeBotReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    const slugs = body.teams.map((t: any) => t.slug).sort();
    expect(slugs).toEqual(['alpha', 'bravo']);
    expect(body.count).toBe(2);
    expect(body.limit).toBe(200);
    expect(body.offset).toBe(0);
  });

  it('exposes discord ids + captain discord id', async () => {
    const res = makeRes();
    await handler(makeBotReq(), res);
    const body = res.body as any;
    const alpha = body.teams.find((t: any) => t.slug === 'alpha');
    expect(alpha.teamId).toBe(TEAM_A);
    expect(alpha.discordRoleId).toBe('role-a');
    expect(alpha.discordChannelId).toBe('chan-a');
    expect(alpha.discordVoiceChannelId).toBe('voice-a');
    expect(alpha.captainDiscordUserId).toBe('discord-cap-a');
  });

  it('captainDiscordUserId is null when captain not Discord-linked', async () => {
    const res = makeRes();
    await handler(makeBotReq(), res);
    const body = res.body as any;
    const bravo = body.teams.find((t: any) => t.slug === 'bravo');
    expect(bravo.captainDiscordUserId).toBeNull();
    expect(bravo.discordRoleId).toBeNull();
    expect(bravo.discordChannelId).toBeNull();
    expect(bravo.discordVoiceChannelId).toBeNull();
  });

  it('maps members with captain + substitute flags, omits unlinked, dedupes', async () => {
    const res = makeRes();
    await handler(makeBotReq(), res);
    const body = res.body as any;
    const alpha = body.teams.find((t: any) => t.slug === 'alpha');

    // 3 unique linked members (captain, regular, sub); unlinked omitted; dup collapsed.
    expect(alpha.members).toHaveLength(3);

    const byId = Object.fromEntries(
      alpha.members.map((m: any) => [m.discordUserId, m])
    );
    expect(byId['discord-cap-a']).toEqual({
      discordUserId: 'discord-cap-a',
      isCaptain: true,
      isSubstitute: false,
    });
    expect(byId['discord-mem-a']).toEqual({
      discordUserId: 'discord-mem-a',
      isCaptain: false,
      isSubstitute: false,
    });
    expect(byId['discord-sub-a']).toEqual({
      discordUserId: 'discord-sub-a',
      isCaptain: false,
      isSubstitute: true,
    });
    // The unlinked member must not appear.
    const discordIds = alpha.members.map((m: any) => m.discordUserId);
    expect(discordIds).not.toContain(undefined);
  });

  it('omits members with no Discord link (team B captain unlinked)', async () => {
    const res = makeRes();
    await handler(makeBotReq(), res);
    const body = res.body as any;
    const bravo = body.teams.find((t: any) => t.slug === 'bravo');
    expect(bravo.members).toHaveLength(1);
    expect(bravo.members[0].discordUserId).toBe('discord-mem-b');
    expect(bravo.members[0].isCaptain).toBe(false);
  });

  it('respects pagination limit', async () => {
    const res = makeRes();
    await handler(makeBotReq({ query: { limit: '1' } }), res);
    const body = res.body as any;
    expect(body.teams).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.limit).toBe(1);
  });

  it('respects pagination offset', async () => {
    const first = makeRes();
    await handler(makeBotReq({ query: { limit: '1', offset: '0' } }), first);
    const second = makeRes();
    await handler(makeBotReq({ query: { limit: '1', offset: '1' } }), second);
    const firstSlug = (first.body as any).teams[0].slug;
    const secondSlug = (second.body as any).teams[0].slug;
    expect(firstSlug).not.toBe(secondSlug);
    expect((second.body as any).offset).toBe(1);
  });

  it('tournamentInProgress is false when no running tournament', async () => {
    const res = makeRes();
    await handler(makeBotReq(), res);
    expect((res.body as any).tournamentInProgress).toBe(false);
  });

  it('tournamentInProgress is true when a running tournament exists for the tenant', async () => {
    store.tournaments = [
      { id: 't-run', tenant_id: CONFERENCE_TENANT_ID, status: 'running' },
      { id: 't-done', tenant_id: CONFERENCE_TENANT_ID, status: 'completed' },
    ] as any;
    const res = makeRes();
    await handler(makeBotReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournamentInProgress).toBe(true);
  });

  it('tournamentInProgress ignores running tournaments of OTHER tenants', async () => {
    store.tournaments = [
      { id: 't-other', tenant_id: 'some-other-tenant', status: 'running' },
    ] as any;
    const res = makeRes();
    await handler(makeBotReq(), res);
    expect((res.body as any).tournamentInProgress).toBe(false);
  });
});
