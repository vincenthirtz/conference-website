// tests/unit/apiAdminUsersExport.test.ts
//
// GET /api/admin/users/export — export CSV des comptes, produit côté serveur.
//
// Ce qui compte :
//   - la permission `manage_staff` (même garde que la liste) ;
//   - les MÊMES filtres que la liste, transmis à la RPC ;
//   - l'export est journalisé (`export_users`) — il contient des emails ;
//   - un fichier plafonné le dit (`X-Export-Truncated`), il ne ment pas ;
//   - anti-injection de formule dans les cellules.

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
  setRpcResult,
  rpcCalls,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/users/export';
import { collectUsersForExport } from '../../features/admin/users/service/export';
import {
  buildUsersCsv,
  usersCsvCell,
} from '../../features/admin/users/usersExport';

const USER = 'user-staff';

let _t = 0;
function makeReq(query: Record<string, string> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query,
    body: {},
  };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

function seedStaff(role: string) {
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'staff@example.test',
      role,
      display_name: 'Staff',
      avatar_url: null,
      is_active: true,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

const ROWS = [
  {
    id: 'u-1',
    email: 'alice@example.test',
    role: 'player',
    display_name: 'Alice',
    created_at: '2026-01-02T00:00:00.000Z',
    last_sign_in_at: '2026-09-01T10:00:00.000Z',
    banned_until: null,
    total_count: 2,
  },
  {
    id: 'u-2',
    email: 'bob@example.test',
    role: 'admin',
    display_name: '=HYPERLINK("http://evil")',
    created_at: '2026-01-03T00:00:00.000Z',
    last_sign_in_at: null,
    banned_until: null,
    total_count: 2,
  },
];

function staffLogs(): any[] {
  return ((store as any).staff_logs ?? []) as any[];
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  rpcCalls.length = 0;
  setAuthUser({ id: USER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seedStaff('admin');
  setRpcResult('admin_list_users', { data: ROWS });
  (store as any).user_discord_links = [
    {
      auth_user_id: 'u-1',
      discord_user_id: '123',
      discord_username: 'alice#1',
    },
  ];
});

describe('GET /api/admin/users/export', () => {
  it('renvoie le CSV complet, en pièce jointe, sans cache', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(String(res.headers['Content-Disposition'])).toMatch(
      /^attachment; filename="utilisateurs-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    expect(res.headers['X-Export-Count']).toBe('2');
    expect(res.headers['X-Export-Truncated']).toBe('0');
    expect(String(res.headers['Cache-Control'])).toContain('no-store');

    const lines = String(res.body).replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe(
      'id,email,display_name,account_role,role_scope,created_at,last_sign_in_at,banned_until,discord,teams'
    );
    expect(lines[1]).toContain('alice@example.test');
    expect(lines[1]).toContain('alice#1');
    expect(lines[1]).toContain(',community,');
    expect(lines[2]).toContain(',staff,');
  });

  it('transmet les MÊMES filtres que la liste à la RPC', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        search: 'ali',
        role: 'player',
        filters: 'suspended,nodiscord',
        sort: 'email',
        dir: 'asc',
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const call = rpcCalls.find((c) => c.fn === 'admin_list_users');
    expect(call?.params).toMatchObject({
      p_query: 'ali',
      p_role: 'player',
      p_sort: 'email',
      p_dir: 'asc',
      p_limit: 200,
      p_offset: 0,
    });
  });

  it('journalise chaque export (export_users) avec filtres et volume', async () => {
    const res = makeRes();
    await handler(makeReq({ search: 'ali' }), res);
    expect(res.statusCode).toBe(200);

    const logs = staffLogs().filter((l) => l.action === 'export_users');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      staff_id: 'staff-1',
      entity_type: 'user',
    });
    expect(logs[0].payload).toMatchObject({
      kind: 'users_export',
      count: 2,
      truncated: false,
      permission: 'manage_staff',
    });
    expect(logs[0].payload.filters.search).toBe('ali');
  });

  it('refuse un staff sans manage_staff (caster) — rien exporté, rien journalisé', async () => {
    seedStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
    expect(staffLogs().filter((l) => l.action === 'export_users')).toEqual([]);
    expect(rpcCalls.some((c) => c.fn === 'admin_list_users')).toBe(false);
  });

  it('refuse une méthode autre que GET (405)', async () => {
    const res = makeRes();
    await handler({ ...makeReq(), method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('collectUsersForExport — plafond', () => {
  const ctx = () =>
    ({
      db: supabaseAdmin,
      tenantId: 't',
      logger: { error: () => {}, warn: () => {}, info: () => {} },
    }) as any;

  it('signale un export tronqué au-delà du plafond', async () => {
    const out = await collectUsersForExport(
      ctx(),
      {},
      { maxRows: 1, pageSize: 1 }
    );
    expect(out.truncated).toBe(true);
    expect(out.items).toHaveLength(1);
  });

  it('un total pile au plafond n’est PAS annoncé tronqué', async () => {
    setRpcResult('admin_list_users', { data: [ROWS[0]] });
    const out = await collectUsersForExport(
      ctx(),
      {},
      { maxRows: 1, pageSize: 2 }
    );
    expect(out.truncated).toBe(false);
    expect(out.items).toHaveLength(1);
  });
});

describe('mise en forme CSV', () => {
  it('neutralise les formules et échappe les séparateurs', () => {
    expect(usersCsvCell('=1+1')).toBe("'=1+1");
    expect(usersCsvCell('@cmd')).toBe("'@cmd");
    expect(usersCsvCell('a,b')).toBe('"a,b"');
    expect(usersCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(usersCsvCell(null)).toBe('');
  });

  it('BOM + CRLF, une ligne par compte', () => {
    const csv = buildUsersCsv([
      {
        id: 'u',
        email: null,
        role: null,
        display_name: null,
        created_at: null,
        last_sign_in_at: null,
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
