// tests/unit/apiAdminBroadcastDuplicate.test.ts
//
// Endpoint tests for the campaign duplication route:
//   - POST /api/admin/broadcast/{id}/duplicate → 201 { campaign: { id } }
//
// Duplicating copies the source's structured content into a NEW email_campaigns
// row that is ALWAYS 'draft' (never active/sendable by accident), gets a fresh
// unique slug id derived from `${source.name} (copie)`, and sends no email.
//
// Auth/staff context + in-memory supabase mock mirror
// apiAdminBroadcastCampaign.test.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import duplicateHandler from '../../pages/api/admin/broadcast/[campaignId]/duplicate';

const BUILTIN_ID = 'idahobit-live-2026';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
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

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
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
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function campaignRows() {
  return (store.email_campaigns ?? []) as any[];
}

function seedDbCampaign(over: Record<string, unknown> = {}) {
  const row = {
    id: 'ma-campagne',
    name: 'Ma campagne',
    description: 'desc source',
    subject: 'objet source',
    audience: 'all-confirmed-users',
    status: 'active',
    heading: 'titre source',
    greeting_enabled: false,
    body_paragraphs: ['p1', 'p2'],
    cta_label: 'Voir',
    cta_url: 'https://example.com',
    footer_note: 'note source',
    created_at: '2026-05-01T00:00:00Z',
    created_by: 'someone-else',
    ...over,
  };
  store.email_campaigns = [row] as any;
  return row.id as string;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  store.email_campaigns = [] as any;
});

describe('POST /api/admin/broadcast/{campaignId}/duplicate', () => {
  it('201s and creates a draft copy with copied content and a new slug id', async () => {
    const id = seedDbCampaign();
    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'POST', query: { campaignId: id } }),
      res
    );

    expect(res.statusCode).toBe(201);
    const newId = (res.body as any).campaign.id;
    expect(newId).toBe('ma-campagne-copie');

    const rows = campaignRows();
    expect(rows).toHaveLength(2);
    const copy = rows.find((r) => r.id === newId)!;
    expect(copy.name).toBe('Ma campagne (copie)');
    // Structured content is copied verbatim from the source.
    expect(copy.subject).toBe('objet source');
    expect(copy.description).toBe('desc source');
    expect(copy.heading).toBe('titre source');
    expect(copy.greeting_enabled).toBe(false);
    expect(copy.body_paragraphs).toEqual(['p1', 'p2']);
    expect(copy.cta_label).toBe('Voir');
    expect(copy.cta_url).toBe('https://example.com');
    expect(copy.footer_note).toBe('note source');
    // Copy is always draft, regardless of the source's active status.
    expect(copy.status).toBe('draft');
    // Ownership is reassigned to the acting staff user.
    expect(copy.created_by).toBe('user-1');
    // Source row is untouched.
    expect(rows.find((r) => r.id === id)!.status).toBe('active');
  });

  it('forces status=draft even when the source is active', async () => {
    const id = seedDbCampaign({ status: 'active' });
    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'POST', query: { campaignId: id } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const copy = campaignRows().find(
      (r) => r.id === (res.body as any).campaign.id
    )!;
    expect(copy.status).toBe('draft');
  });

  it('suffixes the slug with -2 when the copy id already exists', async () => {
    const id = seedDbCampaign();
    // Pre-seed a row occupying the natural copy slug.
    campaignRows().push({
      id: 'ma-campagne-copie',
      name: 'Ma campagne (copie)',
      description: '',
      subject: 's',
      audience: 'all-confirmed-users',
      status: 'draft',
      heading: 'h',
      greeting_enabled: true,
      body_paragraphs: ['x'],
      cta_label: null,
      cta_url: null,
      footer_note: null,
      created_at: '2026-05-02T00:00:00Z',
    });

    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'POST', query: { campaignId: id } }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((res.body as any).campaign.id).toBe('ma-campagne-copie-2');
  });

  it('derives minimal valid content when the source has no structured body (builtin)', async () => {
    // The builtin campaign resolves via the catalog fallback and has no
    // structured body → the route must synthesise a valid draft.
    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'POST', query: { campaignId: BUILTIN_ID } }),
      res
    );

    expect(res.statusCode).toBe(201);
    const copy = campaignRows().find(
      (r) => r.id === (res.body as any).campaign.id
    )!;
    expect(copy.status).toBe('draft');
    expect(Array.isArray(copy.body_paragraphs)).toBe(true);
    expect(copy.body_paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(String(copy.heading).length).toBeGreaterThan(0);
  });

  it('404s when the source campaign does not exist', async () => {
    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'POST', query: { campaignId: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(campaignRows()).toHaveLength(0);
  });

  it('405s on a non-POST method', async () => {
    const id = seedDbCampaign();
    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'GET', query: { campaignId: id } }),
      res
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });

  it('401s without auth', async () => {
    setAuthUser(null);
    const id = seedDbCampaign();
    const res = makeRes();
    await duplicateHandler(
      makeReq({ method: 'POST', query: { campaignId: id } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });
});
