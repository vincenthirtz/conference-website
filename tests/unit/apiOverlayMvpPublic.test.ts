// tests/unit/apiOverlayMvpPublic.test.ts
//
// CE QUE LA SOURCE OBS REÇOIT — et ce qu'elle ne doit JAMAIS recevoir.
//
// C'est la SEULE route du scrutin public qui soit publique : un navigateur
// OBS ne peut pas s'authentifier, donc n'importe qui devinant l'URL lit cette
// réponse. Deux tests en découlent directement — aucun `voter_key`, aucun
// identifiant BattleNet — et ils comptent plus que les autres.
//
// Le reste tient le comportement de scène :
//   - un scrutin OUVERT prime sur un résultat rémanent (la régie enchaîne deux
//     matchs : c'est le vote en cours qui doit être à l'écran) ;
//   - les deux plateformes s'ADDITIONNENT, une barre par joueuse ;
//   - les candidates FIGÉES à l'ouverture font foi, pour qu'une arrivée de
//     roster ne surgisse pas à l'écran en plein vote.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { withoutBattleTagId } from '../../utils/mvp/publicLabel';

import handler from '../../pages/api/overlay/mvp-public';

const TENANT = DEFAULT_TENANT_ID;
const MATCH = '11111111-1111-4111-8111-111111111111';
const AUTRE_MATCH = '11111111-1111-4111-8111-111111111112';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';
const ALICE = '33333333-3333-4333-8333-333333333aaa';
const BEA = '33333333-3333-4333-8333-333333333bbb';
const NOUVELLE = '33333333-3333-4333-8333-3333333333ee';

