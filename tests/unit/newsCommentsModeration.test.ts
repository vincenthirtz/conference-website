// tests/unit/newsCommentsModeration.test.ts
//
// Modération des commentaires (migration news_comments_moderation) :
//   - lecture publique : seulement `visible` (ni `pending`, ni `hidden`) ;
//   - pré-modération (site_settings `news_comments_moderation` = pre) : le
//     commentaire naît `pending`, réponse `pending: true` ; défaut inchangé ;
//   - article fermé : 403 COMMENTS_CLOSED, `commentsClosed` dans la liste ;
//   - admin : file filtrée par statut, actions en masse bornées au tenant,
//     réglage de pré-modération, fermeture d'article.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async (_params?: any) => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { generateChallenge } from '../../utils/captcha';
import publicHandler from '../../pages/api/news/comments';
import queueHandler from '../../pages/api/admin/moderation/comments/index';
import settingsHandler from '../../pages/api/admin/moderation/comments/settings';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-mod-1';
const NEWS_ID = '33333333-3333-4333-8333-333333333333';
const C1 = '44444444-4444-4444-8444-444444444401';
const C2 = '44444444-4444-4444-8444-444444444402';
const C3 = '44444444-4444-4444-8444-444444444403';
const C_OTHER = '44444444-4444-4444-8444-444444444499';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-mod' },
    cookies: { staff_active_tenant_id: TENANT },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

async function freshCaptcha() {
  const ch = await generateChallenge();
  if (!ch) throw new Error('captcha indisponible');
  const m = ch.question.match(/^(\d+)\s+([+\-×])\s+(\d+)$/)!;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const answer = m[2] === '+' ? a + b : m[2] === '-' ? a - b : a * b;
  return { captchaToken: ch.token, captchaAnswer: String(answer) };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: AUTH_USER_ID });
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: AUTH_USER_ID,
      email: 'mod@example.com',
      role: 'admin',
      display_name: 'Mod',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: OTHER, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ------------------------------------------------------------------------ */

