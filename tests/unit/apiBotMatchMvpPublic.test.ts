// tests/unit/apiBotMatchMvpPublic.test.ts
//
// LE SECOND BUREAU DE VOTE : celui des supporters Discord.
//
// CE QUE CES TESTS TIENNENT, et pourquoi chacun compte :
//
//   1. LE BOT NE PEUT NI OUVRIR NI CLORE. C'est une frontière, pas un oubli.
//      Deux autorités sur la même urne donneraient un scrutin fermé d'un côté
//      et ouvert de l'autre — et personne ne saurait lequel fait foi.
//   2. UNE VOIX HORS FENÊTRE EST REFUSÉE. La brièveté du scrutin est sa seule
//      protection contre le brigadage ; si elle ne ferme pas vraiment, elle ne
//      protège de rien.
//   3. LES DEUX TABLES RESTENT DISJOINTES. Une voix de supportrice ne doit
//      jamais peser sur le titre des joueuses.
//   4. LES `voter_key` NE SORTENT PAS. Pas même vers le bot : savoir pour qui
//      quelqu'un a voté n'est l'affaire de personne.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/bot/v1/matches/[matchId]/mvp-public';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';
const ALICE = '33333333-3333-4333-8333-333333333aaa';
const BEA = '33333333-3333-4333-8333-333333333bbb';
const ETRANGERE = '33333333-3333-4333-8333-3333333333ff';

const DANS_10_MIN = () => new Date(Date.now() + 600_000).toISOString();
const IL_Y_A_1_MIN = () => new Date(Date.now() - 60_000).toISOString();

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

async function call(method: 'GET' | 'POST', body: unknown = {}) {
  _n += 1;
  const req: any = {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-nf-client-connection-ip': `10.2.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: { matchId: MATCH },
    body,
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const vote = (discordUserId: string, memberId: string) =>
  call('POST', { action: 'vote', discordUserId, memberId });

/** Ouvre le scrutin comme le ferait la régie (le bot n'a pas ce pouvoir). */
function ouvrirScrutin(closesAt = DANS_10_MIN()) {
  store.match_public_mvp_polls = [
    {
      id: '99999999-9999-4999-8999-999999999999',
      tenant_id: TENANT,
      match_id: MATCH,
      opened_at: new Date().toISOString(),
      closes_at: closesAt,
      closed_at: null,
      candidate_member_ids: [ALICE, BEA],
      winner_member_id: null,
      winner_battle_tag: null,
      winner_votes: null,
      total_votes: null,
      settled_at: null,
      discord_channel_id: null,
      discord_message_id: null,
    },
  ] as any;
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
      team_id: TEAM_B,
      battle_tag: 'Bea#2222',
      display_name: 'Bea',
      is_substitute: false,
    },
  ] as any;
  store.match_participants = [] as any;
  store.match_public_mvp_polls = [] as any;
  store.match_public_mvp_votes = [] as any;
  store.match_mvp_polls = [] as any;
  store.match_mvp_votes = [] as any;
}

describe('/api/bot/v1/matches/[matchId]/mvp-public', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
  });

  it('n’expose ni `open` ni `close` : la régie seule décide', async () => {
    for (const action of ['open', 'close']) {
      const res = await call('POST', { action });
      // Refusé par le schéma du contrat, avant toute logique.
      expect(res.statusCode).toBe(400);
    }
    expect((store.match_public_mvp_polls as any).length).toBe(0);
  });

  it('enregistre la voix d’une supportrice', async () => {
    ouvrirScrutin();
    const res = await vote('900000000000000001', ALICE);
    expect(res.statusCode).toBe(200);
    const lignes = store.match_public_mvp_votes as any;
    expect(lignes.length).toBe(1);
    expect(lignes[0].source).toBe('discord');
    expect(lignes[0].member_id).toBe(ALICE);
  });

  it('une personne, une voix : la dernière compte', async () => {
    ouvrirScrutin();
    await vote('900000000000000001', ALICE);
    await vote('900000000000000001', BEA);
    const lignes = store.match_public_mvp_votes as any;
    expect(lignes.length).toBe(1);
    expect(lignes[0].member_id).toBe(BEA);
  });

  it('refuse une voix après la fermeture de la fenêtre', async () => {
    ouvrirScrutin(IL_Y_A_1_MIN());
    const res = await vote('900000000000000001', ALICE);
    expect(res.statusCode).toBe(409);
    expect((store.match_public_mvp_votes as any).length).toBe(0);
  });

  it('refuse une voix quand aucun scrutin n’est ouvert', async () => {
    const res = await vote('900000000000000001', ALICE);
    expect(res.statusCode).toBe(409);
  });

  it('refuse une joueuse hors liste', async () => {
    ouvrirScrutin();
    const res = await vote('900000000000000001', ETRANGERE);
    expect(res.statusCode).toBe(400);
    expect((store.match_public_mvp_votes as any).length).toBe(0);
  });

  it('n’écrit jamais dans les tables du vote des équipes', async () => {
    ouvrirScrutin();
    await vote('900000000000000001', ALICE);
    await vote('900000000000000002', ALICE);
    expect((store.match_mvp_votes as any).length).toBe(0);
    expect((store.match_mvp_polls as any).length).toBe(0);
  });

  it('ancre le message du bot pour pouvoir l’éditer ensuite', async () => {
    ouvrirScrutin();
    const res = await call('POST', {
      action: 'anchor',
      channelId: '1270051618112671788',
      messageId: 'msg-1',
    });
    expect(res.statusCode).toBe(200);
    const poll = (store.match_public_mvp_polls as any)[0];
    expect(poll.discord_channel_id).toBe('1270051618112671788');
    expect(poll.discord_message_id).toBe('msg-1');
  });

  it('GET rend les candidates et la fenêtre, jamais les voter_key', async () => {
    ouvrirScrutin();
    await vote('900000000000000001', ALICE);
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body.isOpen).toBe(true);
    expect(res.body.candidates.length).toBe(2);
    expect(res.body.tallies.discord.total).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('900000000000000001');
  });
});
