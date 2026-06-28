// tests/unit/apiAdminBroadcastCampaign.test.ts
//
// Endpoint tests for the DB-backed email-campaign CRUD added on the broadcast
// routes:
//   - POST   /api/admin/broadcast            → create (201, slug id + collision)
//   - PATCH  /api/admin/broadcast/{id}        → edit (200, db only; 403 builtin)
//   - DELETE /api/admin/broadcast/{id}        → delete (200, db only; 403 builtin)
//
// Auth/staff context mirrors apiAdminBroadcastState.test.ts. The in-memory
// supabase mock returns empty for `email_campaigns` unless seeded, so the
// builtin `idahobit-live-2026` campaign still resolves via the catalog fallback
// (which is what makes the builtin 403 cases reachable through getCampaign()).

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import indexHandler from '../../pages/api/admin/broadcast/index';
import campaignHandler from '../../pages/api/admin/broadcast/[campaignId]/index';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

const BUILTIN_ID = 'idahobit-live-2026';

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
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

function validBody(over: Record<string, unknown> = {}) {
  return {
    name: 'Ma campagne',
    subject: 'Un objet',
    heading: 'Un titre',
    bodyParagraphs: ['Un paragraphe.'],
    ...over,
  };
}

function campaignRows() {
  return (store.email_campaigns ?? []) as any[];
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  store.email_campaigns = [] as any;
});

/* -----------------------------------------------------------
 * POST /api/admin/broadcast — create
 * ---------------------------------------------------------*/

describe('POST /api/admin/broadcast (create campaign)', () => {
  it('201s and persists a row with a slug id derived from the name', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: validBody({ name: 'Été 2026 !' }) }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((res.body as any).campaign.id).toBe('ete-2026');

    const rows = campaignRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('ete-2026');
    expect(rows[0].name).toBe('Été 2026 !');
    expect(rows[0].subject).toBe('Un objet');
    expect(rows[0].heading).toBe('Un titre');
    expect(rows[0].body_paragraphs).toEqual(['Un paragraphe.']);
    expect(rows[0].created_by).toBe('user-1');
  });

  it('suffixes the slug with -2 on collision', async () => {
    const first = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: validBody({ name: 'Newsletter' }) }),
      first
    );
    expect((first.body as any).campaign.id).toBe('newsletter');

    const second = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: validBody({ name: 'Newsletter' }) }),
      second
    );
    expect(second.statusCode).toBe(201);
    expect((second.body as any).campaign.id).toBe('newsletter-2');

    const ids = campaignRows()
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(['newsletter', 'newsletter-2']);
  });

  it('400s on invalid body (empty bodyParagraphs)', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: validBody({ bodyParagraphs: [] }) }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(campaignRows()).toHaveLength(0);
  });

  it('400s when CTA label is set without a url (refine)', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: validBody({ ctaLabel: 'Voir' }) }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400s when ctaUrl is not http(s)', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({
        method: 'POST',
        body: validBody({ ctaLabel: 'X', ctaUrl: 'javascript:alert(1)' }),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('401s without auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await indexHandler(makeReq({ method: 'POST', body: validBody() }), res);
    expect(res.statusCode).toBe(401);
  });
});