describe('lecture publique', () => {
  it('ne rend que les commentaires visibles (ligne sans statut = visible)', async () => {
    store.news = [{ id: NEWS_ID, status: 'published' }] as any;
    store.news_comments = [
      {
        id: 'v',
        news_id: NEWS_ID,
        content: 'ok',
        status: 'visible',
        created_at: '2026-01-03',
      },
      {
        id: 'p',
        news_id: NEWS_ID,
        content: 'wait',
        status: 'pending',
        created_at: '2026-01-02',
      },
      {
        id: 'h',
        news_id: NEWS_ID,
        content: 'nope',
        status: 'hidden',
        created_at: '2026-01-01',
      },
      {
        id: 'legacy',
        news_id: NEWS_ID,
        content: 'old',
        created_at: '2025-01-01',
      },
    ] as any;
    const res = makeRes();
    await publicHandler(makeReq({ query: { newsId: NEWS_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items.map((c: any) => c.id).sort()).toEqual([
      'legacy',
      'v',
    ]);
    expect((res.body as any).commentsClosed).toBe(false);
  });

  it('signale un article fermé', async () => {
    store.news = [
      { id: NEWS_ID, status: 'published', comments_closed: true },
    ] as any;
    store.news_comments = [];
    const res = makeRes();
    await publicHandler(makeReq({ query: { newsId: NEWS_ID } }), res);
    expect((res.body as any).commentsClosed).toBe(true);
  });
});

describe('publication', () => {
  it('défaut : publication directe, pas de statut écrit', async () => {
    store.news = [{ id: NEWS_ID, status: 'published' }] as any;
    store.news_comments = [];
    const res = makeRes();
    await publicHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: NEWS_ID,
          content: 'Bravo à toutes !',
          ...(await freshCaptcha()),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).pending).toBeUndefined();
    expect((store.news_comments as any[])[0].status).toBeUndefined();
  });

  it('pré-modération : le commentaire naît en attente', async () => {
    store.news = [{ id: NEWS_ID, status: 'published' }] as any;
    store.news_comments = [];
    store.site_settings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        key: 'news_comments_moderation',
        value: 'pre',
      },
    ] as any;
    const res = makeRes();
    await publicHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: NEWS_ID,
          content: 'En attente svp',
          ...(await freshCaptcha()),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).pending).toBe(true);
    expect((store.news_comments as any[])[0].status).toBe('pending');
  });

  it('article fermé : 403 COMMENTS_CLOSED, rien d’inséré', async () => {
    store.news = [
      { id: NEWS_ID, status: 'published', comments_closed: true },
    ] as any;
    store.news_comments = [];
    const res = makeRes();
    await publicHandler(
      makeReq({
        method: 'POST',
        body: {
          newsId: NEWS_ID,
          content: 'Trop tard ?',
          ...(await freshCaptcha()),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('COMMENTS_CLOSED');
    expect(store.news_comments).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------ */

function seedQueue() {
  store.news_comments = [
    {
      id: C1,
      tenant_id: TENANT,
      news_id: NEWS_ID,
      content: 'a',
      status: 'pending',
      created_at: '2026-01-03',
    },
    {
      id: C2,
      tenant_id: TENANT,
      news_id: NEWS_ID,
      content: 'b',
      status: 'visible',
      created_at: '2026-01-02',
    },
    {
      id: C3,
      tenant_id: TENANT,
      news_id: NEWS_ID,
      content: 'c',
      status: 'hidden',
      created_at: '2026-01-01',
    },
    {
      id: C_OTHER,
      tenant_id: OTHER,
      news_id: NEWS_ID,
      content: 'x',
      status: 'visible',
      created_at: '2026-01-01',
    },
  ] as any;
}

describe('admin : file de modération', () => {
  it('filtre par statut et compte les commentaires en attente', async () => {
    seedQueue();
    const res = makeRes();
    await queueHandler(makeReq({ query: { status: 'pending' } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.comments.map((c: any) => c.id)).toEqual([C1]);
    expect(body.counts.pending).toBe(1);
    expect(body.status_available).toBe(true);
  });

  it('masque une sélection, sans toucher un autre espace', async () => {
    seedQueue();
    const res = makeRes();
    await queueHandler(
      makeReq({
        method: 'POST',
        body: { ids: [C1, C2, C_OTHER], action: 'hide' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).affected).toBe(2);
    const status = Object.fromEntries(
      (store.news_comments as any[]).map((c) => [c.id, c.status])
    );
    expect(status[C1]).toBe('hidden');
    expect(status[C2]).toBe('hidden');
    expect(status[C_OTHER]).toBe('visible');
    const log = logStaffActionMock.mock.calls[0][0];
    expect(log.action).toBe('moderate_comments');
    expect(log.payload.affected).toBe(2);
  });

  it('supprime une sélection', async () => {
    seedQueue();
    const res = makeRes();
    await queueHandler(
      makeReq({ method: 'POST', body: { ids: [C3], action: 'delete' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news_comments as any[]).map((c) => c.id)).not.toContain(C3);
  });

  it('400 sur une sélection vide ou une action inconnue', async () => {
    seedQueue();
    for (const body of [
      { ids: [], action: 'hide' },
      { ids: [C1], action: 'purge' },
    ]) {
      const res = makeRes();
      await queueHandler(makeReq({ method: 'POST', body }), res);
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('admin : réglages', () => {
  it('active la pré-modération pour le tenant courant', async () => {
    store.site_settings = [];
    store.news_comments = [];
    const res = makeRes();
    await settingsHandler(
      makeReq({ method: 'PUT', body: { pre_moderation: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.site_settings as any[]).find(
      (s) => s.key === 'news_comments_moderation'
    );
    expect(row.value).toBe('pre');
    expect(row.tenant_id).toBe(TENANT);

    const get = makeRes();
    await settingsHandler(makeReq(), get);
    expect((get.body as any).pre_moderation).toBe(true);
  });

  it('ferme les commentaires d’un article du tenant, 404 ailleurs', async () => {
    store.news = [
      {
        id: NEWS_ID,
        tenant_id: TENANT,
        title: 'Finale',
        comments_closed: false,
      },
    ] as any;
    const res = makeRes();
    await settingsHandler(
      makeReq({
        method: 'PATCH',
        body: { news_id: NEWS_ID, comments_closed: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news as any[])[0].comments_closed).toBe(true);

    const missing = makeRes();
    await settingsHandler(
      makeReq({
        method: 'PATCH',
        body: {
          news_id: '55555555-5555-4555-8555-555555555555',
          comments_closed: true,
        },
      }),
      missing
    );
    expect(missing.statusCode).toBe(404);
  });
});