let _n = 0;
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call() {
  _n += 1;
  const req: any = {
    method: 'GET',
    headers: {
      host: 'h',
      'x-nf-client-connection-ip': `10.3.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: {},
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const DANS_10_MIN = () => new Date(Date.now() + 600_000).toISOString();
const IL_Y_A_1_MIN = () => new Date(Date.now() - 60_000).toISOString();

function poll(over: Record<string, unknown> = {}) {
  return {
    id: `poll-${Math.random()}`,
    tenant_id: TENANT,
    match_id: MATCH,
    opened_at: new Date(Date.now() - 120_000).toISOString(),
    closes_at: DANS_10_MIN(),
    closed_at: null,
    candidate_member_ids: [ALICE, BEA],
    winner_member_id: null,
    winner_battle_tag: null,
    winner_votes: null,
    total_votes: null,
    settled_at: null,
    discord_channel_id: null,
    discord_message_id: null,
    ...over,
  };
}

function voix(
  source: 'twitch' | 'discord',
  voterKey: string,
  memberId: string
) {
  return {
    id: `v-${source}-${voterKey}`,
    tenant_id: TENANT,
    match_id: MATCH,
    member_id: memberId,
    source,
    voter_key: voterKey,
  };
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
      id: AUTRE_MATCH,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'finished',
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
      // Sans nom d'affichage : le libellé retombe sur le BattleTag, et c'est
      // exactement le cas qu'il ne faut pas publier tel quel.
      battle_tag: 'Alice#1111',
      display_name: null,
      is_substitute: false,
    },
    {
      id: BEA,
      tenant_id: TENANT,
      team_id: TEAM_B,
      battle_tag: 'Bea#2222',
      display_name: 'Bea',
      is_substitute: false,
    },
    {
      id: NOUVELLE,
      tenant_id: TENANT,
      team_id: TEAM_A,
      battle_tag: 'Tard#9999',
      display_name: 'Tard',
      is_substitute: false,
    },
  ] as any;
  store.match_participants = [] as any;
  store.match_public_mvp_polls = [] as any;
  store.match_public_mvp_votes = [] as any;
}

describe('/api/overlay/mvp-public', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seed();
  });

  it('rend `poll: null` quand aucun scrutin n’est à l’écran', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.poll).toBeNull();
  });

  it('ADDITIONNE les deux plateformes, une barre par joueuse', async () => {
    store.match_public_mvp_polls = [poll()] as any;
    store.match_public_mvp_votes = [
      voix('twitch', 'v1', ALICE),
      voix('discord', 'd1', ALICE),
      voix('discord', 'd2', BEA),
    ] as any;

    const res = await call();
    expect(res.body.poll.total).toBe(3);
    expect(res.body.poll.bySource).toEqual({ twitch: 1, discord: 2 });
    const [premiere] = res.body.poll.candidates;
    expect(premiere.memberId).toBe(ALICE);
    expect(premiere.votes).toBe(2);
    expect(premiere.share).toBeCloseTo(2 / 3, 5);
  });

  it('ne publie JAMAIS l’identifiant BattleNet', async () => {
    store.match_public_mvp_polls = [poll()] as any;
    const res = await call();
    const texte = JSON.stringify(res.body);
    expect(texte).toMatch(/Alice/);
    expect(texte).not.toMatch(/#1111/);
    expect(texte).not.toMatch(/#\d/);
  });

  it('ne publie JAMAIS de voter_key', async () => {
    store.match_public_mvp_polls = [poll()] as any;
    store.match_public_mvp_votes = [
      voix('twitch', 'pseudo_du_chat', ALICE),
    ] as any;
    const res = await call();
    expect(JSON.stringify(res.body)).not.toContain('pseudo_du_chat');
  });

  it('un scrutin OUVERT prime sur un résultat rémanent', async () => {
    store.match_public_mvp_polls = [
      poll({
        match_id: AUTRE_MATCH,
        closed_at: IL_Y_A_1_MIN(),
        winner_member_id: BEA,
        opened_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      poll(),
    ] as any;
    const res = await call();
    expect(res.body.poll.matchId).toBe(MATCH);
    expect(res.body.poll.isOpen).toBe(true);
  });

  it('garde le résultat à l’écran juste après la clôture', async () => {
    store.match_public_mvp_polls = [
      poll({ closed_at: IL_Y_A_1_MIN(), winner_member_id: BEA }),
    ] as any;
    store.match_public_mvp_votes = [
      voix('twitch', 'v1', BEA),
      voix('twitch', 'v2', BEA),
      voix('discord', 'd1', ALICE),
    ] as any;
    const res = await call();
    expect(res.body.poll.isOpen).toBe(false);
    expect(res.body.poll.winnerMemberId).toBe(BEA);
    expect(res.body.poll.winnerLabel).toMatch(/Bea/);
  });

  it('respecte les candidates FIGÉES : une arrivée tardive ne surgit pas', async () => {
    store.match_public_mvp_polls = [poll()] as any;
    const res = await call();
    const ids = res.body.poll.candidates.map((c: any) => c.memberId);
    expect(ids).toContain(ALICE);
    expect(ids).toContain(BEA);
    expect(ids).not.toContain(NOUVELLE);
  });

  it('classe par voix décroissantes, avec un ordre total', async () => {
    store.match_public_mvp_polls = [poll()] as any;
    store.match_public_mvp_votes = [voix('twitch', 'v1', BEA)] as any;
    const res = await call();
    expect(res.body.poll.candidates[0].memberId).toBe(BEA);
    // À égalité (0 voix chacune plus bas), le memberId tranche : sans ça le
    // classement sauterait d'un rafraîchissement à l'autre sous les yeux du
    // public.
    const res2 = await call();
    expect(res2.body.poll.candidates.map((c: any) => c.memberId)).toEqual(
      res.body.poll.candidates.map((c: any) => c.memberId)
    );
  });

  it('refuse une autre méthode que GET', async () => {
    const req: any = {
      method: 'POST',
      headers: { host: 'h', 'x-nf-client-connection-ip': '10.3.9.9' },
      cookies: {},
      query: {},
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('withoutBattleTagId', () => {
  it('retire le discriminant, jamais le pseudo', () => {
    expect(withoutBattleTagId('[Chocomates] Mivaii#2189')).toBe(
      '[Chocomates] Mivaii'
    );
    expect(withoutBattleTagId('Nei#21253')).toBe('Nei');
    expect(withoutBattleTagId('[Alpines] Alice')).toBe('[Alpines] Alice');
    // Trois chiffres minimum : un pseudo qui contient « #1 » reste entier.
    expect(withoutBattleTagId('Team #1 Fan')).toBe('Team #1 Fan');
    expect(withoutBattleTagId(null)).toBe('');
  });
});
