// GET /api/overlay/alerts — ce que la source OBS reçoit.
// Target: pages/api/overlay/alerts.ts
//
// CE QUI MÉRITE UN TEST ICI :
//   - la FUSION des deux flux (events Twitch + dons HelloAsso), parce que
//     c'est tout l'objet de la boîte et que les deux tables n'ont ni la même
//     forme ni le même espace d'identifiants ;
//   - le COUPE-CIRCUIT : une boîte éteinte ne doit servir AUCUNE alerte. Ce qui
//     ne part pas sur le réseau ne peut pas s'afficher par accident ;
//   - la RÉSISTANCE de la configuration : une table de réglages qui hoquette ne
//     doit pas éteindre l'antenne, elle doit retomber sur les défauts du code.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID as DEFAULT_TENANT_ID,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/overlay/alerts';

const OTHER_TENANT = '11111111-2222-4333-8444-555555555555';
const NOW = Date.parse('2026-09-18T20:00:00.000Z');

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

function req(query: Record<string, string> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query,
    cookies: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function get(query: Record<string, string> = {}) {
  const res = makeRes();
  await handler(req(query), res);
  return res;
}

function twitchEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    tenant_id: DEFAULT_TENANT_ID,
    kind: 'cheer',
    actor_name: 'Aru',
    amount: 500,
    tier: null,
    created_at: new Date(NOW - 60_000).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  store.stream_alert_events = [];
  store.helloasso_donations = [];
  store.stream_alert_settings = [];
  store.stream_alert_rules = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fusion des deux flux', () => {
  it('rend les events Twitch ET les dons, plus récents d’abord', async () => {
    store.stream_alert_events = [
      twitchEvent({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
    ];
    store.helloasso_donations = [
      {
        id: 'dddddddd-0000-4000-8000-000000000001',
        tenant_id: DEFAULT_TENANT_ID,
        amount_cents: 2500,
        created_at: new Date(NOW - 10_000).toISOString(),
      },
    ];

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.body.alerts.map((a: any) => a.kind)).toEqual([
      'donation',
      'cheer',
    ]);
    // Les identifiants sont préfixés par source : deux tables, deux espaces.
    expect(res.body.alerts[0].id.startsWith('don:')).toBe(true);
    expect(res.body.alerts[1].id.startsWith('tw:')).toBe(true);
  });

  it('ne rend que l’espace demandé', async () => {
    store.stream_alert_events = [
      twitchEvent({ tenant_id: OTHER_TENANT, actor_name: 'Ailleurs' }),
    ];
    const res = await get();
    expect(res.body.alerts).toEqual([]);
  });

  it('écarte ce qui est hors de la fenêtre de lecture', async () => {
    store.stream_alert_events = [
      twitchEvent({ created_at: new Date(NOW - 60 * 60 * 1000).toISOString() }),
    ];
    const res = await get();
    expect(res.body.alerts).toEqual([]);
  });
});

describe('les réglages voyagent avec les alertes', () => {
  it('sans ligne en base, rend les défauts du code', async () => {
    // Un espace qui n'a jamais ouvert l'éditeur doit avoir une boîte qui
    // marche, pas une boîte muette.
    const res = await get();
    expect(res.body.settings).toMatchObject({
      enabled: true,
      durationMs: 19_000,
      soundUrl: null,
      soundVolume: 70,
    });
    expect(res.body.rules).toEqual([]);
  });

  it('rend ce que la régie a posé, en bornant', async () => {
    store.stream_alert_settings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        enabled: true,
        duration_ms: 12_000,
        sound_url: '/overlay/alerts/ding.mp3',
        sound_volume: 500, // valeur aberrante : doit être ramenée à 100
        accent_color: '#A62EDB',
      },
    ];
    const res = await get();
    expect(res.body.settings.durationMs).toBe(12_000);
    expect(res.body.settings.soundVolume).toBe(100);
    expect(res.body.settings.soundUrl).toBe('/overlay/alerts/ding.mp3');
    expect(res.body.settings.accentColor).toBe('#A62EDB');
  });

  it('COUPE-CIRCUIT : une boîte éteinte ne sert aucune alerte', async () => {
    // Elle ne sert pas des alertes que la source filtrerait : ce qui ne part
    // pas sur le réseau ne peut pas s'afficher par accident.
    store.stream_alert_events = [twitchEvent()];
    store.stream_alert_settings = [
      { tenant_id: DEFAULT_TENANT_ID, enabled: false },
    ];
    const res = await get();
    expect(res.body.settings.enabled).toBe(false);
    expect(res.body.alerts).toEqual([]);
  });

  it('rend les règles, en écartant un type inconnu', async () => {
    store.stream_alert_rules = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        kind: 'cheer',
        enabled: false,
        message: 'Merci {name} !',
        min_amount: 100,
      },
      // Ajouté à la main en base : la source ne saurait pas le rendre.
      { tenant_id: DEFAULT_TENANT_ID, kind: 'chaos', enabled: true },
    ];
    const res = await get();
    expect(res.body.rules).toHaveLength(1);
    expect(res.body.rules[0]).toMatchObject({
      kind: 'cheer',
      enabled: false,
      message: 'Merci {name} !',
      minAmount: 100,
    });
  });
});

describe('contrat de la réponse', () => {
  it('donne l’horloge du SERVEUR et un cache court', async () => {
    // La source date ses alertes sur cette horloge : celle du poste de régie
    // peut être fausse.
    const res = await get();
    expect(res.body.serverTime).toBe(new Date(NOW).toISOString());
    // Aligné sur la cadence des sources (10 s) : le CDN ne peut dédoubler
    // que ce qu'il a le droit de garder.
    expect(res.headers['Cache-Control']).toContain('s-maxage=10');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
  });

  it('402 quand l’espace n’a pas les sources de stream', async () => {
    store.tenants = [
      {
        id: OTHER_TENANT,
        slug: 'autre',
        plan: 'discovery',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ];
    const res = await get({ tenant: 'autre' });
    expect(res.statusCode).toBe(402);
    expect(res.body.capability).toBe('matchOverlays');
  });

  it('refuse une autre méthode que GET', async () => {
    const res = makeRes();
    await handler({ ...req(), method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });
});
