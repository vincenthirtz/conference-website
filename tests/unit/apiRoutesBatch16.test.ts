import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.hoisted(() => {
  process.env.DISCORD_TEAM_SECRET = 'discord-test-secret';
});

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import applyTemplateHandler from '../../pages/api/admin/tournament/[id]/apply-template';
import cloneHandler from '../../pages/api/admin/tournament/[id]/clone';
import discordTeamsHandler from '../../pages/api/discord/teams';

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

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
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
  logStaffActionMock.mockClear();
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/apply-template
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/apply-template', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: 'bogus' },
          body: { templateId: 'foo' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when templateId missing', async () => {
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: {} },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when template not found (built-in or custom)', async () => {
    store.tournaments = [{ id: TID, name: 'Cup' }] as any;
    store.tournament_stages = [];
    store.site_settings = [];
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { templateId: 'nope' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when tournament missing (custom template found)', async () => {
    store.tournaments = [];
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          {
            id: 'tpl-x',
            name: 'X',
            description: '',
            stages: [{ name: 'Phase', stage_type: 'group' }],
          },
        ]),
      },
    ] as any;
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { templateId: 'tpl-x' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when tournament already has stages without append', async () => {
    store.tournaments = [{ id: TID, name: 'Cup' }] as any;
    store.tournament_stages = [
      { id: 'existing', tournament_id: TID, order_index: 0 },
    ] as any;
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          {
            id: 'tpl-x',
            name: 'X',
            description: '',
            stages: [{ name: 'New', stage_type: 'bracket' }],
          },
        ]),
      },
    ] as any;
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { templateId: 'tpl-x' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 creates stages from a custom template', async () => {
    store.tournaments = [{ id: TID, name: 'Cup' }] as any;
    store.tournament_stages = [];
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          {
            id: 'tpl-x',
            name: 'My Template',
            description: '',
            stages: [
              { name: 'Group', stage_type: 'group' },
              { name: 'Knockout', stage_type: 'bracket' },
            ],
          },
        ]),
      },
    ] as any;
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { templateId: 'tpl-x' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const stages = (store.tournament_stages as any).filter(
      (s: any) => s.tournament_id === TID
    );
    expect(stages).toHaveLength(2);
    expect(stages.map((s: any) => s.order_index)).toEqual([0, 1]);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('201 in append mode picks up after the last existing order_index', async () => {
    store.tournaments = [{ id: TID, name: 'Cup' }] as any;
    store.tournament_stages = [
      { id: 'existing', tournament_id: TID, order_index: 4 },
    ] as any;
    store.site_settings = [
      {
        key: 'custom_tournament_templates',
        value: JSON.stringify([
          {
            id: 'tpl-x',
            name: 'X',
            description: '',
            stages: [{ name: 'Phase Z', stage_type: 'bracket' }],
          },
        ]),
      },
    ] as any;
    const res = makeRes();
    await applyTemplateHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { templateId: 'tpl-x', append: true },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const newStage = (store.tournament_stages as any).find(
      (s: any) => s.tournament_id === TID && s.id !== 'existing'
    );
    expect(newStage.order_index).toBe(5);
  });

  it('returns 405 on non-POST', async () => {
    const res = makeRes();
    await applyTemplateHandler(
      makeReq({ method: 'GET', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/clone
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/clone', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  function seedSource() {
    store.tournaments = [
      {
        id: TID,
        name: 'Original Cup',
        slug: 'original-cup',
        game: 'OW2',
        status: 'completed',
        timezone: 'Europe/Paris',
        format_type: 'mixed',
        max_teams: 16,
        min_players: 5,
        max_players: 7,
        visibility: 'public',
        is_featured: true,
        logo_url: null,
        banner_url: null,
        start_date: '2026-04-01',
        end_date: '2026-04-30',
      },
    ] as any;
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TID,
        name: 'Group',
        slug: 'group',
        stage_type: 'group',
        order_index: 0,
        settings: { matches_per_team: 3 },
      },
    ] as any;
    store.tournament_maps = [
      {
        tournament_id: TID,
        map_name: 'Lijiang',
        map_slug: 'lijiang',
        map_type: 'control',
        image_url: null,
        enabled: true,
        order_index: 0,
      },
    ] as any;
  }

  it('400 on invalid id', async () => {
    const res = makeRes();
    await cloneHandler(
      makeReq(
        { method: 'POST', query: { id: 'bogus' }, body: {} },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when source tournament missing', async () => {
    store.tournaments = [];
    const res = makeRes();
    await cloneHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: {} },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('201 clones the tournament with default name + slug, copies stages/maps', async () => {
    seedSource();
    const res = makeRes();
    await cloneHandler(
      makeReq({ method: 'POST', query: { id: TID }, body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.tournament.name).toMatch(/copie/);
    expect(body.tournament.status).toBe('draft');
    expect(body.tournament.start_date).toBeNull();
    expect(body.stages).toHaveLength(1);
    expect(body.maps).toBe(1);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('201 with explicit name + slug', async () => {
    seedSource();
    const res = makeRes();
    await cloneHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: { name: 'Brand New Cup', slug: 'brand-new-cup' },
        },
        true
      ),
      res
    );
    const body = res.body as any;
    expect(body.tournament.name).toBe('Brand New Cup');
    expect(body.tournament.slug).toBe('brand-new-cup');
  });

  it('disambiguates slug when target slug already exists', async () => {
    seedSource();
    // Pre-existing tournament with the slug
    (store.tournaments as any).push({ id: 'other', slug: 'original-cup-copie' });
    const res = makeRes();
    await cloneHandler(
      makeReq({ method: 'POST', query: { id: TID }, body: {} }, true),
      res
    );
    const body = res.body as any;
    expect(body.tournament.slug).not.toBe('original-cup-copie');
    expect(body.tournament.slug).toMatch(/^original-cup-copie-/);
  });

  it('returns 405 on non-POST', async () => {
    const res = makeRes();
    await cloneHandler(
      makeReq({ method: 'GET', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/discord/teams (Bearer-secret authenticated bot endpoint)
 * ---------------------------------------------------------*/

describe('POST /api/discord/teams', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await discordTeamsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 without secret', async () => {
    const res = makeRes();
    await discordTeamsHandler(
      makeReq({ method: 'POST', body: { name: 'A' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('401 with wrong secret', async () => {
    const res = makeRes();
    await discordTeamsHandler(
      makeReq({
        method: 'POST',
        headers: {
          host: 'h',
          authorization: 'Bearer not-the-secret',
        },
        body: { name: 'A' },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 when name missing', async () => {
    const res = makeRes();
    await discordTeamsHandler(
      makeReq({
        method: 'POST',
        headers: {
          host: 'h',
          authorization: 'Bearer discord-test-secret',
        },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 creates team with sanitized URLs and a news entry', async () => {
    store.teams = [];
    store.news = [];
    const res = makeRes();
    await discordTeamsHandler(
      makeReq({
        method: 'POST',
        headers: {
          host: 'h',
          authorization: 'Bearer discord-test-secret',
        },
        body: {
          name: 'Phoenix Squad',
          discord: 'https://discord.gg/example',
          website: 'javascript:alert(1)', // sanitized -> null
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.team.name).toBe('Phoenix Squad');
    expect(body.team.slug).toBe('phoenix-squad');
    expect(body.team.discord).toBe('https://discord.gg/example');
    expect(body.team.website).toBeNull();
    // News article auto-created
    expect((store.news as any).length).toBe(1);
  });
});
