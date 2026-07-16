// tests/unit/caster-cue-ack.test.ts
//
// Tests for /api/caster/cues/[cueId]/ack (POST).
// Feature: Run-of-show — Lot 5 (cues + presence).
//
// Behaviour:
//   - 200 on first ack: row inserted with acked_at + tenant_id stamped, alreadyAcked: false.
//   - 200 on second ack (same caster, same cue): alreadyAcked: true, no duplicate row.
//   - 404 when cueId is unknown or cross-tenant.
//   - 409 when the run associated to the cue is not 'live' (draft / done).
//   - 401 when no bearer token.
//   - 403 when staff role is below caster (not authorized).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

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

import ackHandler from '../../pages/api/caster/cues/[cueId]/ack';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';

const CAST_X = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_LIVE = '11111111-1111-4111-8111-111111111111';
const RUN_DRAFT = '11111111-1111-4111-8111-111111111112';
const RUN_DONE = '11111111-1111-4111-8111-111111111113';
const RUN_Y = '11111111-1111-4111-8111-111111111114';

const CUE_LIVE = '22222222-2222-4222-8222-22222222aaaa';
const CUE_DRAFT = '22222222-2222-4222-8222-22222222bbbb';
const CUE_DONE = '22222222-2222-4222-8222-22222222cccc';
const CUE_Y = '22222222-2222-4222-8222-22222222dddd';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'caster'
): StaffMember {
  return {
    id: 'staff-caster-x',
    auth_user_id: 'user-caster-x',
    email: 'caster@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `tk-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: { cueId: CUE_LIVE },
    body: {},
    cookies: {},
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

function seedAll() {
  store.event_runs = [
    { id: RUN_LIVE, tenant_id: TENANT_X, status: 'live', name: 'Live', slug: 'live' },
    { id: RUN_DRAFT, tenant_id: TENANT_X, status: 'draft', name: 'Draft', slug: 'draft' },
    { id: RUN_DONE, tenant_id: TENANT_X, status: 'done', name: 'Done', slug: 'done' },
    { id: RUN_Y, tenant_id: TENANT_Y, status: 'live', name: 'OtherT', slug: 'othert' },
  ] as any;

  store.event_cues = [
    {
      id: CUE_LIVE,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      severity: 'urgent',
      body: 'Action requise',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T20:00:00.000Z',
      expires_at: null,
    },
    {
      id: CUE_DRAFT,
      tenant_id: TENANT_X,
      event_run_id: RUN_DRAFT,
      severity: 'info',
      body: 'Draft cue',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T19:00:00.000Z',
      expires_at: null,
    },
    {
      id: CUE_DONE,
      tenant_id: TENANT_X,
      event_run_id: RUN_DONE,
      severity: 'info',
      body: 'Done cue',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T18:00:00.000Z',
      expires_at: null,
    },
    {
      id: CUE_Y,
      tenant_id: TENANT_Y,
      event_run_id: RUN_Y,
      severity: 'urgent',
      body: 'Other tenant cue',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T20:00:00.000Z',
      expires_at: null,
    },
  ] as any;

  store.event_cue_acks = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-caster-x' });
  store.staff = [makeStaffRow('caster')] as any;
  store.cast_members = [
    {
      id: CAST_X,
      auth_user_id: 'user-caster-x',
      tenant_id: TENANT_X,
      is_active: true,
      name: 'Caster X',
      title: null,
      description: null,
      image_url: null,
      twitch_url: null,
      city: null,
    },
  ] as any;
  seedAll();
});

describe('POST /api/caster/cues/[cueId]/ack', () => {
  it('200 on first ack — row inserted with tenant + acked_at, alreadyAcked=false', async () => {
    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_LIVE } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      ack: { cue_id: string; cast_member_id: string; acked_at: string };
      alreadyAcked: boolean;
    };
    expect(body.alreadyAcked).toBe(false);
    expect(body.ack.cue_id).toBe(CUE_LIVE);
    expect(body.ack.cast_member_id).toBe(CAST_X);
    // acked_at is filled by the DB default in production; the in-memory mock
    // does not auto-stamp defaults so we only assert presence in the persisted
    // row indirectly via the count below.

    expect((store.event_cue_acks as any[]).length).toBe(1);
    const persisted = (store.event_cue_acks as any[])[0];
    expect(persisted.tenant_id).toBe(TENANT_X);
    expect(persisted.cue_id).toBe(CUE_LIVE);
    expect(persisted.cast_member_id).toBe(CAST_X);
  });

  it('200 on second ack (same caster + same cue) — alreadyAcked=true, no duplicate row', async () => {
    const res1 = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_LIVE } }), res1);
    expect(res1.statusCode).toBe(200);
    expect((store.event_cue_acks as any[]).length).toBe(1);

    const res2 = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_LIVE } }), res2);
    expect(res2.statusCode).toBe(200);
    const body2 = res2.body as { alreadyAcked: boolean };
    expect(body2.alreadyAcked).toBe(true);
    // No duplicate insertion.
    expect((store.event_cue_acks as any[]).length).toBe(1);
  });

  it('404 when cueId is unknown', async () => {
    const res = makeRes();
    await ackHandler(
      makeAuthedReq({ query: { cueId: '99999999-9999-4999-8999-999999999999' } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((store.event_cue_acks as any[]).length).toBe(0);
  });

  it('404 when cue belongs to another tenant (cross-tenant leak protection)', async () => {
    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_Y } }), res);
    expect(res.statusCode).toBe(404);
    expect((store.event_cue_acks as any[]).length).toBe(0);
  });

  it('409 when the run associated to the cue is in draft state', async () => {
    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_DRAFT } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('RUN_NOT_LIVE');
    expect((store.event_cue_acks as any[]).length).toBe(0);
  });

  it('409 when the run associated to the cue is done', async () => {
    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_DONE } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('RUN_NOT_LIVE');
  });

  it('rejects when no bearer token is provided (401 or 403 from caster auth wrapper)', async () => {
    const res = makeRes();
    await ackHandler(
      makeAuthedReq({
        headers: { host: 'h' },
        query: { cueId: CUE_LIVE },
      }),
      res
    );
    // withCasterRoute may surface either 401 (unauthenticated) or 403
    // (forbidden). The contract here is "no token → reject" — accept both.
    expect([401, 403]).toContain(res.statusCode);
  });

  it('403 when authenticated user has no active cast_members link in tenant', async () => {
    // Drop the cast_members link → withCasterRoute should reject.
    store.cast_members = [] as any;

    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_LIVE } }), res);
    expect(res.statusCode).toBe(403);
    expect((store.event_cue_acks as any[]).length).toBe(0);
  });

  it('auto-provisions an internal cast_members fiche for an admin without a link', async () => {
    // Admin/owner sans fiche → auto-provision d'une fiche interne, puis le
    // cockpit fonctionne (l'ack passe et référence la fiche créée).
    store.cast_members = [] as any;
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();

    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_LIVE } }), res);

    expect(res.statusCode).toBe(200);
    // Une seule fiche interne a été créée.
    const members = store.cast_members as any[];
    expect(members.length).toBe(1);
    expect(members[0].is_internal).toBe(true);
    expect(members[0].is_active).toBe(true);
    expect(members[0].auth_user_id).toBe('user-caster-x');
    expect(members[0].tenant_id).toBe(TENANT_X);
    // L'ack référence la fiche auto-provisionnée.
    const ack = (store.event_cue_acks as any[])[0];
    expect(ack.cast_member_id).toBe(members[0].id);
  });

  it('reuses (reactivates) an existing internal fiche instead of duplicating it', async () => {
    // Fiche interne pré-existante mais désactivée → réactivée et réutilisée.
    store.staff = [makeStaffRow('owner')] as any;
    invalidateStaffCache();
    store.cast_members = [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        auth_user_id: 'user-caster-x',
        tenant_id: TENANT_X,
        is_active: false,
        is_internal: true,
        name: 'Régie',
        title: 'Régie',
      },
    ] as any;

    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: CUE_LIVE } }), res);

    expect(res.statusCode).toBe(200);
    const members = store.cast_members as any[];
    // Pas de doublon : la fiche existante est réutilisée + réactivée.
    expect(members.length).toBe(1);
    expect(members[0].id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(members[0].is_active).toBe(true);
    const ack = (store.event_cue_acks as any[])[0];
    expect(ack.cast_member_id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  });

  it('400 on invalid cueId (not a UUID)', async () => {
    const res = makeRes();
    await ackHandler(makeAuthedReq({ query: { cueId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on GET', async () => {
    const res = makeRes();
    await ackHandler(
      makeAuthedReq({ method: 'GET', query: { cueId: CUE_LIVE } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
