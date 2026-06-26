// tests/unit/apiCasterTournamentRoutes.test.ts
// Caster app read contract :
//   - canonical : /api/caster/v1/{tournaments, tournaments/[id]/matches,
//                 tournaments/[id]/maps, matches/[id]}
//   - legacy    : /api/caster/{tournaments*, matches/[id]} (deprecated aliases)
//
// Both families share utils/casterApi.ts. These tests assert the shapes are
// identical AND that the legacy routes stamp Deprecation/Sunset/Link headers.

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import v1TournamentsHandler from '../../pages/api/caster/v1/tournaments/index';
import v1TournamentMatchesHandler from '../../pages/api/caster/v1/tournaments/[id]/matches';
import v1TournamentMapsHandler from '../../pages/api/caster/v1/tournaments/[id]/maps';
import v1MatchHandler from '../../pages/api/caster/v1/matches/[id]';

import legacyTournamentsHandler from '../../pages/api/caster/tournaments/index';
import legacyTournamentMatchesHandler from '../../pages/api/caster/tournaments/[id]/matches';
import legacyTournamentMapsHandler from '../../pages/api/caster/tournaments/[id]/maps';
import legacyMatchHandler from '../../pages/api/caster/matches/[id]';

import { CASTER_LEGACY_SUNSET } from '../../utils/casterApi';

const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440f01';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440f02';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
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
  store.tournaments = [
    {
      id: TOURNAMENT_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Spring Cup',
      slug: 'spring-cup',
      game: 'overwatch',
      status: 'running',
      start_date: '2026-05-01T18:00:00.000Z',
      format_type: 'single_elimination',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440f99',
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Draft cup',
      slug: 'draft-cup',
      status: 'draft',
    },
  ] as any;
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      tournament_id: TOURNAMENT_ID,
      status: 'ongoing',
      best_of: 3,
      match_format: 'bo3',
      scheduled_at: '2026-05-01T19:00:00.000Z',
      team1_score: 1,
      team2_score: 0,
      round_name: 'QF',
      stream_url: 'https://twitch.tv/x',
    },
  ] as any;
  store.tournament_maps = [
    {
      id: 'map-1',
      tenant_id: CONFERENCE_TENANT_ID,
      tournament_id: TOURNAMENT_ID,
      map_name: 'Ilios',
      map_type: 'control',
      image_url: null,
      enabled: true,
    },
  ] as any;
  store.games = [
    {
      id: 'g1',
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_ID,
      map_name: 'Ilios',
      map_order: 1,
      team1_score: 2,
      team2_score: 1,
    },
  ] as any;
});

describe('/api/caster/v1/tournaments', () => {
  it('GET 405 on non-GET', async () => {
    const res = makeRes();
    await v1TournamentsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns running/published tournaments only', async () => {
    const res = makeRes();
    await v1TournamentsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournaments).toHaveLength(1);
    expect((res.body as any).tournaments[0].slug).toBe('spring-cup');
  });
});

describe('/api/caster/v1/tournaments/[id]/matches', () => {
  it('GET 400 on invalid id', async () => {
    const res = makeRes();
    await v1TournamentMatchesHandler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET returns matches with stream_url', async () => {
    const res = makeRes();
    await v1TournamentMatchesHandler(
      makeReq({ query: { id: TOURNAMENT_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).matches).toHaveLength(1);
    expect((res.body as any).matches[0].stream_url).toBe('https://twitch.tv/x');
  });
});

describe('/api/caster/v1/tournaments/[id]/maps', () => {
  it('GET returns enabled maps', async () => {
    const res = makeRes();
    await v1TournamentMapsHandler(
      makeReq({ query: { id: TOURNAMENT_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).maps).toHaveLength(1);
    expect((res.body as any).maps[0].map_name).toBe('Ilios');
  });
});

describe('/api/caster/v1/matches/[id]', () => {
  it('GET 404 when match missing', async () => {
    const res = makeRes();
    await v1MatchHandler(
      makeReq({ query: { id: '550e8400-e29b-41d4-a716-446655440fff' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET returns match (with stream_url) + games', async () => {
    const res = makeRes();
    await v1MatchHandler(makeReq({ query: { id: MATCH_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(MATCH_ID);
    // ÉTAPE 3 : stream_url now selected on the match detail too.
    expect((res.body as any).match.stream_url).toBe('https://twitch.tv/x');
    expect((res.body as any).games).toHaveLength(1);
  });
});

describe('/api/caster/* legacy aliases', () => {
  it('tournaments: identical body + deprecation headers', async () => {
    const res = makeRes();
    await legacyTournamentsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournaments).toHaveLength(1);
    expect(res.headers['Deprecation']).toBe('true');
    expect(res.headers['Sunset']).toBe(CASTER_LEGACY_SUNSET);
    expect(res.headers['Link']).toBe(
      '</api/caster/v1/tournaments>; rel="successor-version"'
    );
  });

  it('tournament matches: deprecation Link points at v1 with id', async () => {
    const res = makeRes();
    await legacyTournamentMatchesHandler(
      makeReq({ query: { id: TOURNAMENT_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Deprecation']).toBe('true');
    expect(res.headers['Link']).toBe(
      `</api/caster/v1/tournaments/${TOURNAMENT_ID}/matches>; rel="successor-version"`
    );
  });

  it('tournament maps: deprecation headers present', async () => {
    const res = makeRes();
    await legacyTournamentMapsHandler(
      makeReq({ query: { id: TOURNAMENT_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Sunset']).toBe(CASTER_LEGACY_SUNSET);
  });

  it('match detail: identical body + deprecation headers', async () => {
    const res = makeRes();
    await legacyMatchHandler(makeReq({ query: { id: MATCH_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(MATCH_ID);
    expect(res.headers['Link']).toBe(
      `</api/caster/v1/matches/${MATCH_ID}>; rel="successor-version"`
    );
  });
});
