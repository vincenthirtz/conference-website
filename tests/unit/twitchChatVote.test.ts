// Les « !mvp » du chat Twitch, comptés côté serveur (sans cockpit ouvert).
//
//   - lecture de la commande et désignation de la candidate (pseudo exact,
//     début, morceau — jamais ambigu —, numéro dans l'ordre figé) ;
//   - le webhook : signature exigée, message ordinaire acquitté sans rien
//     écrire, vote compté sous la clé du cockpit (login en minuscules, donc
//     sans double compte), vote hors scrutin refusé.

import { Readable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { computeTwitchSignature } from '../../utils/twitch/eventsubRequest';
import {
  candidateName,
  parseMvpCommand,
  resolveChatCandidate,
} from '../../utils/mvp/twitchChatVote';
import handler from '../../pages/api/webhooks/twitch/chat-mvp';

const SECRET = 'test-eventsub-secret';
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const BROADCASTER = '1457667837';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';
const ALICE = '33333333-3333-4333-8333-333333333aaa';
const BEA = '33333333-3333-4333-8333-333333333bbb';

/* ------------------------------------------------------------------ pur */

describe('parseMvpCommand', () => {
  it('lit !mvp et !vote, pseudo ou numéro', () => {
    expect(parseMvpCommand('!mvp Alice')).toBe('Alice');
    expect(parseMvpCommand('  !MVP   @Bea  ')).toBe('Bea');
    expect(parseMvpCommand('!vote 2')).toBe('2');
  });
  it('ignore le reste du chat', () => {
    expect(parseMvpCommand('gg wp')).toBeNull();
    expect(parseMvpCommand('!mvp')).toBeNull();
    expect(parseMvpCommand('trop fort le !mvp Alice')).toBeNull();
  });
});

describe('resolveChatCandidate', () => {
  const list = [
    { memberId: 'a', label: '[ALP] Alice' },
    { memberId: 'b', label: '[BRV] Béa' },
    { memberId: 'c', label: '[BRV] Alicia' },
  ];
  it('pseudo sans préfixe d’équipe, sans casse ni accents', () => {
    expect(candidateName('[ALP] Alice')).toBe('Alice');
    expect(resolveChatCandidate(list, 'alice')).toBe('a');
    expect(resolveChatCandidate(list, 'BEA')).toBe('b');
  });
  it('début ou morceau, seulement s’il est sans ambiguïté', () => {
    expect(resolveChatCandidate(list, 'alic')).toBeNull(); // Alice / Alicia
    expect(resolveChatCandidate(list, 'alici')).toBe('c');
    expect(resolveChatCandidate(list, 'éa')).toBe('b');
  });
  it('numéro = rang dans l’ordre figé', () => {
    expect(resolveChatCandidate(list, '2')).toBe('b');
    expect(resolveChatCandidate(list, '9')).toBeNull();
  });
});

/* ------------------------------------------------------------- webhook */

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function makeReq(body: string, headers: Record<string, string>): any {
  const req: any = Readable.from([Buffer.from(body, 'utf8')]);
  req.method = 'POST';
  req.headers = { host: 'h', ...headers };
  req.query = {};
  req.cookies = {};
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

let msg = 0;
function signed(body: string, type = 'notification', secret = SECRET) {
  msg += 1;
  const id = `msg-${msg}`;
  const timestamp = new Date().toISOString();
  return {
    'twitch-eventsub-message-id': id,
    'twitch-eventsub-message-timestamp': timestamp,
    'twitch-eventsub-message-signature': computeTwitchSignature(
      secret,
      id,
      timestamp,
      Buffer.from(body, 'utf8')
    ),
    'twitch-eventsub-message-type': type,
  };
}

function chat(login: string, text: string) {
  return JSON.stringify({
    subscription: { type: 'channel.chat.message' },
    event: {
      broadcaster_user_id: BROADCASTER,
      chatter_user_login: login,
      message: { text },
    },
  });
}

async function post(body: string, headers = signed(body)) {
  const res = makeRes();
  await handler(makeReq(body, headers), res);
  return res;
}

const votes = () => (store.match_public_mvp_votes as any[]) ?? [];

let previousSecret: string | undefined;
beforeEach(() => {
  resetSupabaseMock();
  previousSecret = process.env.TWITCH_EVENTSUB_SECRET;
  process.env.TWITCH_EVENTSUB_SECRET = SECRET;
  store.twitch_broadcaster_connections = [
    { tenant_id: TENANT, broadcaster_id: BROADCASTER },
  ] as any;
  store.matches = [
    {
      id: MATCH,
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
      team_id: TEAM_B,
      battle_tag: 'Bea#2222',
      display_name: 'Bea',
      is_substitute: false,
    },
  ] as any;
  store.match_participants = [] as any;
  store.match_public_mvp_polls = [
    {
      id: 'poll-1',
      tenant_id: TENANT,
      match_id: MATCH,
      opened_at: new Date(Date.now() - 60_000).toISOString(),
      closes_at: new Date(Date.now() + 600_000).toISOString(),
      closed_at: null,
      // Ordre FIGÉ : Béa d'abord — c'est lui que désignent les numéros.
      candidate_member_ids: [BEA, ALICE],
    },
  ] as any;
  store.match_public_mvp_votes = [] as any;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.TWITCH_EVENTSUB_SECRET;
  else process.env.TWITCH_EVENTSUB_SECRET = previousSecret;
});

describe('POST /api/webhooks/twitch/chat-mvp', () => {
  it('refuse une signature invalide, sans rien écrire', async () => {
    const body = chat('pirate', '!mvp Alice');
    const res = await post(
      body,
      signed(body, 'notification', 'mauvais-secret')
    );
    expect(res.statusCode).toBe(403);
    expect(votes()).toHaveLength(0);
  });

  it('rend le challenge d’activation en texte brut', async () => {
    const body = JSON.stringify({
      challenge: 'abc123',
      subscription: { type: 'channel.chat.message' },
    });
    const res = await post(body, signed(body, 'webhook_callback_verification'));
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('abc123');
  });

  it('un message ordinaire est acquitté sans voter', async () => {
    const res = await post(chat('viewer', 'gg les filles'));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('not_a_vote');
    expect(votes()).toHaveLength(0);
  });

  it('!mvp <pseudo> compte une voix Twitch, sous le login en minuscules', async () => {
    const res = await post(chat('ViewerOne', '!mvp alice'));
    expect(res.body.status).toBe('counted');
    expect(votes()).toEqual([
      expect.objectContaining({
        tenant_id: TENANT,
        match_id: MATCH,
        member_id: ALICE,
        source: 'twitch',
        voter_key: 'viewerone',
      }),
    ]);
  });

  it('!mvp <n> suit l’ordre figé ; revoter remplace la voix', async () => {
    await post(chat('fan', '!mvp 1'));
    expect(votes()[0].member_id).toBe(BEA);
    await post(chat('fan', '!mvp Alice'));
    expect(votes()).toHaveLength(1);
    expect(votes()[0].member_id).toBe(ALICE);
  });

  it('candidate inconnue ou vote fermé : rien n’est compté', async () => {
    expect((await post(chat('fan', '!mvp Zoé'))).body.status).toBe(
      'unknown_candidate'
    );
    (store.match_public_mvp_polls as any[])[0].closes_at = new Date(
      Date.now() - 1_000
    ).toISOString();
    expect((await post(chat('fan', '!mvp Alice'))).body.status).toBe(
      'no_open_vote'
    );
    expect(votes()).toHaveLength(0);
  });

  it('chaîne qu’aucun espace n’a connectée : acquittée', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = await post(chat('fan', '!mvp Alice'));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('unknown_channel');
  });
});
