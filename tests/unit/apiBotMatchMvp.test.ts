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
//   - candidates = les deux équipes, remplaçantes comprises
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

// Le corps EXACT que le bot envoie : `channelId`/`messageId` explicitement à
// null au premier appel — le message n'existe pas encore. Un test qui
// n'envoyait que `{ action: 'open' }` a laissé passer un contrat qui refusait
// ce null, et aucun vote ne pouvait s'ouvrir en production.
const open = (matchId = MATCH, over: Record<string, unknown> = {}) =>
  call(matchId, {
    method: 'POST',
    body: {
      action: 'open',
      channelId: '1543901793690591262',
      messageId: null,
      durationHours: undefined,
      ...over,
    },
  });

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

  it('à défaut de composition relevée, retombe sur le roster, remplaçantes comprises', async () => {
    const res = await call(MATCH);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual([ALICE, BEA, CHLOE, SUB]);
    expect((res.body as any).candidates[0].label).toBe('[Les Alpines] Alice');
    expect((res.body as any).poll).toBeNull();
  });

  it('propose CELLES QUI ONT JOUÉ quand la composition est relevée', async () => {
    // Le roster courant contient Alice, Bea, Chloe et Sub. Le relevé du match
    // ne porte pas Alice : proposer le roster reviendrait à faire voter pour
    // une absente.
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
    ] as any;

    const res = await call(MATCH);
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual([BEA, CHLOE, SUB]);
    expect(ids).not.toContain(ALICE);
  });

  it('une remplaçante portée au relevé reste candidate', async () => {
    // Le relevé ne dit pas qui est entrée en cours de série : une remplaçante
    // de la feuille peut avoir joué autant qu'une titulaire.
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_ALICE,
        battle_tag: 'Alice#1111',
        is_substitute: false,
      },
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_BEA,
        battle_tag: 'Bea#2222',
        is_substitute: true,
      },
    ] as any;

    const res = await call(MATCH);
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual(expect.arrayContaining([ALICE, BEA]));
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
      SUB,
    ]);
    expect((res.body as any).poll.posted_at).toBeTruthy();
    expect((res.body as any).poll.closes_at).toBeTruthy();
  });

  it("accepte un ancrage null : le message n'existe pas encore", async () => {
    // Régression : `.optional()` rejetait `null` (« expected string, received
    // null ») et rendait 400 sur TOUTE ouverture, à la main comme à la fin
    // d'un match. Absent et « connu comme vide » sont deux choses.
    const res = await open(MATCH, { messageId: null, channelId: null });
    expect(res.statusCode).toBe(200);
    expect((res.body as any).poll.posted_at).toBeTruthy();
  });

  it('ancre le message au second appel', async () => {
    await open();
    const res = await open(MATCH, { messageId: '999' });
    expect(res.statusCode).toBe(200);
    expect((res.body as any).poll.discord_message_id).toBe('999');
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

  it('refuse une voix pour une joueuse hors liste', async () => {
    // Sub n'est pas au relevé alors que son équipe a composé : hors liste.
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_CHLOE,
        battle_tag: 'Chloe#3333',
        is_substitute: false,
      },
    ] as any;
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

  it('rend les équipes du match : le bot les nomme, et ne les a pas', async () => {
    // Le bot compose DEUX messages à la clôture — l'édition du post de vote et
    // l'annonce de la gagnante — et les deux nomment le match. Il n'obtient ces
    // noms que par la liste des votes échus ; une clôture demandée
    // (`/mvp clore`) n'y figure pas, et affichait « Équipe 1 vs Équipe 2 ».
    await open();
    await vote('900000000000000001', ALICE);
    await vote('900000000000000002', ALICE);
    await vote('900000000000000003', ALICE);

    const res = await close();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team1Name).toBe('Les Alpines');
    expect((res.body as any).team2Name).toBe('Les Bravos');
  });

  it('rend les équipes même quand personne n’est élue', async () => {
    // Le message du vote est édité dans ce cas aussi, et il nomme le match.
    await open();
    await vote('900000000000000001', ALICE);

    const res = await close();
    expect((res.body as any).award).toBeNull();
    expect((res.body as any).team1Name).toBe('Les Alpines');
    expect((res.body as any).team2Name).toBe('Les Bravos');
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

/* ---------------------------------------------------------------------------
 * LE REPLI SUR LE ROSTER EST PAR ÉQUIPE (2026-09-23).
 *
 * Un seul booléen global disait « ce match a un relevé ». Sur LVN ASHES vs
 * Team Positivité, une seule des deux avait validé sa feuille : le filtre
 * « a joué » s'appliquait AUX DEUX, et les neuf joueuses de l'équipe qui
 * n'avait rien déclaré disparaissaient sans un log. Le vote proposait quatre
 * noms, tous du même côté — il ne pouvait désigner qu'une Ashes.
 *
 * Ces tests tiennent la règle dans les trois configurations possibles.
 * -------------------------------------------------------------------------*/

describe('candidates — repli sur le roster, équipe par équipe', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
  });

  it('une seule équipe a composé : L’AUTRE NE DISPARAÎT PAS', async () => {
    // Seule l'équipe A relève sa composition. Avant le correctif, l'équipe B
    // était intégralement effacée.
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_ALICE,
        battle_tag: 'Alice#1111',
        is_substitute: false,
      },
    ] as any;

    const res = await call(MATCH, { method: 'GET' });
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);

    // Équipe A : la feuille fait foi — seule Alice, pas Bea.
    expect(ids).toContain(ALICE);
    expect(ids).not.toContain(BEA);
    // Équipe B : aucune feuille, donc tout son roster, remplaçante comprise.
    expect(ids).toContain(CHLOE);
    expect(ids).toContain(SUB);
  });

  it('les deux ont composé : la feuille fait foi des deux côtés', async () => {
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_ALICE,
        battle_tag: 'Alice#1111',
        is_substitute: false,
      },
      {
        tenant_id: TENANT,
        match_id: MATCH,
        user_id: U_CHLOE,
        battle_tag: 'Chloe#3333',
        is_substitute: false,
      },
    ] as any;

    const res = await call(MATCH, { method: 'GET' });
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual(expect.arrayContaining([ALICE, CHLOE]));
    expect(ids).not.toContain(BEA);
  });

  it('aucune n’a composé : les deux rosters, comme avant', async () => {
    store.match_participants = [] as any;
    const res = await call(MATCH, { method: 'GET' });
    const ids = (res.body as any).candidates.map((c: any) => c.memberId);
    expect(ids).toEqual(expect.arrayContaining([ALICE, BEA, CHLOE, SUB]));
  });
});

