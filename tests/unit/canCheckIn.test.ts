// Check-in réservé à la capitaine, au coach et à la manager (2026-09-17).
//
// Ce qui se joue : le tournoi démarre le 18/09 au soir, et une équipe qui ne
// pointe pas au coup d'envoi est déclarée forfait AUTOMATIQUEMENT. Ces tests
// protègent donc d'abord les personnes légitimes (capitaine, équipe SANS
// capitaine pointée par sa manager, rôle mal saisi), ensuite le refus des
// autres — et ce dans chaque canal où l'identité est connue.
//
//   1. La règle pure (utils/teams/canCheckIn.ts).
//   2. Son chargement en base, échec compris.
//   3. Les routes joueuse : le jeton ne sort que pour les autorisées, l'état
//      reste visible de toutes.
//   4. La route bot d'écriture : autorisée → pointe ; refusée → 403 lisible.
//   5. Le lien porteur /checkin/<jeton> (mail capitaine) : inchangé.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../utils/tcg/grantCheckinStreak', () => ({
  grantCheckinStreakReward: vi.fn(async () => ({ status: 'skipped' })),
}));
vi.mock('@/utils/botPlayerLogs', () => ({
  logPlayerAction: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import { __resetMaintenanceCache } from '../../utils/maintenance';
import {
  applyCheckinPermission,
  canCheckIn,
  checkinAuthority,
  exposesCheckin,
  isCheckinTeamRole,
  loadCheckinPermission,
} from '../../utils/teams/canCheckIn';

import matchDetailHandler from '../../pages/api/player/matches/[matchId]';
import nextMatchHandler from '../../pages/api/player/next-match';
import matchesHandler from '../../pages/api/player/matches';
import dashboardHandler, { buildTodo } from '../../pages/api/player/dashboard';
import botCheckinHandler from '../../pages/api/bot/v1/matches/[matchId]/checkin';
import botNextMatchHandler from '../../pages/api/bot/v1/players/by-discord/[discordUserId]/next-match';
import publicCheckinHandler from '../../pages/api/checkin/[token]';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

const CAPTAIN = '00000000-0000-4000-8000-0000000000a1';
const PLAYER = '00000000-0000-4000-8000-0000000000a2';
const COACH = '00000000-0000-4000-8000-0000000000a3';
const MANAGER_NO_CAPTAIN_TEAM = '00000000-0000-4000-8000-0000000000a4';
const OPP_CAPTAIN = '00000000-0000-4000-8000-0000000000a5';
const OPP_PLAYER = '00000000-0000-4000-8000-0000000000a6';

// Équipe A a une capitaine ; équipe B n'en a PAS (créée par une manager).
const TEAM_A = '00000000-0000-4000-8000-0000000000b1';
const TEAM_B = '00000000-0000-4000-8000-0000000000b2';
const MATCH_ID = '00000000-0000-4000-8000-0000000000e1';

const DISCORD = {
  [CAPTAIN]: '900000000000000001',
  [PLAYER]: '900000000000000002',
  [COACH]: '900000000000000003',
  [MANAGER_NO_CAPTAIN_TEAM]: '900000000000000004',
  [OPP_CAPTAIN]: '900000000000000005',
  [OPP_PLAYER]: '900000000000000006',
} as const;
const UNLINKED_DISCORD = '900000000000000099';

const TOKEN_A = 'tokenAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'tokenBBBBBBBBBBBBBBBBBBBBBBBBBBB';

/* -------------------------------------------------------------------------
 * 1. Règle pure
 * ---------------------------------------------------------------------- */

describe('règle pure — qui peut pointer', () => {
  it('la capitaine, même sans aucune ligne team_members', () => {
    expect(
      checkinAuthority({ userId: CAPTAIN, captainId: CAPTAIN, roles: [] })
    ).toBe('captain');
  });

  it.each(['coach', 'manager', 'Coach', ' manager ', 'MANAGER', '\tCoach\n'])(
    'le rôle « %s » (casse / espaces ignorés)',
    (role) => {
      expect(isCheckinTeamRole(role)).toBe(true);
      expect(
        canCheckIn({ userId: COACH, captainId: CAPTAIN, roles: [role] })
      ).toBe(true);
    }
  );

  it('une manager d’une équipe SANS capitaine', () => {
    expect(
      checkinAuthority({
        userId: MANAGER_NO_CAPTAIN_TEAM,
        captainId: null,
        roles: ['manager'],
      })
    ).toBe('team_role');
  });

  it.each(['player', 'substitute', 'sub', '', null, undefined, 'managers'])(
    'refuse le rôle %j',
    (role) => {
      expect(
        canCheckIn({ userId: PLAYER, captainId: CAPTAIN, roles: [role] })
      ).toBe(false);
    }
  );

  it('une ligne coach parmi d’autres suffit', () => {
    expect(
      canCheckIn({
        userId: COACH,
        captainId: CAPTAIN,
        roles: ['player', null, 'coach'],
      })
    ).toBe(true);
  });

  it('un appelant sans identité ne « correspond » jamais à une équipe sans capitaine', () => {
    expect(canCheckIn({ userId: null, captainId: null, roles: [] })).toBe(
      false
    );
    expect(canCheckIn({ userId: '', captainId: '', roles: ['coach'] })).toBe(
      false
    );
  });

  it('applyCheckinPermission garde l’état, retire le jeton aux non autorisées', () => {
    const block = {
      token: 'tok',
      alreadyCheckedIn: true,
      isOpen: true,
      isPassed: false,
    };
    expect(applyCheckinPermission(block, false)).toEqual({
      token: null,
      alreadyCheckedIn: true,
      isOpen: true,
      isPassed: false,
      canCheckIn: false,
    });
    expect(applyCheckinPermission(block, true)).toEqual({
      ...block,
      canCheckIn: true,
    });
  });

  it('exposesCheckin : ouvert si autorisée OU si la vérification a échoué', () => {
    expect(
      exposesCheckin({ allowed: true, authority: 'captain', failed: false })
    ).toBe(true);
    expect(
      exposesCheckin({ allowed: false, authority: null, failed: true })
    ).toBe(true);
    expect(
      exposesCheckin({ allowed: false, authority: null, failed: false })
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Jeu de données commun : un match A (avec capitaine) contre B (sans).
 * ---------------------------------------------------------------------- */

function seed(opts: { openWindow?: boolean } = {}) {
  const inMinutes = opts.openWindow === false ? 180 : 30;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: TENANT_ID,
      name: 'Phenix',
      slug: 'phenix',
      captain_id: CAPTAIN,
    },
    {
      id: TEAM_B,
      tenant_id: TENANT_ID,
      name: 'Avoidgers',
      slug: 'avoidgers',
      captain_id: null,
    },
  ] as any;

  const member = (id: string, team: string, user: string, role: string) => ({
    id,
    tenant_id: TENANT_ID,
    team_id: team,
    user_id: user,
    role,
    created_at: '2026-01-01T00:00:00Z',
  });
  store.team_members = [
    member('m1', TEAM_A, CAPTAIN, 'player'),
    member('m2', TEAM_A, PLAYER, 'player'),
    // Rôle saisi à la main : majuscule + espaces.
    member('m3', TEAM_A, COACH, ' Coach '),
    member('m4', TEAM_B, MANAGER_NO_CAPTAIN_TEAM, 'manager'),
    member('m5', TEAM_B, OPP_PLAYER, 'player'),
  ] as any;

  store.user_discord_links = Object.entries(DISCORD).map(([auth, disc]) => ({
    auth_user_id: auth,
    discord_user_id: disc,
    discord_username: `u-${disc.slice(-2)}`,
  })) as any;

  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: TENANT_ID,
      tournament_id: null,
      status: 'pending',
      is_bye: false,
      scheduled_at: new Date(Date.now() + inMinutes * 60_000).toISOString(),
      match_format: 'bo3',
      round_name: 'J1',
      stream_url: null,
      lobby_code: null,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      team1_checkin_token: TOKEN_A,
      team2_checkin_token: TOKEN_B,
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      team1: {
        id: TEAM_A,
        name: 'Phenix',
        slug: 'phenix',
        captain_id: CAPTAIN,
      },
      team2: {
        id: TEAM_B,
        name: 'Avoidgers',
        slug: 'avoidgers',
        captain_id: null,
      },
      tournament: null,
    },
  ] as any;
  store.match_score_reports = [] as any;
}

let bearer = 0;
function playerReq(query: Record<string, unknown> = {}): any {
  bearer += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${bearer}` },
    query,
    body: {},
  };
}

function botReq(over: Record<string, unknown>): any {
  return {
    method: 'POST',
    headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT_ID },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  __resetMaintenanceCache();
  seedBotAuth({ tenantId: TENANT_ID });
  store.site_settings = [
    { key: 'bot_maintenance_mode', value: 'false' },
  ] as any;
  seed();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await __resetBotIdempotencyCache();
});

/* -------------------------------------------------------------------------
 * 2. Chargement en base
 * ---------------------------------------------------------------------- */

describe('loadCheckinPermission', () => {
  it('capitaine (captain_id) → autorisée', async () => {
    expect(await loadCheckinPermission(CAPTAIN, TENANT_ID, TEAM_A)).toEqual({
      allowed: true,
      authority: 'captain',
      failed: false,
    });
  });

  it('coach au rôle « Coach » mal saisi → autorisée', async () => {
    const p = await loadCheckinPermission(COACH, TENANT_ID, TEAM_A);
    expect(p.allowed).toBe(true);
    expect(p.authority).toBe('team_role');
  });

  it('manager d’une équipe sans capitaine → autorisée', async () => {
    const p = await loadCheckinPermission(
      MANAGER_NO_CAPTAIN_TEAM,
      TENANT_ID,
      TEAM_B
    );
    expect(p.allowed).toBe(true);
  });

  it('joueuse simple → refusée, sans échec', async () => {
    expect(await loadCheckinPermission(PLAYER, TENANT_ID, TEAM_A)).toEqual({
      allowed: false,
      authority: null,
      failed: false,
    });
  });

  it('capitaine adverse → refusée pour l’autre équipe', async () => {
    const p = await loadCheckinPermission(OPP_CAPTAIN, TENANT_ID, TEAM_B);
    expect(p.allowed).toBe(false);
    // Et la capitaine de A ne pointe pas pour B.
    expect(
      (await loadCheckinPermission(CAPTAIN, TENANT_ID, TEAM_B)).allowed
    ).toBe(false);
  });

  it('manager de B ne pointe pas pour A', async () => {
    expect(
      (await loadCheckinPermission(MANAGER_NO_CAPTAIN_TEAM, TENANT_ID, TEAM_A))
        .allowed
    ).toBe(false);
  });

  it('lecture en échec → failed (jamais une exception)', async () => {
    vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await loadCheckinPermission(PLAYER, TENANT_ID, TEAM_A)).toEqual({
      allowed: false,
      authority: null,
      failed: true,
    });
  });
});

/* -------------------------------------------------------------------------
 * 3. Routes joueuse
 * ---------------------------------------------------------------------- */

describe('GET /api/player/matches/[matchId]', () => {
  it('capitaine : jeton + canCheckIn', async () => {
    setAuthUser({ id: CAPTAIN });
    const res = makeRes();
    await matchDetailHandler(playerReq({ matchId: MATCH_ID }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checkin.token).toBe(TOKEN_A);
    expect(res.body.checkin.canCheckIn).toBe(true);
  });

  it('joueuse simple : pas de jeton, mais l’état reste visible', async () => {
    (store.matches as any[])[0].team1_checked_in_at = '2026-09-18T16:40:00Z';
    setAuthUser({ id: PLAYER });
    const res = makeRes();
    await matchDetailHandler(playerReq({ matchId: MATCH_ID }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checkin.token).toBeNull();
    expect(res.body.checkin.canCheckIn).toBe(false);
    expect(res.body.checkin.alreadyCheckedIn).toBe(true);
    expect(res.body.checkin.isOpen).toBe(true);
  });

  it('manager d’une équipe sans capitaine : jeton de SON équipe', async () => {
    setAuthUser({ id: MANAGER_NO_CAPTAIN_TEAM });
    const res = makeRes();
    await matchDetailHandler(playerReq({ matchId: MATCH_ID }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.team.slot).toBe(2);
    expect(res.body.checkin.token).toBe(TOKEN_B);
    expect(res.body.checkin.canCheckIn).toBe(true);
  });
});

describe('GET /api/player/next-match', () => {
  it('coach « Coach » : jeton', async () => {
    setAuthUser({ id: COACH });
    const res = makeRes();
    await nextMatchHandler(playerReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checkin.token).toBe(TOKEN_A);
    expect(res.body.checkin.canCheckIn).toBe(true);
  });

  it('joueuse simple : pas de jeton, fenêtre visible', async () => {
    setAuthUser({ id: PLAYER });
    const res = makeRes();
    await nextMatchHandler(playerReq(), res);
    expect(res.body.checkin.token).toBeNull();
    expect(res.body.checkin.canCheckIn).toBe(false);
    expect(res.body.checkin.isOpen).toBe(true);
    expect(res.body.checkin.alreadyCheckedIn).toBe(false);
  });

  it('vérification en échec : l’ancien comportement (jeton) plutôt qu’un bouton caché', async () => {
    setAuthUser({ id: PLAYER });
    // Seule la lecture des rôles casse : la route, elle, fonctionne.
    const realFrom = (supabaseAdmin as any).from.bind(supabaseAdmin);
    let teamMembersCalls = 0;
    vi.spyOn(supabaseAdmin as any, 'from').mockImplementation((t: any) => {
      if (t === 'team_members' && ++teamMembersCalls > 1) {
        throw new Error('boom');
      }
      return realFrom(t);
    });
    const res = makeRes();
    await nextMatchHandler(playerReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.checkin.token).toBe(TOKEN_A);
    expect(res.body.checkin.canCheckIn).toBe(true);
  });
});

describe('GET /api/player/matches', () => {
  it('joueuse simple : aucun jeton dans la liste', async () => {
    setAuthUser({ id: PLAYER });
    const res = makeRes();
    await matchesHandler(playerReq(), res);
    expect(res.statusCode).toBe(200);
    const m = res.body.matches.find((x: any) => x.id === MATCH_ID);
    expect(m.checkin.token).toBeNull();
    expect(m.checkin.canCheckIn).toBe(false);
    expect(m.checkin.isOpen).toBe(true);
  });

  it('manager de B : jeton de B', async () => {
    setAuthUser({ id: MANAGER_NO_CAPTAIN_TEAM });
    const res = makeRes();
    await matchesHandler(playerReq(), res);
    const m = res.body.matches.find((x: any) => x.id === MATCH_ID);
    expect(m.checkin.token).toBe(TOKEN_B);
    expect(m.checkin.canCheckIn).toBe(true);
  });
});

describe('GET /api/player/dashboard', () => {
  it('joueuse simple : pas de jeton, pas de « à faire » check-in', async () => {
    setAuthUser({ id: PLAYER });
    const res = makeRes();
    await dashboardHandler(playerReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.nextMatch.checkin.token).toBeNull();
    expect(res.body.nextMatch.checkin.canCheckIn).toBe(false);
    expect(res.body.nextMatch.checkin.isOpen).toBe(true);
    expect(res.body.todo.map((i: any) => i.id)).not.toContain('checkin');
  });

  it('capitaine : jeton + « à faire » check-in', async () => {
    setAuthUser({ id: CAPTAIN });
    const res = makeRes();
    await dashboardHandler(playerReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.nextMatch.checkin.token).toBe(TOKEN_A);
    expect(res.body.nextMatch.checkin.canCheckIn).toBe(true);
    expect(res.body.todo.map((i: any) => i.id)).toContain('checkin');
  });

  it('buildTodo : bloc sans `canCheckIn` (forme d’avant) → garde le « à faire »', () => {
    const todo = buildTodo({
      userId: CAPTAIN,
      nextMatch: {
        match: { id: 'm' },
        checkin: { isOpen: true, alreadyCheckedIn: false },
        readiness: null,
      } as any,
      pendingScrims: [],
      unreadMessages: 0,
      pendingInvitations: 0,
      members: [],
      canManage: false,
      permissions: [],
    });
    expect(todo.map((i) => i.id)).toContain('checkin');
  });
});

/* -------------------------------------------------------------------------
 * 4. Route bot d'écriture
 * ---------------------------------------------------------------------- */

async function botCheckin(discordUserId: string) {
  const res = makeRes();
  await botCheckinHandler(
    botReq({ query: { matchId: MATCH_ID }, body: { discordUserId } }),
    res
  );
  return res;
}

describe('POST /api/bot/v1/matches/[matchId]/checkin', () => {
  it('capitaine → pointe SON équipe', async () => {
    const res = await botCheckin(DISCORD[CAPTAIN]);
    expect(res.statusCode).toBe(200);
    expect(res.body.teamSlot).toBe(1);
    expect(res.body.alreadyCheckedIn).toBe(false);
    expect((store.matches as any[])[0].team1_checked_in_at).toBeTruthy();
    expect((store.matches as any[])[0].team2_checked_in_at).toBeNull();
  });

  it('manager d’une équipe SANS capitaine → pointe (refusé avant la règle)', async () => {
    const res = await botCheckin(DISCORD[MANAGER_NO_CAPTAIN_TEAM]);
    expect(res.statusCode).toBe(200);
    expect(res.body.teamSlot).toBe(2);
    expect((store.matches as any[])[0].team2_checked_in_at).toBeTruthy();
  });

  it('coach au rôle « Coach » → pointe', async () => {
    const res = await botCheckin(DISCORD[COACH]);
    expect(res.statusCode).toBe(200);
    expect(res.body.teamSlot).toBe(1);
  });

  it('joueuse simple → 403 CHECKIN_NOT_ALLOWED, rien n’est écrit', async () => {
    const res = await botCheckin(DISCORD[PLAYER]);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CHECKIN_NOT_ALLOWED');
    // Affiché tel quel sur Discord : doit dire QUI pointe.
    expect(res.body.error).toMatch(/capitaine, le coach ou la manager/);
    expect((store.matches as any[])[0].team1_checked_in_at).toBeNull();
  });

  it('capitaine d’une AUTRE équipe (hors match) → 403', async () => {
    const res = await botCheckin(DISCORD[OPP_CAPTAIN]);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CHECKIN_NOT_ALLOWED');
  });

  it('capitaine de A ne peut pas pointer B à sa place', async () => {
    (store.matches as any[])[0].team1_checked_in_at = '2026-09-18T16:40:00Z';
    const res = await botCheckin(DISCORD[CAPTAIN]);
    // Elle retombe sur SON équipe (déjà pointée), jamais sur B.
    expect(res.statusCode).toBe(200);
    expect(res.body.teamSlot).toBe(1);
    expect(res.body.alreadyCheckedIn).toBe(true);
    expect((store.matches as any[])[0].team2_checked_in_at).toBeNull();
  });

  it('compte Discord non relié → 403 CHECKIN_NOT_ALLOWED', async () => {
    const res = await botCheckin(UNLINKED_DISCORD);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CHECKIN_NOT_ALLOWED');
  });

  it('autorisée des deux côtés, capitaine d’un seul → le capitanat tranche', async () => {
    (store.team_members as any[]).push({
      id: 'm9',
      tenant_id: TENANT_ID,
      team_id: TEAM_B,
      user_id: CAPTAIN,
      role: 'manager',
      created_at: '2026-01-02T00:00:00Z',
    });
    const res = await botCheckin(DISCORD[CAPTAIN]);
    expect(res.statusCode).toBe(200);
    expect(res.body.teamSlot).toBe(1);
  });

  it('manager des deux équipes → 409 CHECKIN_TEAM_AMBIGUOUS, rien n’est écrit', async () => {
    (store.team_members as any[]).push({
      id: 'm9',
      tenant_id: TENANT_ID,
      team_id: TEAM_A,
      user_id: MANAGER_NO_CAPTAIN_TEAM,
      role: 'manager',
      created_at: '2026-01-02T00:00:00Z',
    });
    const res = await botCheckin(DISCORD[MANAGER_NO_CAPTAIN_TEAM]);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CHECKIN_TEAM_AMBIGUOUS');
    expect((store.matches as any[])[0].team1_checked_in_at).toBeNull();
    expect((store.matches as any[])[0].team2_checked_in_at).toBeNull();
  });
});

describe('GET /api/bot/v1/players/by-discord/[discordUserId]/next-match', () => {
  async function next(discordUserId: string) {
    const res = makeRes();
    await botNextMatchHandler(
      botReq({ method: 'GET', query: { discordUserId } }),
      res
    );
    return res;
  }

  it('joueuse simple : canCheckIn false, jamais de jeton', async () => {
    const res = await next(DISCORD[PLAYER]);
    expect(res.statusCode).toBe(200);
    expect(res.body.checkin.canCheckIn).toBe(false);
    expect(res.body.checkin.isOpen).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN_A);
  });

  it('manager de B : canCheckIn true, jamais de jeton', async () => {
    const res = await next(DISCORD[MANAGER_NO_CAPTAIN_TEAM]);
    expect(res.body.checkin.canCheckIn).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN_B);
  });
});

/* -------------------------------------------------------------------------
 * 5. Lien porteur (mail capitaine) — volontairement inchangé
 * ---------------------------------------------------------------------- */

describe('POST /api/checkin/[token] — lien du mail', () => {
  it('fonctionne toujours sans session', async () => {
    const res = makeRes();
    await publicCheckinHandler(
      {
        method: 'POST',
        headers: { host: 'h' },
        query: { token: TOKEN_A },
        body: {},
      } as any,
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.teamSlot).toBe(1);
    expect((store.matches as any[])[0].team1_checked_in_at).toBeTruthy();
  });
});
