// tests/unit/apiAdminMvpPublic.test.ts
//
// LE SCRUTIN MVP DU PUBLIC, côté route — viewers Twitch et supporters Discord.
//
// CE QUE CES TESTS PROTÈGENT. Le vote du public est relayé par le cockpit
// régie, qui lit le chat Twitch. Trois choses peuvent mal tourner sans faire
// de bruit, et ce sont celles-là qui sont épinglées :
//
//   1. LE LOT QUI ÉCHOUE EN BLOC. Un `!mvp 47` dans le tas est NORMAL. S'il
//      faisait échouer l'appel, quarante voix valides disparaîtraient — et
//      personne ne le verrait, puisque le chat continue de défiler.
//   2. LA VOIX QUI COMPTE DOUBLE. Quelqu'un qui change d'avis dans le chat
//      DÉPLACE sa voix, il n'en ajoute pas une. L'inverse ferait gagner celle
//      qui a les fans les plus bavards, pas la meilleure joueuse.
//   3. LE SCRUTIN FERMÉ QUI ACCEPTE ENCORE. La fenêtre est courte par
//      conception — c'est elle qui protège du brigadage. Si elle ne ferme pas
//      vraiment, elle ne protège de rien.
//
// Les tables sont DISJOINTES de celles du vote des équipes : plusieurs tests
// vérifient explicitement que `match_mvp_votes` n'est pas touchée. C'est la
// garantie centrale de la migration — une voix de viewer ne doit jamais
// pouvoir peser sur le titre des joueuses.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import handler from '../../pages/api/admin/matches/[matchId]/mvp-public';

const TENANT = DEFAULT_TENANT_ID;
const MATCH = '11111111-1111-4111-8111-111111111111';
const MATCH_ONGOING = '11111111-1111-4111-8111-111111111112';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';
const ALICE = '33333333-3333-4333-8333-333333333aaa';
const BEA = '33333333-3333-4333-8333-333333333bbb';
const CHLOE = '33333333-3333-4333-8333-333333333ccc';
const ETRANGERE = '33333333-3333-4333-8333-3333333333ff';
const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';

let _n = 0;
function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} as any };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

async function call(
  method: 'GET' | 'POST',
  body: unknown = {},
  matchId = MATCH
) {
  _n += 1;
  const req: any = {
    method,
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_n}`,
      // Une IP par requête : le rate-limit est testé ailleurs et ne doit pas
      // faire échouer ici un cas qui n'a rien à voir avec lui.
      'x-nf-client-connection-ip': `10.0.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: { matchId },
    body,
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

function seed() {
  store.tenants = [
    {
      id: TENANT,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;

  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'finished',
      round_name: 'J1',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
    },
    {
      id: MATCH_ONGOING,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'ongoing',
      round_name: 'J1',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
    },
  ] as any;

  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Les Alpines' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Les Bravos' },
  ] as any;

  store.team_members = [
    {
      id: ALICE,
      tenant_id: TENANT,
      team_id: TEAM_A,
      battle_tag: 'Alice#1111',
      display_name: 'Alice',
      is_substitute: false,
    },
    {
      id: BEA,
      tenant_id: TENANT,
      team_id: TEAM_A,
      battle_tag: 'Bea#2222',
      display_name: 'Bea',
      is_substitute: false,
    },
    {
      id: CHLOE,
      tenant_id: TENANT,
      team_id: TEAM_B,
      battle_tag: 'Chloe#3333',
      display_name: 'Chloe',
      is_substitute: false,
    },
  ] as any;

  store.match_participants = [] as any;
  store.match_public_mvp_polls = [] as any;
  store.match_public_mvp_votes = [] as any;
  store.match_mvp_polls = [] as any;
  store.match_mvp_votes = [] as any;
}

const open = (windowMinutes?: number) =>
  call('POST', { action: 'open', ...(windowMinutes ? { windowMinutes } : {}) });

const vote = (
  source: 'twitch' | 'discord',
  votes: Array<{ voterKey: string; memberId: string }>
) => call('POST', { action: 'vote', source, votes });

const close = () => call('POST', { action: 'close' });

