// tests/unit/freePlayersList.test.ts
//
// GET /api/teams/free-players — captain gate, excludes caller + already-teamed,
// enrichment shape.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
  setRpcResult,
} from './__helpers__/supabaseMock';
import freePlayersHandler from '../../pages/api/teams/free-players';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NON_CAPTAIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const FP_LINKED = 'dddddddd-dddd-dddd-dddd-dddddddddddd'; // linked, free
const FP_TEAMED = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; // linked but on a team

const D_LINKED = '200000000000000001';
const D_TEAMED = '200000000000000002';
const D_UNLINKED = '200000000000000003';
const D_CAPTAIN = '200000000000000004';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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

function seedTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'captain',
    },
    {
      id: 'tm-teamed',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: FP_TEAMED,
      role: 'player',
    },
  ] as any;
  store.free_players = [
    {
      id: 'fp-linked',
      tenant_id: CONFERENCE_TENANT_ID,
      discord_user_id: D_LINKED,
      discord_username: 'linked-user',
      auth_user_id: FP_LINKED,
    },
    {
      id: 'fp-teamed',
      tenant_id: CONFERENCE_TENANT_ID,
      discord_user_id: D_TEAMED,
      discord_username: 'teamed-user',
      auth_user_id: FP_TEAMED,
    },
    {
      id: 'fp-unlinked',
      tenant_id: CONFERENCE_TENANT_ID,
      discord_user_id: D_UNLINKED,
      discord_username: 'unlinked-user',
      auth_user_id: null,
    },
    {
      id: 'fp-self',
      tenant_id: CONFERENCE_TENANT_ID,
      discord_user_id: D_CAPTAIN,
      discord_username: 'captain-also-free',
      auth_user_id: CAPTAIN_ID,
    },
  ] as any;
  // L'enrichissement passe par la RPC `admin_get_user_profiles` et NON par une
  // table `profiles` : celle-ci n'existe pas en base (tout le profil vit dans
  // `auth.users.raw_user_meta_data`). L'ancienne fixture `store.profiles`
  // faisait passer le test en validant un mock plutôt que la réalité — en
  // production, le nom de CHAQUE joueuse revenait à null.
  setRpcResult('admin_get_user_profiles', {
    data: [
      {
        id: FP_LINKED,
        email: 'linked@example.com',
        display_name: 'Linked Display',
        full_name: null,
        avatar_url: null,
        battle_tag: 'Linked#1234',
        discord: null,
      },
    ],
  });
}

beforeEach(() => {
  resetSupabaseMock();
  seedTeam();
});

describe('GET /api/teams/free-players', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await freePlayersHandler(
      { ...makeAuthedReq(), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('403 for a non-captain / non-manager', async () => {
    setAuthUser({ id: NON_CAPTAIN_ID });
    const res = makeRes();
    await freePlayersHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 on non-GET', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await freePlayersHandler(makeAuthedReq({}, 'POST'), res);
    expect(res.statusCode).toBe(405);
  });

  it('captain gets free players, excluding self + already-teamed', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await freePlayersHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(200);

    const players = (res.body as any).players as any[];
    const ids = players.map((p) => p.discordUserId).sort();
    // Kept: linked (free) + unlinked. Excluded: teamed + self(captain).
    expect(ids).toEqual([D_LINKED, D_UNLINKED].sort());
  });

  it('enriches linked rows via admin_get_user_profiles and degrades for unlinked', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await freePlayersHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(200);

    const players = (res.body as any).players as any[];
    const linked = players.find((p) => p.discordUserId === D_LINKED);
    expect(linked).toMatchObject({
      discordUserId: D_LINKED,
      discordUsername: 'linked-user',
      linked: true,
      authUserId: FP_LINKED,
      displayName: 'Linked Display',
      battleTag: 'Linked#1234',
      specialty: null,
    });

    const unlinked = players.find((p) => p.discordUserId === D_UNLINKED);
    expect(unlinked).toMatchObject({
      discordUserId: D_UNLINKED,
      discordUsername: 'unlinked-user',
      linked: false,
      authUserId: null,
      displayName: null,
      battleTag: null,
      specialty: null,
    });
  });
});
