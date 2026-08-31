// Unit tests for the aggregated player dashboard endpoint.
//
// Targets pages/api/player/dashboard.ts:
//  - a captain gets the full payload, including captain-only sections
//    (pendingScrims, unreadMessages) and the next-match readiness block.
//  - a plain player (member, not captain/manager) gets the reduced payload:
//    captain-only sections are empty/zero.
//  - a min_players shortfall is reflected in nextMatch.readiness.shortfall.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import dashboardHandler from '../../pages/api/player/dashboard';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OPP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const TOUR_ID = '99999999-9999-9999-9999-999999999999';
const MATCH_ID = '12121212-1212-1212-1212-121212121212';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const futureISO = new Date(Date.now() + 2 * 60 * 60_000).toISOString();

/** Seed a team with `memberCount` members, a tournament with `minPlayers`, and
 *  an upcoming match where TEAM_ID is team1 vs OPP_ID. */
function seed(opts: { minPlayers: number | null; memberCount: number }) {
  store.teams = [
    {
      id: TEAM_ID,
      slug: 'alpha',
      name: 'Alpha',
      short_name: 'ALP',
      logo_url: null,
      country: 'FR',
      description: null,
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
    },
    { id: OPP_ID, name: 'Bravo', captain_id: 'someone', is_active: true },
  ] as any;

  const members: any[] = [];
  // First member is the captain; the rest are plain players.
  members.push({
    id: 'm-cap',
    team_id: TEAM_ID,
    user_id: CAPTAIN_ID,
    role: 'player',
    battle_tag: 'Cap#1',
    specialty: 'tank',
    is_substitute: false,
  });
  for (let i = 1; i < opts.memberCount; i++) {
    members.push({
      id: `m-${i}`,
      team_id: TEAM_ID,
      user_id: i === 1 ? PLAYER_ID : `u-${i}`,
      role: 'player',
      battle_tag: `P${i}#1`,
      specialty: 'dps',
      is_substitute: false,
    });
  }
  store.team_members = members;

  store.tournaments = [
    { id: TOUR_ID, name: 'Cup', slug: 'cup', min_players: opts.minPlayers },
  ] as any;

  store.matches = [
    {
      id: MATCH_ID,
      status: 'pending',
      scheduled_at: futureISO,
      match_format: 'bo3',
      round_name: 'Round 1',
      stream_url: null,
      team1_id: TEAM_ID,
      team2_id: OPP_ID,
      tournament_id: TOUR_ID,
      team1_checkin_token: 'tok-1',
      team2_checkin_token: 'tok-2',
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      team1: { id: TEAM_ID, name: 'Alpha' },
      team2: { id: OPP_ID, name: 'Bravo' },
      tournament: {
        id: TOUR_ID,
        name: 'Cup',
        slug: 'cup',
        min_players: opts.minPlayers,
      },
    },
  ] as any;

  store.demandes = [
    // A pending incoming scrim addressed to TEAM_ID.
    {
      id: 'scrim-1',
      team_id: TEAM_ID,
      user_id: null,
      type: 'scrim',
      status: 'pending',
      source: 'public',
      comment: 'GG?',
      payload: {
        from_team_name: 'Charlie',
        requester_email: 'c@x.tld',
      },
      created_at: new Date().toISOString(),
    },
    // A pending incoming captain_message addressed to TEAM_ID (unread).
    {
      id: 'msg-1',
      team_id: TEAM_ID,
      user_id: 'other-cap',
      type: 'captain_message',
      status: 'pending',
      comment: 'hi',
      payload: {
        conversation_id: 'conv-1',
        from_team_id: OPP_ID,
        from_team_name: 'Bravo',
      },
      created_at: new Date().toISOString(),
    },
    // The captain own join demande (history).
    {
      id: 'join-1',
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      type: 'join',
      status: 'approved',
      comment: null,
      payload: { team_name: 'Alpha' },
      created_at: new Date().toISOString(),
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAdminUser('other-cap', 'other@x.tld', {
    user_metadata: { display_name: 'Other' },
  });
});

describe('/api/player/dashboard', () => {
  it('405 on non-GET', async () => {
    seed({ minPlayers: null, memberCount: 5 });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await dashboardHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('captain gets the full payload incl. readiness', async () => {
    seed({ minPlayers: 5, memberCount: 5 });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await dashboardHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const b = res.body as any;

    expect(b.team?.id).toBe(TEAM_ID);
    expect(b.members).toHaveLength(5);
    expect(b.isCaptain).toBe(true);
    expect(b.isManager).toBe(false);

    // Captain-only sections are populated.
    expect(b.pendingScrims).toHaveLength(1);
    expect(b.pendingScrims[0].payload.from_team_name).toBe('Charlie');
    expect(b.unreadMessages).toBe(1);

    // Demandes split into the two arrays.
    expect(b.demandesJoin).toHaveLength(1);
    expect(b.demandesCaptain).toHaveLength(0);

    // Next match + readiness (roster 5 >= min 5 → no shortfall).
    expect(b.nextMatch.match?.id).toBe(MATCH_ID);
    expect(b.nextMatch.team?.slot).toBe(1);
    expect(b.nextMatch.opponent?.id).toBe(OPP_ID);
    expect(b.nextMatch.readiness).toEqual({
      minPlayers: 5,
      rosterSize: 5,
      shortfall: 0,
    });
    expect(b.nextMatch.checkin?.token).toBe('tok-1');
    expect(b.nextMatch.checkin?.alreadyCheckedIn).toBe(false);
  });

  it('reflects a min_players shortfall in readiness', async () => {
    seed({ minPlayers: 7, memberCount: 4 });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await dashboardHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const b = res.body as any;
    expect(b.nextMatch.readiness).toEqual({
      minPlayers: 7,
      rosterSize: 4,
      shortfall: 3,
    });
  });

  it('batch-enriches pendingScrims senders and skips unknown ids', async () => {
    seed({ minPlayers: 5, memberCount: 5 });
    setAuthUser({ id: CAPTAIN_ID });

    // One auth sender resolvable via the batch admin_get_user_profiles RPC…
    setAuthListUsers([
      {
        id: 'known-sender',
        email: 'known@x.tld',
        user_metadata: { display_name: 'KnownGuy', discord: 'known#1' },
      },
    ] as any);

    // …two pending scrims addressed to TEAM_ID: one from the known sender, one
    // from an id absent from auth (must degrade to user: null, not throw).
    store.demandes = [
      {
        id: 'scrim-known',
        team_id: TEAM_ID,
        user_id: 'known-sender',
        type: 'scrim',
        status: 'pending',
        source: 'website',
        comment: 'gg',
        payload: {},
        created_at: new Date().toISOString(),
      },
      {
        id: 'scrim-ghost',
        team_id: TEAM_ID,
        user_id: 'ghost-sender',
        type: 'scrim',
        status: 'pending',
        source: 'website',
        comment: 'wp',
        payload: {},
        created_at: new Date().toISOString(),
      },
    ] as any;

    const res = makeRes();
    await dashboardHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const b = res.body as any;

    expect(b.pendingScrims).toHaveLength(2);
    const known = b.pendingScrims.find((s: any) => s.id === 'scrim-known');
    const ghost = b.pendingScrims.find((s: any) => s.id === 'scrim-ghost');

    expect(known.user).toEqual({
      id: 'known-sender',
      email: 'known@x.tld',
      display_name: 'KnownGuy',
      discord: 'known#1',
    });
    // Unknown id → skipped (best-effort enrichment), userInfo null.
    expect(ghost.user).toBeNull();
  });

  it('non-captain plain player gets the reduced payload', async () => {
    seed({ minPlayers: 7, memberCount: 4 });
    // PLAYER_ID is member m-1 (a plain player), not the captain.
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await dashboardHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const b = res.body as any;

    expect(b.team?.id).toBe(TEAM_ID);
    expect(b.isCaptain).toBe(false);
    expect(b.isManager).toBe(false);

    // Captain-only sections are empty/zero for a plain player.
    expect(b.pendingScrims).toEqual([]);
    expect(b.unreadMessages).toBe(0);

    // Next-match + readiness are still computed (visible to all members).
    expect(b.nextMatch.match?.id).toBe(MATCH_ID);
    expect(b.nextMatch.readiness?.shortfall).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Permissions fines (2026-08-31)
  //
  // Le payload ne portait que `isCaptain` / `isManager`, et l'écran en
  // déduisait un droit de gestion TOTAL. Or `isManager` vaut `true` dès qu'un
  // rôle accorde AU MOINS UNE permission : un coach voyait donc les actions
  // roster / messages / infos d'équipe, toutes refusées ensuite par le serveur.
  // Le dashboard publie maintenant la liste effective.
  // ─────────────────────────────────────────────────────────────────────────

  it('publie toutes les permissions pour la capitaine', async () => {
    seed({ minPlayers: 5, memberCount: 5 });
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await dashboardHandler(makeReq(), res);

    const b = res.body as any;
    expect(b.permissions).toEqual(
      expect.arrayContaining([
        'manage_roster',
        'manage_team_info',
        'manage_scrims',
        'send_captain_messages',
      ])
    );
  });

  it('un coach n’obtient que scrims + feuille de match', async () => {
    seed({ minPlayers: 5, memberCount: 5 });
    // m-1 devient coach : le rôle privilégié le plus courant, et celui dont
    // les droits sont les plus étroits.
    (store.team_members as any[])[1].role = 'coach';
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await dashboardHandler(makeReq(), res);

    const b = res.body as any;
    expect(b.isManager).toBe(true);
    expect(b.permissions).toEqual(['manage_scrims', 'validate_lineup']);
  });

  it('une joueuse ordinaire n’a aucune permission', async () => {
    seed({ minPlayers: 5, memberCount: 5 });
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await dashboardHandler(makeReq(), res);

    expect((res.body as any).permissions).toEqual([]);
  });
});