describe('/api/admin/matches/[matchId]/mvp-public', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seed();
    // Le rattachement à l'espace passe par `tenant_staff` : sans cette ligne,
    // la route répond 403 avant toute logique métier.
    store.staff = [
      {
        id: STAFF_ROW,
        auth_user_id: STAFF_AUTH,
        email: 'staff@example.com',
        role: 'caster',
        display_name: null,
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
        is_pole_admin: false,
      },
    ] as any;
    store.tenant_staff = [
      {
        tenant_id: TENANT,
        staff_id: STAFF_ROW,
        role: 'caster',
        created_at: '2026-01-01',
      },
    ] as any;
    setAuthUser({ id: STAFF_AUTH });
    invalidateStaffCache();
  });

  it('ouvre un scrutin sur un match terminé, et fige les candidates', async () => {
    const res = await open();
    expect(res.statusCode).toBe(200);
    expect(res.body.votable).toBe(true);
    const poll = (store.match_public_mvp_polls as any)[0];
    expect(poll.closes_at).toBeTruthy();
    expect(poll.closed_at).toBeNull();
    expect(poll.candidate_member_ids).toEqual(
      expect.arrayContaining([ALICE, BEA, CHLOE])
    );
  });

  it('refuse un match qui n’est pas terminé', async () => {
    const res = await call('POST', { action: 'open' }, MATCH_ONGOING);
    expect(res.statusCode).toBe(409);
  });

  it('ouvrir deux fois ne remet pas le compteur à zéro', async () => {
    await open();
    await vote('twitch', [{ voterKey: 'viewer1', memberId: ALICE }]);
    const second = await open();
    expect(second.body.alreadyOpen).toBe(true);
    expect((store.match_public_mvp_votes as any).length).toBe(1);
  });

  it('encaisse un lot et compte une ligne par votante', async () => {
    await open();
    const res = await vote('twitch', [
      { voterKey: 'viewer1', memberId: ALICE },
      { voterKey: 'viewer2', memberId: ALICE },
      { voterKey: 'viewer3', memberId: BEA },
    ]);
    expect(res.body.accepted).toBe(3);
    expect((store.match_public_mvp_votes as any).length).toBe(3);
  });

  it('un `!mvp 47` ne fait pas échouer les voix valides du lot', async () => {
    await open();
    const res = await vote('twitch', [
      { voterKey: 'viewer1', memberId: ALICE },
      { voterKey: 'viewer2', memberId: ETRANGERE },
      { voterKey: 'viewer3', memberId: BEA },
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(2);
    expect(res.body.rejected.notCandidate).toBe(1);
  });

  it('changer d’avis DÉPLACE la voix, ne l’ajoute pas', async () => {
    await open();
    await vote('twitch', [{ voterKey: 'viewer1', memberId: ALICE }]);
    await vote('twitch', [{ voterKey: 'viewer1', memberId: BEA }]);
    const lignes = (store.match_public_mvp_votes as any).filter(
      (r: any) => r.voter_key === 'viewer1'
    );
    expect(lignes.length).toBe(1);
    expect(lignes[0].member_id).toBe(BEA);
  });

  it('normalise le login : la casse ne crée pas une seconde voix', async () => {
    await open();
    await vote('twitch', [{ voterKey: 'Viewer1', memberId: ALICE }]);
    await vote('twitch', [{ voterKey: 'viewer1', memberId: BEA }]);
    expect((store.match_public_mvp_votes as any).length).toBe(1);
  });

  it('refuse toutes les voix quand le scrutin n’est pas ouvert', async () => {
    const res = await vote('twitch', [
      { voterKey: 'viewer1', memberId: ALICE },
    ]);
    expect(res.body.accepted).toBe(0);
    expect(res.body.rejected.closed).toBe(1);
    expect((store.match_public_mvp_votes as any).length).toBe(0);
  });

  it('dépouille en ADDITIONNANT Twitch et Discord', async () => {
    await open();
    await vote('twitch', [{ voterKey: 'v1', memberId: ALICE }]);
    await vote('discord', [
      { voterKey: 'd1', memberId: ALICE },
      { voterKey: 'd2', memberId: BEA },
    ]);

    const res = await close();
    expect(res.statusCode).toBe(200);
    expect(res.body.award.memberId).toBe(ALICE);
    expect(res.body.award.winnerVotes).toBe(2);
    expect(res.body.award.totalVotes).toBe(3);
    expect(res.body.award.bySource).toEqual({ twitch: 1, discord: 2 });
    expect(res.body.winnerLabel).toContain('Alice');
    expect(res.body.team1Name).toBe('Les Alpines');

    const poll = (store.match_public_mvp_polls as any)[0];
    expect(poll.closed_at).toBeTruthy();
    expect(poll.winner_member_id).toBe(ALICE);
    expect(poll.winner_battle_tag).toBe('Alice#1111');
  });

  it('ne décerne rien sous le seuil de voix, et le dit', async () => {
    await open();
    await vote('twitch', [{ voterKey: 'v1', memberId: ALICE }]);
    const res = await close();
    expect(res.body.award).toBeNull();
    expect(res.body.reason).toBe('too_few_votes');
  });

  it('n’écrit JAMAIS dans les tables du vote des équipes', async () => {
    // La garantie centrale de la migration : une voix de viewer ne doit pas
    // pouvoir peser sur le titre des joueuses.
    await open();
    await vote('twitch', [
      { voterKey: 'v1', memberId: ALICE },
      { voterKey: 'v2', memberId: ALICE },
      { voterKey: 'v3', memberId: ALICE },
    ]);
    await close();
    expect((store.match_mvp_votes as any).length).toBe(0);
    expect((store.match_mvp_polls as any).length).toBe(0);
  });

  it('un corps invalide est refusé avant toute écriture', async () => {
    await open();
    const res = await call('POST', {
      action: 'vote',
      source: 'youtube',
      votes: [],
    });
    expect(res.statusCode).toBe(400);
    expect((store.match_public_mvp_votes as any).length).toBe(0);
  });

  it('GET rend l’état et les décomptes, jamais les voter_key', async () => {
    await open();
    await vote('twitch', [{ voterKey: 'v1', memberId: ALICE }]);
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body.isOpen).toBe(true);
    expect(res.body.tallies.twitch.total).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('v1');
  });
});
