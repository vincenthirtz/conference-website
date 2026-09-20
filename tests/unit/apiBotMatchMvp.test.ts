// Tests de GET/POST /api/bot/v1/matches/[matchId]/mvp.
//
// C'est la route qui REMPLACE le sondage Discord posté par webhook — lequel
// n'était pas relisible, exigeait une ressaisie manuelle par match, et n'a
// jamais produit une seule ligne en deux éditions. Ce qui est couvert ici est
// donc exactement ce qui manquait : une voix qui revient, s'enregistre, se
// corrige, et se dépouille toute seule.
//
// Couvert :
//   - 404 hors tenant / match inconnu
//   - candidates = titulaires des deux équipes, remplaçantes exclues
//   - `open` refuse un match non terminé (rejeu de match.finished sur un litige)
//   - une personne = une voix, la dernière compte
//   - vote pour une non-candidate refusé, vote après clôture refusé
//   - `close` dépouille, et ne décerne rien sous le seuil de voix

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import mvpHandler from '../../pages/api/bot/v1/matches/[matchId]/mvp';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';

const MATCH = '11111111-1111-4111-8111-111111111111';
const MATCH_ONGOING = '11111111-1111-4111-8111-111111111112';
const MATCH_FOREIGN = '11111111-1111-4111-8111-1111111111ff';

const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';

const ALICE = '33333333-3333-4333-8333-333333333aaa';
const BEA = '33333333-3333-4333-8333-333333333bbb';
const CHLOE = '33333333-3333-4333-8333-333333333ccc';
const SUB = '33333333-3333-4333-8333-3333333333ff';

// Comptes : `match_participants` ne porte pas de team_member_id, le
// raccrochage se fait par user_id (puis par BattleTag).
const U_ALICE = '44444444-4444-4444-8444-444444444aaa';
const U_BEA = '44444444-4444-4444-8444-444444444bbb';
const U_CHLOE = '44444444-4444-4444-8444-444444444ccc';
const U_SUB = '44444444-4444-4444-8444-4444444444ff';

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

async function call(
  matchId: string,
  over: { method?: string; body?: unknown } = {}
) {
  const res = makeRes();
  await mvpHandler(
    {
      method: over.method ?? 'GET',
      headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT },
      query: { matchId },
      body: over.body ?? {},
    } as any,
    res
  );
  return res;
}

const open = (matchId = MATCH) =>
  call(matchId, { method: 'POST', body: { action: 'open' } });

const vote = (discordUserId: string, memberId: string, matchId = MATCH) =>
  call(matchId, {
    method: 'POST',
    body: { action: 'vote', discordUserId, memberId },
  });

const close = (matchId = MATCH) =>
  call(matchId, { method: 'POST', body: { action: 'close' } });

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
    {
      id: MATCH_FOREIGN,
      tenant_id: OTHER_TENANT,
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
      user_id: U_ALICE,
      battle_tag: 'Alice#1111',
      display_name: 'Alice',
      is_substitute: false,
    },
    {
      id: BEA,
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: U_BEA,
      battle_tag: 'Bea#2222',
      display_name: 'Bea',
      is_substitute: false,
    },
    {
      id: CHLOE,
      tenant_id: TENANT,
      team_id: TEAM_B,
      user_id: U_CHLOE,
      battle_tag: 'Chloe#3333',
      display_name: 'Chloe',
      is_substitute: false,
    },
    {
      id: SUB,
      tenant_id: TENANT,
      team_id: TEAM_B,
      user_id: U_SUB,
      battle_tag: 'Sub#4444',
      display_name: 'Sub',
      is_substitute: true,
    },
  ] as any;

  // Aucun relevé de participation par défaut : le repli sur le roster courant
  // est le comportement attendu tant que la composition n'est pas connue.
  store.match_participants = [] as any;
  store.match_mvp_polls = [] as any;
  store.match_mvp_votes = [] as any;
}

