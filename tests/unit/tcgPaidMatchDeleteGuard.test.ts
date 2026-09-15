// Unit tests — un match qui a payé des récompenses TCG ne se supprime plus
// physiquement.
//
// L'ATTAQUE / LA PANNE : `DELETE /api/admin/matches/[id]?hard=1` (ou la
// suppression groupée d'une phase) effaçait les paquets de victoire en cascade
// — cartes déjà ouvertes comprises — alors que les pièces restaient au
// registre ; le match recréé (nouvel id) repayait les mêmes gagnantes. Ces cas
// prouvent que la suppression est refusée dès qu'il existe UNE trace de
// paiement (paquet OU pièces), qu'un match sans paiement reste supprimable, et
// qu'une lecture en échec refuse au lieu de conclure « rien payé ».

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn(async () => undefined),
}));
vi.mock('@/utils/matches/applyScore', () => ({ applyMatchScore: vi.fn() }));
vi.mock('@/utils/discord', () => ({ notifyMatchStarting: vi.fn() }));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
  emitBotEvents: vi.fn(async () => ({
    persisted: 0,
    delivery: Promise.resolve([]),
  })),
}));
vi.mock('@/utils/matches/botEventEnrich', () => ({
  enrichMatchEvent: vi.fn(async () => null),
}));

import * as mock from './__helpers__/supabaseMock';
const { store, resetSupabaseMock, setAuthUser } = mock;
import { invalidateStaffCache } from '../../utils/staff';
import { readPaidMatchIds } from '../../utils/tcg/paidMatches';
import adminMatchHandler from '../../pages/api/admin/matches/[matchId]';
import stageBulkHandler from '../../pages/api/admin/stages/[stageId]/bulk-matches';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const M_PAID = '550e8400-e29b-41d4-a716-446655440001';
const M_COINS = '550e8400-e29b-41d4-a716-446655440002';
const M_FREE = '550e8400-e29b-41d4-a716-446655440003';
const STAGE = '550e8400-e29b-41d4-a716-446655440050';
const TOUR = '550e8400-e29b-41d4-a716-446655440030';
const PLAYER = '11111111-1111-4111-8111-111111111111';

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function req(over: Record<string, unknown>): any {
  n += 1;
  return {
    method: 'DELETE',
    headers: { host: 'h', authorization: `Bearer paid-${Date.now()}-${n}` },
    query: {},
    body: {},
    ...over,
  };
}
function resp(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const matchIds = () => ((store.matches ?? []) as any[]).map((m) => m.id).sort();

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.staff = [staffRow()] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'a', name: 'A', is_active: true },
    { id: TENANT_B, slug: 'b', name: 'B', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  store.tournaments = [
    { id: TOUR, tenant_id: TENANT_A, status: 'running' },
  ] as any;
  store.tournament_stages = [
    { id: STAGE, tournament_id: TOUR, tenant_id: TENANT_A },
  ] as any;
  store.matches = [M_PAID, M_COINS, M_FREE].map((id) => ({
    id,
    tenant_id: TENANT_A,
    tournament_id: TOUR,
    stage_id: STAGE,
    status: 'completed',
  })) as any;
  // M_PAID : un paquet de victoire. M_COINS : des pièces seules (paquet refusé).
  store.tcg_packs = [
    {
      id: 'p-1',
      tenant_id: TENANT_A,
      user_id: PLAYER,
      source_kind: 'victory',
      source_match_id: M_PAID,
    },
  ] as any;
  store.tcg_wallet_entries = [
    {
      id: 'e-1',
      tenant_id: TENANT_A,
      user_id: PLAYER,
      amount: 100,
      source_kind: 'match_win',
      source_ref: M_COINS,
    },
    // Même id de match dans un AUTRE espace : ne compte pas.
    {
      id: 'e-2',
      tenant_id: TENANT_B,
      user_id: PLAYER,
      amount: 100,
      source_kind: 'match_win',
      source_ref: M_FREE,
    },
  ] as any;
});

describe('readPaidMatchIds', () => {
  it('voit un paquet OU des pièces, dans l’espace seulement', async () => {
    const r = await readPaidMatchIds(TENANT_A, [M_PAID, M_COINS, M_FREE]);
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.paid].sort()).toEqual([M_PAID, M_COINS].sort());
  });

  it('une lecture en échec rend ok:false (jamais « rien payé »)', async () => {
    const original = mock.supabaseAdmin.from.bind(mock.supabaseAdmin);
    vi.spyOn(mock.supabaseAdmin, 'from').mockImplementation(((
      table: string
    ) => {
      if (table !== 'tcg_packs') return original(table);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (ok: any) => ok({ data: null, error: { message: '504' } }),
      };
      return chain;
    }) as any);
    const r = await readPaidMatchIds(TENANT_A, [M_FREE]);
    expect(r.ok).toBe(false);
  });
});

describe('DELETE /api/admin/matches/[matchId]?hard=1', () => {
  it('refuse (409) un match qui a distribué un paquet, sans rien supprimer', async () => {
    const res = resp();
    await adminMatchHandler(
      req({ query: { matchId: M_PAID, hard: '1' } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('MATCH_HAS_TCG_REWARDS');
    expect(matchIds()).toContain(M_PAID);
    expect((store.tcg_packs as any[]).length).toBe(1);
  });

  it('refuse aussi un match qui n’a payé QUE des pièces', async () => {
    const res = resp();
    await adminMatchHandler(
      req({ query: { matchId: M_COINS, hard: '1' } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(matchIds()).toContain(M_COINS);
  });

  it('supprime un match sans récompense', async () => {
    const res = resp();
    await adminMatchHandler(
      req({ query: { matchId: M_FREE, hard: '1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(matchIds()).not.toContain(M_FREE);
  });

  it('la suppression douce (annulation) reste possible sur un match payé', async () => {
    const res = resp();
    await adminMatchHandler(req({ query: { matchId: M_PAID } }), res);
    expect(res.statusCode).toBe(200);
    expect(matchIds()).toContain(M_PAID);
  });
});

describe('DELETE /api/admin/stages/[stageId]/bulk-matches (hard)', () => {
  it('tout ou rien : un seul match payé bloque toute la suppression', async () => {
    const res = resp();
    await stageBulkHandler(
      req({
        query: { stageId: STAGE },
        body: { matchIds: [M_PAID, M_FREE], hard: true },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('MATCH_HAS_TCG_REWARDS');
    expect(res.body.paidMatchIds).toEqual([M_PAID]);
    expect(matchIds()).toEqual([M_PAID, M_COINS, M_FREE].sort());
  });

  it('supprime un lot sans récompense', async () => {
    const res = resp();
    await stageBulkHandler(
      req({
        query: { stageId: STAGE },
        body: { matchIds: [M_FREE], hard: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(matchIds()).not.toContain(M_FREE);
  });
});

describe('migration tcg_packs_source_match_restrict.sql', () => {
  it('remplace la cascade par un RESTRICT sur source_match_id', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../database/migrations/tcg_packs_source_match_restrict.sql'
      ),
      'utf8'
    ).replace(/^\s*--.*$/gm, '');
    expect(sql).toMatch(/REFERENCES public\.matches\(id\) ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });
});
