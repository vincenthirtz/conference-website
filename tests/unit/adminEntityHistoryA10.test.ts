// Historique par fiche étendu (lot A10) : demande, adhérent, partenaire,
// actu, scrim, phase. Le test de couverture d'adminEntityHistory.test.ts
// vérifie déjà que chaque type est ÉCRIT quelque part ; celui-ci vérifie que
// la route les ACCEPTE, que la portée tenant tient, et que les actus — qui ne
// journalisaient que la création — tracent désormais modification et
// suppression sous la même entité.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/entity-history';
import { HISTORY_ENTITY_TYPES } from '../../features/admin/logs/schemas';

const USER = 'user-1';
const ID = '33333333-3333-4333-8333-333333333333';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A10_TYPES = [
  'demande',
  'adherent',
  'partner',
  'news',
  'scrim',
  'stage',
] as const;

let _t = 0;
function makeReq(query: Record<string, string>): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer a10-${Date.now()}-${_t}` },
    query,
    body: {},
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'a@a.com',
      role: 'admin',
      display_name: 'Admin',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
});

describe('entity-history — types du lot A10', () => {
  it('la liste fermée contient les six nouvelles fiches', () => {
    for (const type of A10_TYPES) {
      expect(HISTORY_ENTITY_TYPES).toContain(type);
    }
  });

  for (const type of A10_TYPES) {
    it(`${type} : rend les entrées de la fiche, pas celles d’un autre espace`, async () => {
      store.staff_logs = [
        {
          id: `log-${type}`,
          tenant_id: CONFERENCE_TENANT_ID,
          created_at: '2026-10-01T10:00:00.000Z',
          staff_id: 'staff-1',
          action: 'update',
          entity_type: type,
          entity_id: ID,
          tournament_id: null,
          payload: {},
        },
        {
          id: `log-${type}-other-tenant`,
          tenant_id: OTHER_TENANT,
          created_at: '2026-10-02T10:00:00.000Z',
          staff_id: 'staff-1',
          action: 'update',
          entity_type: type,
          entity_id: ID,
          tournament_id: null,
          payload: {},
        },
      ] as any;

      const res = makeRes();
      await handler(makeReq({ type, id: ID }), res);
      expect(res.statusCode).toBe(200);
      const logs = (res.body as any).logs;
      expect(logs.map((l: any) => l.id)).toEqual([`log-${type}`]);
    });
  }
});

describe('actus : modification et suppression journalisées sous `news`', () => {
  it('PUT et DELETE de /api/admin/news/[id] écrivent entity_type news / entity_id = id', () => {
    const src = readFileSync(
      resolve(__dirname, '../../features/admin/news/routes/byId.ts'),
      'utf8'
    );
    expect(src).toContain("audit: 'update_news'");
    expect(src).toContain("audit: 'delete_news'");
    const audits = src.match(/entity_type: 'news',\s*entity_id: query\.id/g);
    expect(audits).toHaveLength(2);
    expect(src).not.toMatch(/audit: false/);
  });
});
