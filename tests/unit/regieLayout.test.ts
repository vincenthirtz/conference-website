// Mise en page de la source OBS plein écran `/overlay/regie`.
//
//   - la forme (utils/overlay/regieLayout) : défauts = mise en page d'origine,
//     valeurs bornées, entrée quelconque tolérée ;
//   - le placement : chaque ancrage colle l'élément au bon bord, un axe centré
//     s'étend sur toute la scène (pas de `left: 50%` qui couperait un bandeau) ;
//   - la route admin : lecture (défauts), enregistrement (manage_broadcast),
//     refus d'une casteuse ;
//   - la source la reçoit avec son flux (`/api/overlay/alerts?with=mvp`).

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID as TENANT,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  DEFAULT_REGIE_LAYOUT,
  normalizeRegieLayout,
  slotStyle,
} from '../../utils/overlay/regieLayout';
import layoutHandler from '../../pages/api/admin/diffusion/regie-layout';
import alertsHandler from '../../pages/api/overlay/alerts';

/* ------------------------------------------------------------------ pur */

describe('normalizeRegieLayout', () => {
  it('rien ou n’importe quoi : la mise en page d’origine', () => {
    expect(normalizeRegieLayout(null)).toEqual(DEFAULT_REGIE_LAYOUT);
    expect(normalizeRegieLayout('x')).toEqual(DEFAULT_REGIE_LAYOUT);
    expect(DEFAULT_REGIE_LAYOUT.mvp.anchor).toBe('tc');
    expect(DEFAULT_REGIE_LAYOUT.partners.anchor).toBe('bc');
  });

  it('partielle : complétée élément par élément, bornée', () => {
    const l = normalizeRegieLayout({
      mvp: { anchor: 'tr', x: 5000, scale: 9, visible: false },
      don: { anchor: 'zz' },
    });
    expect(l.mvp).toEqual({
      anchor: 'tr',
      x: 1920,
      y: 0,
      scale: 2,
      visible: false,
    });
    expect(l.don.anchor).toBe(DEFAULT_REGIE_LAYOUT.don.anchor);
    expect(l.alerts).toEqual(DEFAULT_REGIE_LAYOUT.alerts);
  });
});

describe('slotStyle', () => {
  const slot = (anchor: string, x = 0, y = 0, scale = 1) =>
    ({ anchor, x, y, scale, visible: true }) as never;

  it('coins : collé aux bords, décalage en pixels', () => {
    expect(slotStyle(slot('tl', 20, 30))).toMatchObject({ left: 20, top: 30 });
    // Bas-droite : un décalage négatif éloigne du bord.
    expect(slotStyle(slot('br', -40, -240))).toMatchObject({
      right: 40,
      bottom: 240,
    });
  });

  it('axe centré : toute la largeur, centrage flex, décalage par translation', () => {
    const s = slotStyle(slot('bc', 100, 0));
    expect(s).toMatchObject({
      left: 0,
      right: 0,
      justifyContent: 'center',
      bottom: -0,
    });
    expect(s.transform).toBe('translate(100px, 0px)');
  });

  it('échelle depuis l’ancrage, et facteur d’aperçu', () => {
    const s = slotStyle(slot('br', -100, 0, 0.5), { k: 0.5, globalScale: 2 });
    expect(s.right).toBe(50);
    expect(s.transform).toBeUndefined(); // 0.5 × 2 = 1
    expect(s.transformOrigin).toBe('right bottom');
  });
});

/* ---------------------------------------------------------- route admin */

function staffRow(role: 'admin' | 'caster'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}
let n = 0;
function req(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    query: {},
    body: {},
    cookies: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}
function res() {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.send = (b: unknown) => ((r.body = b), r);
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  r.getHeader = (k: string) => r.headers[k];
  return r;
}

const custom = {
  ...DEFAULT_REGIE_LAYOUT,
  mvp: { anchor: 'tr', x: -60, y: 40, scale: 0.7, visible: true },
  partners: { ...DEFAULT_REGIE_LAYOUT.partners, visible: false },
};

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
  store.staff_logs = [] as any;
  store.regie_overlay_layouts = [] as any;
  store.stream_alert_events = [] as any;
  store.helloasso_donations = [] as any;
  store.stream_alert_settings = [] as any;
  store.stream_alert_rules = [] as any;
  store.match_public_mvp_polls = [] as any;
  store.public_mvp_overlay_settings = [] as any;
});

describe('/api/admin/diffusion/regie-layout', () => {
  it('GET : la mise en page d’origine tant que rien n’est enregistré', async () => {
    const r = res();
    await layoutHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.layout).toEqual(DEFAULT_REGIE_LAYOUT);
  });

  it('PUT enregistre ; la source la reçoit avec son flux', async () => {
    const put = res();
    await layoutHandler(req({ method: 'PUT', body: custom }), put);
    expect(put.statusCode).toBe(200);
    expect((store.regie_overlay_layouts as any[])[0].tenant_id).toBe(TENANT);

    const feed = res();
    await alertsHandler(
      {
        method: 'GET',
        headers: { host: 'h' },
        query: { with: 'mvp' },
        cookies: {},
        socket: { remoteAddress: '127.0.0.2' },
      } as any,
      feed
    );
    expect(feed.statusCode).toBe(200);
    expect(feed.body.layout.mvp).toEqual(custom.mvp);
    expect(feed.body.layout.partners.visible).toBe(false);
  });

  it('le flux sans `with=mvp` (boîte d’alertes seule) ne porte pas de mise en page', async () => {
    const feed = res();
    await alertsHandler(
      {
        method: 'GET',
        headers: { host: 'h' },
        query: {},
        cookies: {},
        socket: { remoteAddress: '127.0.0.3' },
      } as any,
      feed
    );
    expect(feed.body.layout).toBeUndefined();
  });

  it('400 sur une valeur hors bornes ; 403 pour une casteuse', async () => {
    const bad = res();
    await layoutHandler(
      req({
        method: 'PUT',
        body: { ...custom, don: { ...custom.don, scale: 5 } },
      }),
      bad
    );
    expect(bad.statusCode).toBe(400);

    store.staff = [staffRow('caster')] as any;
    invalidateStaffCache();
    const get = res();
    await layoutHandler(req(), get);
    expect(get.statusCode).toBe(200);
    const put = res();
    await layoutHandler(req({ method: 'PUT', body: custom }), put);
    expect(put.statusCode).toBe(403);
  });
});