describe('/api/bot/v1/matches/[matchId]/mvp', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
  });

  it('404 sur un match inconnu ou hors tenant', async () => {
    expect((await call(MATCH_FOREIGN)).statusCode).toBe(404);
  });

  it('à défaut de composition relevée, retombe sur les titulaires du roster', async () => {
    const res = await call(MATCH);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual([ALICE, BEA, CHLOE]);
    expect(ids).not.toContain(SUB);
    expect((res.body as any).candidates[0].label).toBe('[Les Alpines] Alice');
    expect((res.body as any).poll).toBeNull();
  });

  it('propose CELLES QUI ONT JOUÉ quand la composition est relevée', async () => {
    // Le roster courant contient Alice, Bea et Chloe. Le relevé du match dit
    // qu'Alice n'a pas joué et que la remplaçante est entrée : proposer le
    // roster reviendrait à faire voter pour une absente et à priver de voix
    // quelqu'un qui était sur le serveur.
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_BEA,
        battle_tag: 'Bea#2222',
        is_substitute: false,
      },
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_CHLOE,
        battle_tag: 'Chloe#3333',
        is_substitute: false,
      },
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_SUB,
        battle_tag: 'Sub#4444',
        is_substitute: false,
      },
      // Alice était sur la feuille, mais remplaçante ce jour-là.
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_ALICE,
        battle_tag: 'Alice#1111',
        is_substitute: true,
      },
    ] as any;

    const res = await call(MATCH);
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual([BEA, CHLOE, SUB]);
    expect(ids).not.toContain(ALICE);
  });

  it('raccroche une joueuse sans compte par son BattleTag', async () => {
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: null,
        battle_tag: 'Alice#1111',
        is_substitute: false,
      },
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: null,
        battle_tag: 'Chloe#3333',
        is_substitute: false,
      },
    ] as any;

    const res = await call(MATCH);
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual([ALICE, CHLOE]);
  });

  it("refuse d'ouvrir un vote sur un match non terminé", async () => {
    const res = await open(MATCH_ONGOING);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).status).toBe('ongoing');
  });

  it('ouvre le vote, fige les candidates et annonce qu’il est votable', async () => {
    const res = await open();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).votable).toBe(true);
    expect((res.body as any).poll.candidate_player_ids).toEqual([
      ALICE,
      BEA,
      CHLOE,
    ]);
    expect((res.body as any).poll.posted_at).toBeTruthy();
    expect((res.body as any).poll.closes_at).toBeTruthy();
  });

  it('refuse une voix tant que le vote n’est pas ouvert', async () => {
    const res = await vote('900000000000000001', ALICE);
    expect(res.statusCode).toBe(409);
  });

  it('enregistre une voix, et la dernière compte', async () => {
    await open();

    const first = await vote('900000000000000001', ALICE);
    expect(first.statusCode).toBe(200);
    expect((first.body as any).changed).toBe(true);

    // Même personne, même choix : rien ne bouge.
    const again = await vote('900000000000000001', ALICE);
    expect((again.body as any).changed).toBe(false);

    // Même personne, autre choix : sa voix se DÉPLACE, elle ne s'ajoute pas.
    const moved = await vote('900000000000000001', BEA);
    expect((moved.body as any).changed).toBe(true);
    expect(store.match_mvp_votes).toHaveLength(1);
    expect((store.match_mvp_votes as any)[0].member_id).toBe(BEA);
  });

  it('refuse une voix pour une joueuse hors liste (remplaçante)', async () => {
    await open();
    const res = await vote('900000000000000001', SUB);
    expect(res.statusCode).toBe(400);
  });

  it('dépouille à la clôture et désigne la gagnante', async () => {
    await open();
    await vote('900000000000000001', ALICE);
    await vote('900000000000000002', ALICE);
    await vote('900000000000000003', ALICE);
    await vote('900000000000000004', CHLOE);

    const res = await close();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).award).toMatchObject({
      memberId: ALICE,
      source: 'discord',
      winnerVotes: 3,
      totalVotes: 4,
      roundName: 'J1',
    });

    const poll = (store.match_mvp_polls as any)[0];
    expect(poll.winner_member_id).toBe(ALICE);
    expect(poll.winner_battle_tag).toBe('Alice#1111');
    expect(poll.winner_source).toBe('discord');
    expect(poll.closed_at).toBeTruthy();
  });

  it('ne décerne rien sous le seuil de voix, et le dit', async () => {
    await open();
    await vote('900000000000000001', ALICE);
    await vote('900000000000000002', CHLOE);

    const res = await close();
    expect((res.body as any).award).toBeNull();
    expect((res.body as any).reason).toBe('too_few_votes');
    expect((store.match_mvp_polls as any)[0].winner_member_id).toBeNull();
  });

  it('refuse une voix après la clôture', async () => {
    await open();
    await close();
    const res = await vote('900000000000000009', ALICE);
    expect(res.statusCode).toBe(409);
  });
});
