// tests/unit/twitchEventSubCallbackOrigin.test.ts
//
// `EVENTSUB_CALLBACK_ORIGIN` déplace l'URL de rappel des webhooks EventSub
// (alertes, drop TCG, chat !mvp) sans toucher aux liens d'e-mails/DM.
//
//   - validation stricte de l'origine (https, sans barre finale ni chemin) ;
//   - absente ou invalide : rappel sur le site, comme avant ;
//   - Twitch ne modifie pas un callback : un abonnement de NOTRE récepteur
//     resté sur l'ancienne origine est recréé vers la nouvelle PUIS supprimé
//     (création d'abord ; sur 409, suppression puis nouvel essai) ; un callback
//     d'une origine inconnue ou d'une autre chaîne n'est jamais touché.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { broadcasterTokenMock } = vi.hoisted(() => ({
  broadcasterTokenMock: vi.fn(),
}));
vi.mock('@/utils/twitchBroadcaster', async (orig) => ({
  ...(await orig<typeof import('../../utils/twitchBroadcaster')>()),
  getValidBroadcasterToken: broadcasterTokenMock,
}));
vi.mock('@/utils/twitch', async (orig) => ({
  ...(await orig<typeof import('../../utils/twitch')>()),
  getAccessToken: vi.fn(async () => 'app-token'),
  clientCreds: vi.fn(() => ({ id: 'test-client-id', secret: 'x' })),
}));
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { resetSupabaseMock, supabaseAdmin } from './__helpers__/supabaseMock';
import type { ServiceContext } from '../../utils/admin/serviceContext';
import { absoluteSiteUrl } from '../../utils/siteUrl';
import {
  __resetEventsubCallbackWarning,
  classifyEventsubCallback,
  eventsubCallbackUrl,
  parseEventsubCallbackOrigin,
} from '../../utils/twitch/eventsubCallback';
import { ALERT_SUBSCRIPTIONS } from '../../utils/twitch/alertEventMapping';
import {
  getAlertsState,
  subscribeAlerts,
  subscribeTcgDrop,
  unsubscribeTcgDrop,
} from '../../features/admin/twitch/service/eventsub';
import {
  chatVoteCallbackUrl,
  ensureChatVoteSubscription,
  removeChatVoteSubscription,
} from '../../utils/twitch/chatVoteSubscription';

const API = 'https://api.owwomenscup.fr';
const SITE = absoluteSiteUrl('');
const BC = 'bc-123';
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

const ALERTS = '/api/webhooks/twitch/alerts';
const TCG = '/api/webhooks/twitch/tcg-drop';
const CHAT = '/api/webhooks/twitch/chat-mvp';

const logger = { error() {}, warn() {}, info() {}, debug() {} } as any;
const ctx = (): ServiceContext => ({
  db: supabaseAdmin as any,
  tenantId: TENANT,
  actor: { kind: 'system' },
  logger,
});

type Sub = {
  id: string;
  type: string;
  status?: string;
  condition: Record<string, string>;
  transport: { method: string; callback: string };
};

/**
 * Faux Helix : GET liste `subs`, POST crée (statuts successifs de
 * `createStatuses`, 202 ensuite), DELETE retire l'id.
 */
function fakeHelix(subs: Sub[], createStatuses: number[] = []) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const reply = (status: number, json: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      text: async () => JSON.stringify(json),
    });
    if (method === 'GET') return reply(200, { data: subs });
    if (method === 'DELETE') return reply(204, {});
    return reply(createStatuses.shift() ?? 202, { data: [{ id: 'new' }] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    creates: () => calls.filter((c) => c.method === 'POST'),
    deletedIds: () =>
      calls
        .filter((c) => c.method === 'DELETE')
        .map((c) => new URL(c.url).searchParams.get('id')),
  };
}

const allScopes = ALERT_SUBSCRIPTIONS.flatMap((s) =>
  s.scope ? [s.scope] : []
);

