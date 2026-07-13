// Tests for GET /api/overlay/[runId] (public overlay read API).
// Feature: Production broadcast automatisée.
//
// Returns exactly what a chrome-less OBS overlay needs: scene + overlay flags,
// current match, active sponsors — and NEVER leaks staff-only fields.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import overlayHandler from '../../pages/api/overlay/[runId]';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SEG_ID = '22222222-2222-4222-8222-2222222222aa';
const MATCH_ID = '33333333-3333-4333-8333-333333333333';
const TEAM1 = '44444444-4444-4444-8444-444444444441';
const TEAM2 = '44444444-4444-4444-8444-444444444442';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: { runId: RUN_ID },
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

function seedLive() {
  store.event_runs = [
    {
      id: RUN_ID,
      tenant_id: TENANT,
      name: 'Finale',
      slug: 'finale',
      status: 'live',
      started_at: '2026-05-25T18:00:00Z',
      scheduled_at: null,
      broadcast_state: {
        v: 1,
        on_air: true,
        lower_third: 'Grande Finale',
        pip: { enabled: true },
        scene: 'match',
        auto_director: true, // staff-only, must NOT leak
        scene_updated_at: '2026-05-25T18:05:00Z',
      },
    },
  ] as any;
  store.event_segments = [
    {
      id: SEG_ID,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 1,
      type: 'match',
      title: 'Match 1',
      status: 'live',
      match_id: MATCH_ID,
      duration_min: 45,
    },
  ] as any;
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: TENANT,
      team1_id: TEAM1,
      team2_id: TEAM2,
      team1_score: 2,
      team2_score: 1,
      match_format: 'bo5',
      status: 'ongoing',
      stream_url: 'https://twitch.tv/secret', // staff-only, must NOT leak
    },
  ] as any;
  store.teams = [
    {
      id: TEAM1,
      tenant_id: TENANT,
      name: 'Alpha',
      short_name: 'ALP',
      logo_url: 'https://logo/alpha.png',
    },
    {
      id: TEAM2,
      tenant_id: TENANT,
      name: 'Bravo',
      short_name: 'BRA',
      logo_url: null,
    },
  ] as any;
  store.partners = [
    {
      id: 'p1',
      name: 'MainSponsor',
      logo_url: 'https://logo/sponsor.png',
      website_url: 'https://sponsor.example',
      is_active: true,
      display_order: 1,
    },
    {
      id: 'p2',
      name: 'HiddenSponsor',
      logo_url: null,
      website_url: null,
      is_active: false,
      display_order: 2,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('GET /api/overlay/[runId]', () => {
  it('returns scene, overlay flags, match and active sponsors', async () => {
    seedLive();
    const res = makeRes();
    await overlayHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.scene).toBe('match');
    expect(body.onAir).toBe(true);
    expect(body.lowerThird).toBe('Grande Finale');
    expect(body.pip).toEqual({ enabled: true });

    expect(body.match).not.toBeNull();
    expect(body.match.team1).toEqual({
      name: 'Alpha',
      logoUrl: 'https://logo/alpha.png',
      score: 2,
    });
    expect(body.match.team2).toEqual({
      name: 'Bravo',
      logoUrl: null,
      score: 1,
    });
    expect(body.match.format).toBe('bo5');
    expect(body.match.status).toBe('ongoing');

    // Sponsors: only active, mapped shape.
    expect(body.sponsors).toHaveLength(1);
    expect(body.sponsors[0]).toEqual({
      name: 'MainSponsor',
      logoUrl: 'https://logo/sponsor.png',
      websiteUrl: 'https://sponsor.example',
    });

    // Cache header present.
    expect(String(res.headers['Cache-Control'])).toContain('s-maxage=5');
  });

  it('never leaks staff-only fields', async () => {
    seedLive();
    const res = makeRes();
    await overlayHandler(makeReq(), res);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('auto_director');
    expect(serialized).not.toContain('stream_url');
    expect(serialized).not.toContain('twitch.tv/secret');
    expect(serialized).not.toContain('scene_updated_at');
    expect(serialized).not.toContain('casters');
  });

  it('returns a safe empty-ish shape (200) when the run is not live', async () => {
    seedLive();
    (store.event_runs as any[]).find((r) => r.id === RUN_ID).status = 'draft';
    const res = makeRes();
    await overlayHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.scene).toBe('starting');
    expect(body.match).toBeNull();
    // Sponsors still returned (global).
    expect(body.sponsors).toHaveLength(1);
  });

  it('returns a safe empty-ish shape (200) when the run does not exist', async () => {
    store.partners = [
      {
        id: 'p1',
        name: 'MainSponsor',
        logo_url: null,
        website_url: null,
        is_active: true,
        display_order: 1,
      },
    ] as any;
    const res = makeRes();
    await overlayHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.scene).toBe('starting');
    expect(body.match).toBeNull();
    expect(body.sponsors).toHaveLength(1);
  });

  it('400 on malformed runId', async () => {
    const res = makeRes();
    await overlayHandler(makeReq({ query: { runId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-GET', async () => {
    seedLive();
    const res = makeRes();
    await overlayHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
