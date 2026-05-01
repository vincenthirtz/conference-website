import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setStorageUploadResult,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import templatesHandler from '../../pages/api/admin/tournament-templates';
import statusGuardsHandler from '../../pages/api/admin/tournament/[id]/status-guards';
import uploadHandler from '../../pages/api/admin/upload';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
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

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
    query: {},
    body: {},
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
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/tournament-templates — JSON-blob CRUD via site_settings
 * ---------------------------------------------------------*/

describe('/api/admin/tournament-templates', () => {
  it('GET 200 returns empty list when no templates row exists', async () => {
    store.site_settings = [];
    const res = makeRes();
    await templatesHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).templates).toEqual([]);
  });

  it('GET 200 parses stored JSON array', async () => {
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          {
            id: 'tpl-1',
            name: 'A',
            description: '',
            stages: [{ name: 'Phase A', stage_type: 'group' }],
          },
        ]),
      },
    ] as any;
    const res = makeRes();
    await templatesHandler(makeReq({ method: 'GET' }), res);
    expect((res.body as any).templates).toHaveLength(1);
  });

  it('GET 200 returns empty list when stored value is invalid JSON', async () => {
    store.site_settings = [
      { key: 'custom_tournament_templates', value: 'not-json{' },
    ] as any;
    const res = makeRes();
    await templatesHandler(makeReq({ method: 'GET' }), res);
    expect((res.body as any).templates).toEqual([]);
  });

  it('POST 400 when name missing', async () => {
    const res = makeRes();
    await templatesHandler(
      makeReq({ method: 'POST', body: { stages: [] } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when stages array empty', async () => {
    const res = makeRes();
    await templatesHandler(
      makeReq({ method: 'POST', body: { name: 'A', stages: [] } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when stage type is invalid', async () => {
    const res = makeRes();
    await templatesHandler(
      makeReq({
        method: 'POST',
        body: {
          name: 'A',
          stages: [{ name: 'Phase', stage_type: 'bogus' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 inserts a new template row when none exist', async () => {
    store.site_settings = [];
    const res = makeRes();
    await templatesHandler(
      makeReq({
        method: 'POST',
        body: {
          name: 'New Template',
          description: 'desc',
          stages: [{ name: 'Group', stage_type: 'group' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.site_settings as any).length).toBe(1);
    const stored = JSON.parse((store.site_settings as any)[0].value);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('New Template');
  });

  it('POST 201 updates the existing row when one exists', async () => {
    store.site_settings = [
      { key: 'custom_tournament_templates', value: JSON.stringify([]) },
    ] as any;
    const res = makeRes();
    await templatesHandler(
      makeReq({
        method: 'POST',
        body: {
          name: 'Another',
          stages: [{ name: 'Phase', stage_type: 'bracket' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.site_settings as any).length).toBe(1);
    const stored = JSON.parse((store.site_settings as any)[0].value);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Another');
  });

  it('DELETE 400 when templateId missing', async () => {
    const res = makeRes();
    await templatesHandler(makeReq({ method: 'DELETE', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 404 when template not found', async () => {
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          { id: 'tpl-1', name: 'A', description: '', stages: [] },
        ]),
      },
    ] as any;
    const res = makeRes();
    await templatesHandler(
      makeReq({ method: 'DELETE', body: { templateId: 'unknown' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE 200 removes the matching template', async () => {
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          { id: 'tpl-1', name: 'A', description: '', stages: [] },
          { id: 'tpl-2', name: 'B', description: '', stages: [] },
        ]),
      },
    ] as any;
    const res = makeRes();
    await templatesHandler(
      makeReq({ method: 'DELETE', body: { templateId: 'tpl-1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const stored = JSON.parse((store.site_settings as any)[0].value);
    expect(stored.map((t: any) => t.id)).toEqual(['tpl-2']);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await templatesHandler(makeReq({ method: 'PATCH' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/status-guards
 * ---------------------------------------------------------*/

describe('GET /api/admin/tournament/[id]/status-guards', () => {
  it('400 when id is invalid', async () => {
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'POST', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('404 when tournament does not exist', async () => {
    store.tournaments = [];
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 with all transitions blocked when tournament has no stages/teams', async () => {
    store.tournaments = [{ id: TID, status: 'draft' }] as any;
    store.tournament_stages = [];
    store.tournament_teams = [];
    store.matches = [];
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.current_status).toBe('draft');
    const guards = body.guards as Array<{
      status: string;
      allowed: boolean;
      reason?: string;
    }>;
    const published = guards.find((g) => g.status === 'published')!;
    expect(published.allowed).toBe(false);
    expect(published.reason).toMatch(/au moins 1 phase/);
    const running = guards.find((g) => g.status === 'running')!;
    expect(running.allowed).toBe(false);
  });

  it('200 with running allowed when stages + teams present', async () => {
    store.tournaments = [{ id: TID, status: 'published' }] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: TID }] as any;
    store.tournament_teams = [
      { id: 'tt1', tournament_id: TID, team_id: 't1' },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    const guards = (res.body as any).guards as any[];
    const running = guards.find((g) => g.status === 'running');
    expect(running.allowed).toBe(true);
  });

  it('200 marks completed as not allowed when not running', async () => {
    store.tournaments = [{ id: TID, status: 'published' }] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: TID }] as any;
    store.tournament_teams = [
      { id: 'tt1', tournament_id: TID, team_id: 't1' },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    const completed = ((res.body as any).guards as any[]).find(
      (g) => g.status === 'completed'
    );
    expect(completed.allowed).toBe(false);
  });

  it('200 reports current status as a non-allowed guard', async () => {
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: TID }] as any;
    store.tournament_teams = [
      { id: 'tt1', tournament_id: TID, team_id: 't1' },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await statusGuardsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    const current = ((res.body as any).guards as any[]).find(
      (g) => g.status === 'running'
    );
    expect(current.allowed).toBe(false);
    expect(current.reason).toBe('Statut actuel');
  });
});

/* -----------------------------------------------------------
 * /api/admin/upload
 * ---------------------------------------------------------*/

describe('POST /api/admin/upload', () => {
  // Minimal valid PNG: 8 bytes signature + IHDR start (only header validation matters)
  const pngBuffer = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // signature
    0x00,
    0x00,
    0x00,
    0x0d, // IHDR length
  ]);
  const pngBase64 = pngBuffer.toString('base64');

  // Minimal valid PDF
  const pdfBuffer = Buffer.from([
    0x25,
    0x50,
    0x44,
    0x46,
    0x2d,
    0x31,
    0x2e,
    0x34, // %PDF-1.4
  ]);
  const pdfBase64 = pdfBuffer.toString('base64');

  // Invalid bytes (claims PNG but data is junk)
  const junkBase64 = Buffer.from([0x00, 0x01, 0x02]).toString('base64');

  it('405 on non-POST', async () => {
    const res = makeRes();
    await uploadHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when data or mimeType missing', async () => {
    const res = makeRes();
    await uploadHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 on disallowed mime type', async () => {
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: { data: pngBase64, mimeType: 'application/zip' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when magic bytes do not match the declared mime type', async () => {
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: { data: junkBase64, mimeType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when file too large for the type', async () => {
    // Build a 3MB image buffer with valid PNG header — too large for the 2MB image limit.
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(3 * 1024 * 1024),
    ]);
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: { data: big.toString('base64'), mimeType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 stores PNG and returns the public URL', async () => {
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: {
          data: pngBase64,
          mimeType: 'image/png',
          filename: 'team-logo.png',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.url).toMatch(/teams-images\/team-logo-[a-f0-9]+\.png$/);
    expect(body.filename).toMatch(/^team-logo-[a-f0-9]+\.png$/);
  });

  it('200 stores PDF under documents/ prefix', async () => {
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: {
          data: pdfBase64,
          mimeType: 'application/pdf',
          filename: 'reglement.pdf',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).filename).toMatch(/^documents\//);
  });

  it('500 when storage upload fails', async () => {
    setStorageUploadResult({ error: { message: 'bucket not found' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: { data: pngBase64, mimeType: 'image/png' },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });

  it('strips data URL prefix from base64 input', async () => {
    const res = makeRes();
    await uploadHandler(
      makeReq({
        method: 'POST',
        body: {
          data: `data:image/png;base64,${pngBase64}`,
          mimeType: 'image/png',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