beforeEach(() => {
  resetSupabaseMock();
  __resetEventsubCallbackWarning();
  process.env.TWITCH_CLIENT_ID = 'test-client-id';
  process.env.TWITCH_EVENTSUB_SECRET = 'test-eventsub-secret';
  broadcasterTokenMock.mockResolvedValue({
    accessToken: 'x',
    broadcasterId: BC,
    scope: [
      ...allScopes,
      'channel:read:redemptions',
      'channel:manage:redemptions',
      'user:read:chat',
      'user:bot',
      'channel:bot',
    ],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ pur */

describe('parseEventsubCallbackOrigin', () => {
  it('accepte une origine https nue', () => {
    expect(parseEventsubCallbackOrigin(API)).toBe(API);
    expect(parseEventsubCallbackOrigin(`  ${API}  `)).toBe(API);
    expect(parseEventsubCallbackOrigin('https://x.test:8443')).toBe(
      'https://x.test:8443'
    );
  });

  it('refuse tout le reste', () => {
    for (const bad of [
      undefined,
      '',
      'http://api.owwomenscup.fr',
      `${API}/`,
      `${API}/api`,
      `${API}?a=1`,
      'https://user:pw@api.owwomenscup.fr',
      'https://API.owwomenscup.fr',
      'api.owwomenscup.fr',
      'pas une url',
    ]) {
      expect(parseEventsubCallbackOrigin(bad)).toBeNull();
    }
  });
});

describe('eventsubCallbackUrl', () => {
  it('absente : origine du site, comme avant', () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', '');
    expect(eventsubCallbackUrl(ALERTS)).toBe(absoluteSiteUrl(ALERTS));
    expect(chatVoteCallbackUrl()).toBe(absoluteSiteUrl(CHAT));
  });

  it('posée : origine dédiée, les liens du site inchangés', () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    expect(eventsubCallbackUrl(ALERTS)).toBe(`${API}${ALERTS}`);
    expect(chatVoteCallbackUrl()).toBe(`${API}${CHAT}`);
    expect(absoluteSiteUrl('/news')).toBe(`${SITE}/news`);
  });

  it('invalide : ignorée (site), avec un avertissement unique', async () => {
    const { logger: realLogger } = await import('../../utils/logger');
    const warn = vi.spyOn(realLogger, 'warn').mockImplementation(() => {});
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', `${API}/`);
    expect(eventsubCallbackUrl(ALERTS)).toBe(absoluteSiteUrl(ALERTS));
    eventsubCallbackUrl(ALERTS);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('classifyEventsubCallback', () => {
  it('actuel / ancienne origine connue / étranger', () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    expect(classifyEventsubCallback(`${API}${ALERTS}`, ALERTS)).toBe('current');
    expect(classifyEventsubCallback(`${SITE}${ALERTS}`, ALERTS)).toBe('stale');
    expect(
      classifyEventsubCallback('https://preview.example.test' + ALERTS, ALERTS)
    ).toBeNull();
    expect(classifyEventsubCallback(`${SITE}${TCG}`, ALERTS)).toBeNull();
    expect(classifyEventsubCallback(undefined, ALERTS)).toBeNull();
  });

  it('sans variable, seul le site est à nous', () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', '');
    expect(classifyEventsubCallback(`${SITE}${ALERTS}`, ALERTS)).toBe(
      'current'
    );
    expect(classifyEventsubCallback(`${API}${ALERTS}`, ALERTS)).toBeNull();
  });
});

/* ------------------------------------------------------------- alertes */

const raid = (id: string, callback: string, to = BC): Sub => ({
  id,
  type: 'channel.raid',
  status: 'enabled',
  condition: { to_broadcaster_user_id: to },
  transport: { method: 'webhook', callback },
});

describe('alertes : réconciliation du callback', () => {
  it('sans variable : callback du site, rien supprimé', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', '');
    const helix = fakeHelix([raid('old', `${SITE}${ALERTS}`)]);
    const { result } = await subscribeAlerts(ctx());
    expect(result.callback).toBe(`${SITE}${ALERTS}`);
    expect(
      helix
        .creates()
        .every((c) => c.body.transport.callback === result.callback)
    ).toBe(true);
    expect(helix.deletedIds()).toEqual([]);
  });

  it('l’état signale l’abonnement périmé et ne le compte pas comme actif', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    fakeHelix([raid('old', `${SITE}${ALERTS}`)]);
    const state = await getAlertsState(ctx());
    expect(state.callback).toBe(`${API}${ALERTS}`);
    expect(state.staleCallbacks).toBe(1);
    expect(
      state.subscriptions.find((s) => s.type === 'channel.raid')?.subscribed
    ).toBe(false);
  });

  it('recrée vers la nouvelle origine PUIS supprime l’ancien', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix([
      raid('old', `${SITE}${ALERTS}`),
      raid('other-channel', `${SITE}${ALERTS}`, 'bc-999'),
      raid('preview', `https://preview.example.test${ALERTS}`),
    ]);
    const { result } = await subscribeAlerts(ctx());
    expect(result.callback).toBe(`${API}${ALERTS}`);
    const raidCreate = helix
      .creates()
      .find((c) => c.body.type === 'channel.raid');
    expect(raidCreate?.body.transport.callback).toBe(`${API}${ALERTS}`);
    // Seul NOTRE ancien abonnement, de CETTE chaîne, part.
    expect(helix.deletedIds()).toEqual(['old']);
    // Création avant suppression : pas de trou de livraison.
    const iCreate = helix.calls.indexOf(raidCreate!);
    const iDelete = helix.calls.findIndex((c) => c.method === 'DELETE');
    expect(iCreate).toBeLessThan(iDelete);
  });

  it('409 sur la création : supprime l’ancien et recrée', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix(
      [
        {
          ...raid('old', `${SITE}${ALERTS}`),
          type: ALERT_SUBSCRIPTIONS[0].type,
        },
      ],
      [409]
    );
    const { result } = await subscribeAlerts(ctx());
    const first = ALERT_SUBSCRIPTIONS[0].type;
    expect(helix.creates().filter((c) => c.body.type === first)).toHaveLength(
      2
    );
    expect(helix.deletedIds()).toEqual(['old']);
    expect(result.subscriptions.find((s) => s.type === first)?.subscribed).toBe(
      true
    );
  });

  it('création refusée : l’ancien reste en place', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix(
      [
        {
          ...raid('old', `${SITE}${ALERTS}`),
          type: ALERT_SUBSCRIPTIONS[0].type,
        },
      ],
      [400]
    );
    await subscribeAlerts(ctx());
    expect(helix.deletedIds()).toEqual([]);
  });
});