describe('candidates — corriger la liste d’un vote ouvert', () => {
  // Feuille : Bea côté A, Chloe côté B. Sub (remplaçante B) est entrée en jeu
  // mais la feuille ne la porte pas ; la relance aurait effacé toutes les voix.
  const edit = (body: Record<string, unknown>) =>
    call(MATCH, { method: 'POST', body: { action: 'candidates', ...body } });

  beforeEach(() => {
    resetSupabaseMock();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
    store.match_participants = [
      { tenant_id: TENANT, match_id: MATCH, user_id: U_BEA, battle_tag: 'Bea#2222', is_substitute: false },
      { tenant_id: TENANT, match_id: MATCH, user_id: U_CHLOE, battle_tag: 'Chloe#3333', is_substitute: false },
    ] as any;
  });

  it('ajoute une remplaçante sans effacer les voix, et on peut voter pour elle', async () => {
    await open();
    await vote('900000000000000001', BEA);
    await vote('900000000000000002', CHLOE);

    const res = await edit({ add: [SUB] });
    expect(res.statusCode).toBe(200);
    expect((res.body as any).candidates.map((c: any) => c.memberId)).toEqual([
      BEA,
      CHLOE,
      SUB,
    ]);
    expect((res.body as any).added.map((c: any) => c.memberId)).toEqual([SUB]);
    expect((res.body as any).discardedVotes).toBe(0);
    expect(store.match_mvp_votes).toHaveLength(2);

    // La lecture rend la liste CORRIGÉE, pas celle de la feuille.
    const got = await call(MATCH);
    expect((got.body as any).candidates.map((c: any) => c.memberId)).toContain(SUB);
    expect((got.body as any).roster.map((c: any) => c.memberId)).toEqual([
      ALICE,
      BEA,
      CHLOE,
      SUB,
    ]);

    expect((await vote('900000000000000003', SUB)).statusCode).toBe(200);
  });

  it('retire une joueuse : seules SES voix partent, et c’est dit', async () => {
    await open();
    await edit({ add: [SUB] });
    await vote('900000000000000001', BEA);
    await vote('900000000000000002', CHLOE);

    const res = await edit({ remove: [CHLOE] });
    expect(res.statusCode).toBe(200);
    expect((res.body as any).discardedVotes).toBe(1);
    expect(store.match_mvp_votes).toHaveLength(1);
    expect((await vote('900000000000000004', CHLOE)).statusCode).toBe(400);
  });

  it('refuse une joueuse étrangère au match, une retirée qui n’est pas candidate, et moins de deux candidates', async () => {
    await open();
    expect(
      (await edit({ add: ['33333333-3333-4333-8333-3333333333ee'] })).statusCode
    ).toBe(400);
    expect((await edit({ remove: [ALICE] })).statusCode).toBe(400);
    expect((await edit({ remove: [BEA] })).statusCode).toBe(400);
    expect((await edit({})).statusCode).toBe(400);
  });

  it('rien à corriger sans vote ouvert', async () => {
    expect((await edit({ add: [SUB] })).statusCode).toBe(409);
  });

  it('une remplaçante ajoutée puis élue est NOMMÉE à la clôture', async () => {
    await open();
    await edit({ add: [SUB] });
    await vote('900000000000000001', SUB);
    await vote('900000000000000002', SUB);
    await vote('900000000000000003', SUB);

    const res = await close();
    expect((res.body as any).award?.memberId).toBe(SUB);
    expect((res.body as any).winnerLabel).toBe('[Les Bravos] Sub');
  });
});
