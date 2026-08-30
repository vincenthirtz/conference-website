// Tests pour /api/admin/discord/team-channels.
//
// Cette route remplace le cron `team-channel-reconcile`, supprimé après avoir
// détruit les salons d'une équipe vivante puis recréé des salons dont personne
// ne voulait. Ce qu'on protège ici, c'est ce qui a manqué à ce cron :
//
//   - chaque action est un geste NOMMÉ, jamais un « réconcilie » qui laisse la
//     machine décider ;
//   - une action inconnue est refusée plutôt qu'interprétée ;
//   - le contexte Discord voyage avec l'événement, pour que le bot n'ait pas à
//     rappeler le site et à travailler sur une vue périmée ;
//   - une équipe d'un AUTRE tenant est introuvable, pas silencieusement servie.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({
    delivered: true,
    status: 200,
    attempts: 1,
  })),
}));

import { emitBotEvent } from '@/utils/botEvents';
import handler from '../../pages/api/admin/discord/team-channels';

const TEAM_A = '550e8400-e29b-41d4-a716-446655440c01';
const OTHER_TENANT_TEAM = '550e8400-e29b-41d4-a716-446655440c02';
const USER = '123456789012345678';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _t = 0;
function freshBearer() {
  _t += 1;
  return `Bearer t-${Date.now()}-${_t}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      slug: 'alpha',
      is_active: true,
      deleted_at: null,
      discord_role_id: 'role-a',
      discord_channel_id: 'text-a',
      discord_voice_channel_id: 'voice-a',
    },
    {
      id: OTHER_TENANT_TEAM,
      tenant_id: '550e8400-e29b-41d4-a716-4466554400ff',
      name: 'Ailleurs',
      slug: 'ailleurs',
      is_active: true,
      deleted_at: null,
      discord_role_id: null,
      discord_channel_id: null,
      discord_voice_channel_id: null,
    },
  ] as any;
  store.team_discord_channels = [] as any;
  (emitBotEvent as any).mockClear();
});

describe('GET /api/admin/discord/team-channels', () => {
  it('rend le stocké ET le vu, `live` null quand jamais rafraîchi', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const team = (res.body as any).teams.find((t: any) => t.teamId === TEAM_A);
    expect(team.stored.textChannelId).toBe('text-a');
    // Jamais rafraîchi : on ne prétend pas savoir si le salon répond encore.
    expect(team.live).toBeNull();
  });

  it('expose la photo du bot quand elle existe', async () => {
    store.team_discord_channels = [
      {
        team_id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        role_id: 'role-a',
        role_name: 'Alpha',
        role_exists: true,
        text_channel_id: 'text-a',
        text_channel_name: 'alpha',
        text_channel_exists: false,
        voice_channel_id: 'voice-a',
        voice_channel_name: null,
        voice_channel_exists: true,
        access: [{ discordUserId: USER, username: 'x', source: 'role' }],
        warnings: ['Le salon texte enregistré n’existe plus.'],
        captured_at: '2026-08-30T10:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);

    const team = (res.body as any).teams.find((t: any) => t.teamId === TEAM_A);
    // L'id est là ET le salon n'existe plus : c'est le cas qui intéresse.
    expect(team.stored.textChannelId).toBe('text-a');
    expect(team.live.textChannelExists).toBe(false);
    expect(team.live.access).toHaveLength(1);
    expect(team.live.warnings[0]).toMatch(/texte/);
  });
});

describe('GET — le roster du site en regard de l’accès Discord', () => {
  const USER_IN = '111111111111111111';
  const USER_OUT = '222222222222222222';

  beforeEach(() => {
    store.team_members = [
      {
        team_id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: 'auth-in',
        role: 'player',
        battle_tag: 'In#1111',
        display_name: null,
      },
      {
        team_id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: 'auth-out',
        role: 'player',
        battle_tag: 'Out#2222',
        display_name: null,
      },
      {
        team_id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: 'auth-nodiscord',
        role: 'coach',
        battle_tag: null,
        display_name: 'Sans Discord',
      },
    ] as any;
    store.user_discord_links = [
      { auth_user_id: 'auth-in', discord_user_id: USER_IN },
      { auth_user_id: 'auth-out', discord_user_id: USER_OUT },
    ] as any;
  });

  it('dit qui a accès, qui ne l’a pas, et qui est hors de portée', async () => {
    store.team_discord_channels = [
      {
        team_id: TEAM_A,
        tenant_id: CONFERENCE_TENANT_ID,
        role_id: 'role-a',
        role_exists: true,
        text_channel_id: 'text-a',
        text_channel_exists: true,
        voice_channel_id: 'voice-a',
        voice_channel_exists: true,
        access: [{ discordUserId: USER_IN, username: 'in', source: 'role' }],
        warnings: [],
        captured_at: '2026-08-30T10:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);

    const roster = (res.body as any).teams.find(
      (t: any) => t.teamId === TEAM_A
    ).roster;
    const byTag = Object.fromEntries(roster.map((r: any) => [r.label, r]));

    expect(byTag['In#1111'].hasAccess).toBe(true);
    expect(byTag['Out#2222'].hasAccess).toBe(false);
    // Sans compte Discord lié, le bot ne peut rien : l'écran doit le dire au
    // lieu de proposer un bouton qui ne marchera pas.
    expect(byTag['Sans Discord'].discordUserId).toBeNull();
  });

  it('sans photo, `hasAccess` est null — on ne devine pas', async () => {
    store.team_discord_channels = [] as any;
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);

    const roster = (res.body as any).teams.find(
      (t: any) => t.teamId === TEAM_A
    ).roster;
    expect(roster.every((r: any) => r.hasAccess === null)).toBe(true);
  });
});

describe('POST — chaque action est un geste nommé', () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ action: 'refresh' }, 'team.channels.snapshot.request'],
    [{ action: 'provision', teamId: TEAM_A }, 'team.channels.provision'],
    [{ action: 'repair', teamId: TEAM_A }, 'team.channels.repair'],
    [
      { action: 'delete-channel', teamId: TEAM_A, channel: 'voice' },
      'team.channel.deleted',
    ],
    [{ action: 'delete-role', teamId: TEAM_A }, 'team.role.deleted'],
    [
      {
        action: 'grant-access',
        teamId: TEAM_A,
        channel: 'text',
        discordUserId: USER,
      },
      'team.channel.access.granted',
    ],
    [
      {
        action: 'revoke-access',
        teamId: TEAM_A,
        channel: 'text',
        discordUserId: USER,
      },
      'team.channel.access.revoked',
    ],
    [
      { action: 'grant-role', teamId: TEAM_A, discordUserId: USER },
      'team.role.granted',
    ],
    [
      { action: 'revoke-role', teamId: TEAM_A, discordUserId: USER },
      'team.role.revoked',
    ],
  ];

  for (const [body, expectedEvent] of cases) {
    it(`${body.action} → ${expectedEvent}`, async () => {
      const res = makeRes();
      await handler(makeReq({ body }), res);

      expect(res.statusCode).toBe(202);
      expect(emitBotEvent).toHaveBeenCalledTimes(1);
      expect((emitBotEvent as any).mock.calls[0][0]).toBe(expectedEvent);
    });
  }

  it('le contexte Discord voyage AVEC l’événement', async () => {
    // Un aller-retour de moins pour le bot, donc une occasion de moins de
    // travailler sur une vue périmée.
    const res = makeRes();
    await handler(
      makeReq({ body: { action: 'provision', teamId: TEAM_A } }),
      res
    );

    const payload = (emitBotEvent as any).mock.calls[0][1];
    expect(payload.teams).toHaveLength(1);
    expect(payload.teams[0]).toMatchObject({
      teamId: TEAM_A,
      name: 'Alpha',
      discordRoleId: 'role-a',
      discordChannelId: 'text-a',
      discordVoiceChannelId: 'voice-a',
    });
    expect(payload.requestedByStaffId).toBe('staff-1');
  });

  it('refresh sans teamId porte TOUT le tenant, et lui seul', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { action: 'refresh' } }), res);

    const payload = (emitBotEvent as any).mock.calls[0][1];
    const ids = payload.teams.map((t: any) => t.teamId);
    expect(ids).toContain(TEAM_A);
    expect(ids).not.toContain(OTHER_TENANT_TEAM);
  });

  it('refuse une action inconnue au lieu de l’interpréter', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { action: 'reconcile', teamId: TEAM_A } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('refuse un ID Discord mal formé', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { action: 'grant-role', teamId: TEAM_A, discordUserId: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('une équipe d’un autre tenant est introuvable', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { action: 'provision', teamId: OTHER_TENANT_TEAM } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });
});