/* ------------------------------------------------------------ drop TCG */

const tcgSub = (id: string, callback: string, reward = 'rw-1'): Sub => ({
  id,
  type: 'channel.channel_points_custom_reward_redemption.add',
  status: 'enabled',
  condition: { broadcaster_user_id: BC, reward_id: reward },
  transport: { method: 'webhook', callback },
});

describe('drop TCG : réconciliation du callback', () => {
  it('remplace l’abonnement de la récompense resté sur le site', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix([
      tcgSub('old', `${SITE}${TCG}`),
      tcgSub('old-other-reward', `${SITE}${TCG}`, 'rw-2'),
    ]);
    const { result } = await subscribeTcgDrop(ctx(), { rewardId: 'rw-1' });
    expect(result.callbackUrl).toBe(`${API}${TCG}`);
    expect(helix.creates()[0].body.transport.callback).toBe(`${API}${TCG}`);
    expect(helix.deletedIds()).toEqual(['old']);
  });

  it('se désabonner retire aussi les abonnements périmés', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix([
      tcgSub('new', `${API}${TCG}`),
      tcgSub('old', `${SITE}${TCG}`),
      tcgSub('preview', `https://preview.example.test${TCG}`),
    ]);
    const { result } = await unsubscribeTcgDrop(ctx());
    expect(result.removed).toBe(2);
    expect(helix.deletedIds().sort()).toEqual(['new', 'old']);
  });
});

/* -------------------------------------------------------------- chat */

const chatSub = (id: string, callback: string, bc = BC): Sub => ({
  id,
  type: 'channel.chat.message',
  condition: { broadcaster_user_id: bc, user_id: bc },
  transport: { method: 'webhook', callback },
});

describe('chat !mvp : réconciliation du callback', () => {
  it('s’abonne vers la nouvelle origine et retire l’ancien', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix([
      chatSub('old', `${SITE}${CHAT}`),
      chatSub('other', `${SITE}${CHAT}`, 'bc-999'),
    ]);
    expect(await ensureChatVoteSubscription(TENANT)).toBe('subscribed');
    expect(helix.creates()[0].body.transport.callback).toBe(`${API}${CHAT}`);
    expect(helix.deletedIds()).toEqual(['old']);
  });

  it('409 : retire l’ancien puis recrée', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix([chatSub('old', `${SITE}${CHAT}`)], [409]);
    expect(await ensureChatVoteSubscription(TENANT)).toBe('subscribed');
    expect(helix.creates()).toHaveLength(2);
    expect(helix.deletedIds()).toEqual(['old']);
  });

  it('sans variable : comportement d’origine (rien supprimé)', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', '');
    const helix = fakeHelix([chatSub('cur', `${SITE}${CHAT}`)], [409]);
    expect(await ensureChatVoteSubscription(TENANT)).toBe('subscribed');
    expect(helix.creates()).toHaveLength(1);
    expect(helix.deletedIds()).toEqual([]);
  });

  it('le désabonnement retire actuel ET ancien, jamais l’étranger', async () => {
    vi.stubEnv('EVENTSUB_CALLBACK_ORIGIN', API);
    const helix = fakeHelix([
      chatSub('new', `${API}${CHAT}`),
      chatSub('old', `${SITE}${CHAT}`),
      chatSub('preview', `https://preview.example.test${CHAT}`),
    ]);
    expect(await removeChatVoteSubscription({ broadcasterId: BC })).toBe(2);
    expect(helix.deletedIds().sort()).toEqual(['new', 'old']);
  });
});
