// GET /api/admin/entity-history — historique contextuel (lot A6).
//
// La route lit le journal STAFF filtré par entité. Le risque n'est pas la
// lecture — c'est le filtre : `entity_type` est du texte libre en base, et
// laisser un client choisir sa valeur ferait de cette route un lecteur
// universel du journal, filtrable par n'importe quoi.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const USER = 'user-1';
const TEAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

let _t = 0;
function makeReq(query: Record<string, string>): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
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
  store.staff_logs = [
    {
      id: 'log-1',
      tenant_id: CONFERENCE_TENANT_ID,
      created_at: '2026-08-01T10:00:00.000Z',
      staff_id: 'staff-1',
      action: 'update_team',
      entity_type: 'team',
      entity_id: TEAM,
      tournament_id: null,
      payload: { after: { name: 'Phenix' } },
    },
    {
      id: 'log-2',
      tenant_id: CONFERENCE_TENANT_ID,
      created_at: '2026-08-02T10:00:00.000Z',
      staff_id: 'staff-1',
      action: 'update_team',
      entity_type: 'team',
      entity_id: OTHER,
      tournament_id: null,
      payload: {},
    },
  ] as any;
});

describe('/api/admin/entity-history', () => {
  it('rend les actions de CETTE fiche, et d’elle seule', async () => {
    const res = makeRes();
    await handler(makeReq({ type: 'team', id: TEAM }), res);

    expect(res.statusCode).toBe(200);
    const logs = (res.body as any).logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe('log-1');
  });

  it('refuse un type d’entité hors de la liste fermée', async () => {
    const res = makeRes();
    await handler(makeReq({ type: 'staff_logs', id: TEAM }), res);
    expect(res.statusCode).toBe(400);
  });

  it('refuse un id qui n’est pas un UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ type: 'team', id: 'tout' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('ne met jamais l’historique en cache', async () => {
    const res = makeRes();
    await handler(makeReq({ type: 'team', id: TEAM }), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('refuse POST', async () => {
    const res = makeRes();
    await handler(
      { ...makeReq({ type: 'team', id: TEAM }), method: 'POST' },
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* ---------------------------------------------------------------------------
 * Couverture des fiches branchées (lot A6, seconde passe).
 *
 * Le tiroir n'a de valeur que si les entités qu'il accepte sont CELLES que le
 * journal écrit. Ce test lit les deux côtés : la liste fermée de la route, et
 * les `entity_type` réellement journalisés par les handlers admin. Une entité
 * acceptée mais jamais écrite rendrait un tiroir vide ; une entité écrite mais
 * refusée rendrait un tiroir inaccessible.
 * ------------------------------------------------------------------------- */

describe('types d’entité acceptés vs journalisés', () => {
  it('chaque type accepté est réellement écrit par au moins un handler', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { HISTORY_ENTITY_TYPES } = await import(
      '../../pages/api/admin/entity-history'
    );

    const roots = [path.join(process.cwd(), 'pages', 'api', 'admin')];
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts'))
          sources.push(fs.readFileSync(full, 'utf8'));
      }
    };
    roots.forEach(walk);
    const all = sources.join('\n');

    const orphans = HISTORY_ENTITY_TYPES.filter(
      (type) => !all.includes(`entity_type: '${type}'`)
    );

    expect(
      orphans,
      `Types acceptés par la route mais jamais journalisés (tiroir vide garanti) :\n  ${orphans.join('\n  ')}`
    ).toEqual([]);
  });
});