/* -----------------------------------------------------------
 * PATCH /api/admin/broadcast/{campaignId} — edit
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/broadcast/{campaignId} (edit campaign)', () => {
  function seedDbCampaign(id = 'ma-campagne') {
    store.email_campaigns = [
      {
        id,
        name: 'Ancienne',
        description: 'old desc',
        subject: 'old subject',
        audience: 'all-confirmed-users',
        status: 'draft',
        heading: 'Ancien titre',
        greeting_enabled: true,
        body_paragraphs: ['old'],
        cta_label: null,
        cta_url: null,
        footer_note: null,
        created_at: '2026-05-01T00:00:00Z',
      },
    ] as any;
    return id;
  }

  it('200s and updates the row fields', async () => {
    const id = seedDbCampaign();
    const res = makeRes();
    await campaignHandler(
      makeReq({
        method: 'PATCH',
        query: { campaignId: id },
        body: validBody({
          name: 'Nouvelle',
          subject: 'new subject',
          heading: 'Nouveau titre',
          status: 'active',
          greetingEnabled: false,
          bodyParagraphs: ['p1', 'p2'],
          footerNote: 'note',
        }),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const row = campaignRows().find((r) => r.id === id)!;
    expect(row.name).toBe('Nouvelle');
    expect(row.subject).toBe('new subject');
    expect(row.heading).toBe('Nouveau titre');
    expect(row.status).toBe('active');
    expect(row.greeting_enabled).toBe(false);
    expect(row.body_paragraphs).toEqual(['p1', 'p2']);
    expect(row.footer_note).toBe('note');
  });

  it('400s on invalid edit body', async () => {
    const id = seedDbCampaign();
    const res = makeRes();
    await campaignHandler(
      makeReq({
        method: 'PATCH',
        query: { campaignId: id },
        body: validBody({ heading: '' }),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404s when the campaign does not exist', async () => {
    const res = makeRes();
    await campaignHandler(
      makeReq({
        method: 'PATCH',
        query: { campaignId: 'nope' },
        body: validBody(),
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('403s when editing the builtin campaign', async () => {
    const res = makeRes();
    await campaignHandler(
      makeReq({
        method: 'PATCH',
        query: { campaignId: BUILTIN_ID },
        body: validBody(),
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * DELETE /api/admin/broadcast/{campaignId} — delete
 * ---------------------------------------------------------*/

describe('DELETE /api/admin/broadcast/{campaignId} (delete campaign)', () => {
  function seedDbCampaign(id = 'ma-campagne') {
    store.email_campaigns = [
      {
        id,
        name: 'À supprimer',
        description: '',
        subject: 'subject',
        audience: 'all-confirmed-users',
        status: 'draft',
        heading: 'titre',
        greeting_enabled: true,
        body_paragraphs: ['p'],
        cta_label: null,
        cta_url: null,
        footer_note: null,
        created_at: '2026-05-01T00:00:00Z',
      },
    ] as any;
    return id;
  }

  it('200s and removes the row', async () => {
    const id = seedDbCampaign();
    const res = makeRes();
    await campaignHandler(
      makeReq({ method: 'DELETE', query: { campaignId: id } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(campaignRows().find((r) => r.id === id)).toBeUndefined();
  });

  it('also clears associated schedule + recipient rows', async () => {
    const id = seedDbCampaign();
    store.broadcast_schedules = [
      { campaign_id: id, wave_size: 5, status: 'scheduled' },
    ] as any;
    store.broadcast_recipients = [
      { campaign_id: id, user_id: 'u1', status: 'pending' },
      { campaign_id: id, user_id: 'u2', status: 'sent' },
    ] as any;

    const res = makeRes();
    await campaignHandler(
      makeReq({ method: 'DELETE', query: { campaignId: id } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(store.broadcast_schedules).toHaveLength(0);
    expect(store.broadcast_recipients).toHaveLength(0);
  });

  it('404s when the campaign does not exist', async () => {
    const res = makeRes();
    await campaignHandler(
      makeReq({ method: 'DELETE', query: { campaignId: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('403s when deleting the builtin campaign', async () => {
    const res = makeRes();
    await campaignHandler(
      makeReq({ method: 'DELETE', query: { campaignId: BUILTIN_ID } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * GET /api/admin/broadcast — list includes db + builtin campaigns
 * ---------------------------------------------------------*/

describe('GET /api/admin/broadcast (list includes db campaigns)', () => {
  it('returns db campaigns (source=db, body present) alongside builtin', async () => {
    store.email_campaigns = [
      {
        id: 'ma-campagne',
        name: 'Ma campagne',
        description: 'desc',
        subject: 'subject',
        audience: 'all-confirmed-users',
        status: 'active',
        heading: 'titre',
        greeting_enabled: true,
        body_paragraphs: ['p1'],
        cta_label: null,
        cta_url: null,
        footer_note: null,
        created_at: '2026-05-10T00:00:00Z',
      },
    ] as any;

    const res = makeRes();
    await indexHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const campaigns = (res.body as any).campaigns as any[];

    const db = campaigns.find((c) => c.id === 'ma-campagne');
    expect(db).toBeDefined();
    expect(db.source).toBe('db');
    expect(db.body).toMatchObject({ heading: 'titre', bodyParagraphs: ['p1'] });

    const builtin = campaigns.find((c) => c.id === BUILTIN_ID);
    expect(builtin).toBeDefined();
    expect(builtin.source).toBe('builtin');
    expect(builtin.body).toBeNull();
  });
});
