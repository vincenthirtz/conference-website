// GET /api/admin/search — recherche transverse (lot A4).
//
// Le seul risque réel d'une recherche transverse est de RÉVÉLER : elle
// interroge cinq familles d'objets d'un coup, et un oubli de filtre y est
// invisible à l'œil. Ces tests portent donc d'abord sur ce qui n'apparaît PAS.

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
import handler from '../../pages/api/admin/search';
import type { StaffRole } from '../../types/admin';

const USER = 'user-1';

let _t = 0;
function makeReq(q: string): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: { q },
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

function seedStaff(role: StaffRole) {
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'a@a.com',
      role,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  invalidateStaffCache();
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER });
  seedStaff('admin');

  store.teams = [
    {
      id: 'team-1',
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Phenix Rising',
      short_name: 'PHX',
      slug: 'phenix',
      is_active: true,
    },
  ] as any;
  store.tournaments = [
    {
      id: 'tour-1',
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Phenix Cup',
      slug: 'phenix-cup',
      status: 'running',
    },
  ] as any;
  store.support_tickets = [
    {
      id: 'ticket-1',
      tenant_id: CONFERENCE_TENANT_ID,
      subject: 'Phenix signalement',
      status: 'open',
    },
  ] as any;
  store.tasks = [
    {
      id: 'task-1',
      tenant_id: CONFERENCE_TENANT_ID,
      title: 'Phenix logo',
      board_id: 'b1',
      status: 'todo',
    },
  ] as any;
  store.matches = [] as any;
});

describe('recherche', () => {
  it('trouve à travers plusieurs familles d’objets', async () => {
    const res = makeRes();
    await handler(makeReq('phenix'), res);

    expect(res.statusCode).toBe(200);
    const kinds = new Set(
      (res.body as any).hits.map((h: any) => h.kind as string)
    );
    expect(kinds.has('team')).toBe(true);
    expect(kinds.has('tournament')).toBe(true);
    expect(kinds.has('ticket')).toBe(true);
    expect(kinds.has('task')).toBe(true);
  });

  it('chaque résultat porte un lien ouvrable', async () => {
    const res = makeRes();
    await handler(makeReq('phenix'), res);
    for (const hit of (res.body as any).hits) {
      expect(hit.href.startsWith('/admin/')).toBe(true);
    }
  });

  it('ne cherche pas sous 2 caractères', async () => {
    const res = makeRes();
    await handler(makeReq('p'), res);
    expect((res.body as any).hits).toEqual([]);
  });

  it('ne met jamais la réponse en cache', async () => {
    const res = makeRes();
    await handler(makeReq('phenix'), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('filtrage par permission — ce qui NE doit PAS apparaître', () => {
  it('un bénévole ne voit ni équipes, ni tournois, ni tickets', async () => {
    seedStaff('helper');
    const res = makeRes();
    await handler(makeReq('phenix'), res);

    const kinds = new Set(
      (res.body as any).hits.map((h: any) => h.kind as string)
    );
    expect(kinds.has('team')).toBe(false);
    expect(kinds.has('tournament')).toBe(false);
    expect(kinds.has('ticket')).toBe(false);
    // Le Kanban interne reste ouvert : c'est là que vivent ses tâches du jour.
    expect(kinds.has('task')).toBe(true);
  });

  it('un caster ne voit pas les tickets support', async () => {
    seedStaff('caster');
    const res = makeRes();
    await handler(makeReq('phenix'), res);
    const kinds = new Set(
      (res.body as any).hits.map((h: any) => h.kind as string)
    );
    expect(kinds.has('ticket')).toBe(false);
  });
});
