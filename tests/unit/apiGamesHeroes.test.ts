// Tests for /api/games/[slug]/heroes — public hero pool endpoint backing
// the MOBA draft UI.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import heroesHandler from '../../pages/api/games/[slug]/heroes';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    body: {},
    cookies: {},
    socket: { remoteAddress: '127.0.0.1' },
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
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  store.game_heroes = [
    {
      id: 'h-aatrox',
      game: 'lol',
      external_id: '266',
      key: 'Aatrox',
      name: 'Aatrox',
      title: 'the Darkin Blade',
      roles: ['Fighter', 'Tank'],
      attribute: null,
      image_url: 'https://ddragon/.../Aatrox_0.jpg',
      icon_url: 'https://ddragon/.../Aatrox.png',
      enabled: true,
    },
    {
      id: 'h-ahri',
      game: 'lol',
      external_id: '103',
      key: 'Ahri',
      name: 'Ahri',
      title: 'the Nine-Tailed Fox',
      roles: ['Mage', 'Assassin'],
      attribute: null,
      image_url: 'https://ddragon/.../Ahri_0.jpg',
      icon_url: 'https://ddragon/.../Ahri.png',
      enabled: true,
    },
    {
      id: 'h-disabled',
      game: 'lol',
      external_id: '999',
      key: 'Removed',
      name: 'Removed',
      title: '',
      roles: [],
      attribute: null,
      image_url: 'x',
      icon_url: null,
      enabled: false,
    },
    {
      id: 'h-antimage',
      game: 'dota2',
      external_id: '1',
      key: 'antimage',
      name: 'Anti-Mage',
      title: null,
      roles: ['Carry', 'Escape'],
      attribute: 'agility',
      image_url: 'https://steam/.../antimage.png',
      icon_url: 'https://steam/.../icons/antimage.png',
      enabled: true,
    },
  ] as any;
});

describe('GET /api/games/[slug]/heroes', () => {
  it('returns LoL heroes (enabled only) in camelCase shape', async () => {
    const req = makeReq({ query: { slug: 'lol' } });
    const res = makeRes();
    await heroesHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.game).toBe('lol');
    expect(res.body.total).toBe(2);
    expect(res.body.heroes.map((h: any) => h.key).sort()).toEqual([
      'Aatrox',
      'Ahri',
    ]);
    const aatrox = res.body.heroes.find((h: any) => h.key === 'Aatrox');
    expect(aatrox).toMatchObject({
      id: 'h-aatrox',
      game: 'lol',
      externalId: '266',
      title: 'the Darkin Blade',
      imageUrl: 'https://ddragon/.../Aatrox_0.jpg',
      iconUrl: 'https://ddragon/.../Aatrox.png',
      roles: ['Fighter', 'Tank'],
      attribute: null,
    });
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=3600/);
  });

  it('returns Dota 2 heroes scoped to the right game', async () => {
    const req = makeReq({ query: { slug: 'dota2' } });
    const res = makeRes();
    await heroesHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.game).toBe('dota2');
    expect(res.body.total).toBe(1);
    expect(res.body.heroes[0]).toMatchObject({
      key: 'antimage',
      attribute: 'agility',
    });
  });

  it('includes disabled heroes when ?includeDisabled=1', async () => {
    const req = makeReq({ query: { slug: 'lol', includeDisabled: '1' } });
    const res = makeRes();
    await heroesHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.heroes.map((h: any) => h.key)).toContain('Removed');
  });

  it('returns 404 for an unknown game slug', async () => {
    const req = makeReq({ query: { slug: 'not-a-game' } });
    const res = makeRes();
    await heroesHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Unknown game slug');
  });

  it('returns 404 for a valid slug that has no hero pool', async () => {
    const req = makeReq({ query: { slug: 'overwatch' } });
    const res = makeRes();
    await heroesHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/no hero pool/);
  });

  it('rejects non-GET methods', async () => {
    const req = makeReq({ method: 'POST', query: { slug: 'lol' } });
    const res = makeRes();
    await heroesHandler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
