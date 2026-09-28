// Signal de présence des overlays — utils/overlays/heartbeat.ts,
// POST /api/overlay/heartbeat, GET /api/admin/diffusion/overlay-presence.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  HEARTBEAT_STALE_MS,
  isOverlayLive,
  isOverlaySource,
} from '../../utils/overlays/heartbeat';
import heartbeat from '../../pages/api/overlay/heartbeat';
import presence from '../../pages/api/admin/diffusion/overlay-presence';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER = '00000000-0000-4000-8000-00000000000a';

let _n = 0;
function makeReq(over: Partial<any> = {}): any {
  _n += 1;
  return {
    method: 'GET',
    url: '/api/overlay/heartbeat',
    headers: {
      host: 'localhost',
      authorization: `Bearer t-${Date.now()}-${_n}`,
      'x-forwarded-for': `10.0.0.${_n % 250}`,
    },
    cookies: {},
    query: {},
    body: {},
    socket: { remoteAddress: `10.0.0.${_n % 250}` },
    ...over,
  };
}
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

describe('règles', () => {
  it('une source vue récemment est affichée, pas au-delà du délai', () => {
    const now = Date.parse('2026-09-28T20:00:00Z');
    expect(isOverlayLive('2026-09-28T19:59:40Z', now)).toBe(true);
    expect(
      isOverlayLive(new Date(now - HEARTBEAT_STALE_MS - 1).toISOString(), now)
    ).toBe(false);
    expect(isOverlayLive(null, now)).toBe(false);
  });

  it('le nom de source est contrôlé', () => {
    expect(isOverlaySource('regie')).toBe(true);
    expect(isOverlaySource('caster:scoreboard-1')).toBe(true);
    expect(isOverlaySource('<script>')).toBe(false);
    expect(isOverlaySource('x'.repeat(81))).toBe(false);
    expect(isOverlaySource(42)).toBe(false);
  });
});

describe('POST /api/overlay/heartbeat', () => {
  it('enregistre la dernière vue, une ligne par source', async () => {
    for (let i = 0; i < 2; i++) {
      const res = makeRes();
      await heartbeat(
        makeReq({ method: 'POST', body: { source: 'regie' } }),
        res
      );
      expect(res.statusCode).toBe(204);
    }
    const rows = (store.overlay_heartbeats ?? []) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant_id: TENANT, source: 'regie' });
  });

  it('refuse une source invalide', async () => {
    const res = makeRes();
    await heartbeat(makeReq({ method: 'POST', body: { source: 'a b' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuse autre chose que POST', async () => {
    const res = makeRes();
    await heartbeat(makeReq(), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('GET /api/admin/diffusion/overlay-presence', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [
      {
        id: 'staff-1',
        auth_user_id: 'user-1',
        email: 'c@x.com',
        role: 'caster',
        is_pole_admin: false,
      },
    ] as any;
  });

  it('rend les sources de SON espace, avec l’heure du serveur', async () => {
    store.overlay_heartbeats = [
      {
        tenant_id: TENANT,
        source: 'regie',
        last_seen_at: '2026-09-28T20:00:00Z',
      },
      {
        tenant_id: OTHER,
        source: 'alerts',
        last_seen_at: '2026-09-28T20:00:00Z',
      },
    ] as any;
    const res = makeRes();
    await presence(
      makeReq({ url: '/api/admin/diffusion/overlay-presence' }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.sources).toEqual({ regie: '2026-09-28T20:00:00Z' });
    expect(typeof res.body.now).toBe('string');
  });
});
