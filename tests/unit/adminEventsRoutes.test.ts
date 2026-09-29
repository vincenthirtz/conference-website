// Routes admin du run-of-show sans test dédié avant leur migration vers
// features/admin/events (vague serveur 2) : un succès + une erreur métier
// par route, contrat HTTP d'origine (statuts, `code` historiques, forme).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import runsHandler from '../../pages/api/admin/events/index';
import runHandler from '../../pages/api/admin/events/[runId]/index';
import runStartHandler from '../../pages/api/admin/events/[runId]/start';
import runEndHandler from '../../pages/api/admin/events/[runId]/end';
import segmentsHandler from '../../pages/api/admin/events/[runId]/segments/index';
import segmentHandler from '../../pages/api/admin/events/[runId]/segments/[segId]/index';
import segEndHandler from '../../pages/api/admin/events/[runId]/segments/[segId]/end';
import segSkipHandler from '../../pages/api/admin/events/[runId]/segments/[segId]/skip';
import wavesHandler from '../../pages/api/admin/events/[runId]/waves/index';
import waveHandler from '../../pages/api/admin/events/[runId]/waves/[waveId]/index';
import wavesReorderHandler from '../../pages/api/admin/events/[runId]/waves/reorder';
import stationsHandler from '../../pages/api/admin/events/[runId]/stations/index';
import stationHandler from '../../pages/api/admin/events/[runId]/stations/[stationId]/index';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const RUN = 'a1a1a1a1-1111-4111-8111-111111111111';
const SEG = 'b2b2b2b2-2222-4222-8222-222222222222';
const WAVE_A = 'c3c3c3c3-3333-4333-8333-333333333333';
const WAVE_B = 'c4c4c4c4-3333-4333-8333-333333333333';
const STATION = 'd4d4d4d4-4444-4444-8444-444444444444';
const MISSING = 'e5e5e5e5-5555-4555-8555-555555555555';

let n = 0;
function req(
  method: string,
  query: Record<string, unknown>,
  body: unknown = {}
): any {
  n += 1;
  return {
    method,
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    cookies: {},
    query,
    body,
  };
}
function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}
async function call(h: any, rq: any) {
  const r = res();
  await h(rq, r);
  return r;
}

function seedRun(status = 'draft') {
  store.event_runs = [
    {
      id: RUN,
      tenant_id: TENANT,
      name: 'Soirée',
      slug: 'soiree',
      description: null,
      scheduled_at: '2026-10-01T18:00:00.000Z',
      status,
      started_at: null,
      ended_at: null,
    },
  ] as any;
}
function seedSegment(status: string) {
  store.event_segments = [
    {
      id: SEG,
      event_run_id: RUN,
      tenant_id: TENANT,
      ord: 0,
      type: 'break',
      match_id: null,
      title: 'Pause',
      duration_min: 5,
      status,
      broadcast_message: null,
      caster_checklist: [],
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  (logStaffAction as any).mockClear();
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@x.com',
      role: 'owner',
      is_pole_admin: false,
    },
  ] as any;
});

describe('/api/admin/events', () => {
  it('POST crée un run draft (201) et journalise event_run_manage', async () => {
    const r = await call(
      runsHandler,
      req(
        'POST',
        {},
        { name: 'Finale', scheduled_at: '2026-10-01T18:00:00.000Z' }
      )
    );
    expect(r.statusCode).toBe(201);
    expect(r.body.slug).toBe('finale');
    expect(r.body.status).toBe('draft');
    const log = (logStaffAction as any).mock.calls[0][0];
    expect(log.action).toBe('event_run_manage');
    expect(log.payload.action).toBe('create_event_run');
  });

  it('POST invalide → 400 INVALID_PAYLOAD avec details', async () => {
    const r = await call(runsHandler, req('POST', {}, { name: '' }));
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('INVALID_PAYLOAD');
    expect(r.body.details).toBeDefined();
  });

  it('GET liste les runs ; status inconnu → 400 INVALID_STATUS', async () => {
    seedRun();
    const ok = await call(runsHandler, req('GET', {}));
    expect(ok.statusCode).toBe(200);
    expect(ok.body.items).toHaveLength(1);
    const bad = await call(runsHandler, req('GET', { status: 'nope' }));
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_STATUS');
  });
});

describe('/api/admin/events/[runId]', () => {
  it('GET renvoie run + segments + waves + stations', async () => {
    seedRun();
    const r = await call(runHandler, req('GET', { runId: RUN }));
    expect(r.statusCode).toBe(200);
    expect(r.body.run.id).toBe(RUN);
    expect(r.body).toMatchObject({ segments: [], waves: [], stations: [] });
  });

  it('PATCH met à jour ; run inconnu → 404 ; runId invalide → 400', async () => {
    seedRun();
    const ok = await call(
      runHandler,
      req('PATCH', { runId: RUN }, { name: 'Demi' })
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.name).toBe('Demi');
    const missing = await call(
      runHandler,
      req('PATCH', { runId: MISSING }, { name: 'X' })
    );
    expect(missing.statusCode).toBe(404);
    const bad = await call(runHandler, req('GET', { runId: 'x' }));
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toBe('Invalid runId.');
  });
});

describe('/api/admin/events/[runId]/start|end', () => {
  it('start : draft → live ; done → 409 RUN_ALREADY_DONE', async () => {
    seedRun('draft');
    const ok = await call(runStartHandler, req('POST', { runId: RUN }));
    expect(ok.statusCode).toBe(200);
    expect(ok.body.alreadyStarted).toBe(false);
    expect(ok.body.run.status).toBe('live');
    seedRun('done');
    const done = await call(runStartHandler, req('POST', { runId: RUN }));
    expect(done.statusCode).toBe(409);
    expect(done.body.code).toBe('RUN_ALREADY_DONE');
  });

  it('end : live → done (segments clos) ; draft → 409 RUN_NOT_STARTED', async () => {
    seedRun('live');
    seedSegment('upcoming');
    const ok = await call(runEndHandler, req('POST', { runId: RUN }));
    expect(ok.statusCode).toBe(200);
    expect(ok.body.alreadyEnded).toBe(false);
    expect((store.event_segments as any[])[0].status).toBe('done');
    seedRun('draft');
    const draft = await call(runEndHandler, req('POST', { runId: RUN }));
    expect(draft.statusCode).toBe(409);
    expect(draft.body.code).toBe('RUN_NOT_STARTED');
  });
});

describe('/api/admin/events/[runId]/segments', () => {
  it('POST crée en queue (201) ; run inconnu → 404', async () => {
    seedRun();
    const ok = await call(
      segmentsHandler,
      req('POST', { runId: RUN }, { type: 'break', title: 'Pause' })
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.body.ord).toBe(0);
    const missing = await call(
      segmentsHandler,
      req('POST', { runId: MISSING }, { type: 'break', title: 'Pause' })
    );
    expect(missing.statusCode).toBe(404);
  });

  it('[segId] GET / PATCH vide → 400 EMPTY_UPDATE… / DELETE', async () => {
    seedRun();
    seedSegment('upcoming');
    const get = await call(
      segmentHandler,
      req('GET', { runId: RUN, segId: SEG })
    );
    expect(get.statusCode).toBe(200);
    expect(get.body.id).toBe(SEG);
    const patch = await call(
      segmentHandler,
      req('PATCH', { runId: RUN, segId: SEG }, { title: 'Longue pause' })
    );
    expect(patch.statusCode).toBe(200);
    expect(patch.body.title).toBe('Longue pause');
    const invalid = await call(
      segmentHandler,
      req('PATCH', { runId: RUN, segId: SEG }, {})
    );
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body.code).toBe('INVALID_PAYLOAD');
    const del = await call(
      segmentHandler,
      req('DELETE', { runId: RUN, segId: SEG })
    );
    expect(del.statusCode).toBe(200);
    expect(del.body).toEqual({ success: true });
  });

  it('end : live → done ; upcoming → 409 SEGMENT_NOT_LIVE', async () => {
    seedRun('live');
    seedSegment('live');
    const ok = await call(
      segEndHandler,
      req('POST', { runId: RUN, segId: SEG })
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.segment.status).toBe('done');
    seedSegment('upcoming');
    const bad = await call(
      segEndHandler,
      req('POST', { runId: RUN, segId: SEG })
    );
    expect(bad.statusCode).toBe(409);
    expect(bad.body).toMatchObject({
      code: 'SEGMENT_NOT_LIVE',
      status: 'upcoming',
    });
  });

  it('skip : upcoming → skipped ; live → 409 SEGMENT_NOT_UPCOMING', async () => {
    seedRun('live');
    seedSegment('upcoming');
    const ok = await call(
      segSkipHandler,
      req('POST', { runId: RUN, segId: SEG })
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.segment.status).toBe('skipped');
    seedSegment('live');
    const bad = await call(
      segSkipHandler,
      req('POST', { runId: RUN, segId: SEG })
    );
    expect(bad.statusCode).toBe(409);
    expect(bad.body.code).toBe('SEGMENT_NOT_UPCOMING');
  });
});

describe('/api/admin/events/[runId]/waves', () => {
  it('POST (201) puis GET ; titre vide → 400 INVALID_PAYLOAD', async () => {
    seedRun();
    const created = await call(
      wavesHandler,
      req('POST', { runId: RUN }, { title: 'Vague 1' })
    );
    expect(created.statusCode).toBe(201);
    expect(created.body.wave.ord).toBe(0);
    const list = await call(wavesHandler, req('GET', { runId: RUN }));
    expect(list.body.waves).toHaveLength(1);
    const bad = await call(
      wavesHandler,
      req('POST', { runId: RUN }, { title: '' })
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_PAYLOAD');
  });

  it('[waveId] PATCH live auto-date started_at ; inconnue → 404', async () => {
    seedRun();
    store.event_waves = [
      {
        id: WAVE_A,
        event_run_id: RUN,
        tenant_id: TENANT,
        ord: 0,
        title: 'A',
        status: 'upcoming',
        started_at: null,
        ended_at: null,
      },
    ] as any;
    const ok = await call(
      waveHandler,
      req('PATCH', { runId: RUN, waveId: WAVE_A }, { status: 'live' })
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.wave.started_at).toBeTruthy();
    const missing = await call(
      waveHandler,
      req('DELETE', { runId: RUN, waveId: MISSING })
    );
    expect(missing.statusCode).toBe(404);
  });

  it('reorder : échange les ord ; ord en double → 400 DUPLICATE_ORDS', async () => {
    seedRun();
    store.event_waves = [
      {
        id: WAVE_A,
        event_run_id: RUN,
        tenant_id: TENANT,
        ord: 0,
        title: 'A',
        status: 'upcoming',
      },
      {
        id: WAVE_B,
        event_run_id: RUN,
        tenant_id: TENANT,
        ord: 1,
        title: 'B',
        status: 'upcoming',
      },
    ] as any;
    const ok = await call(
      wavesReorderHandler,
      req(
        'POST',
        { runId: RUN },
        {
          order: [
            { id: WAVE_A, ord: 1 },
            { id: WAVE_B, ord: 0 },
          ],
        }
      )
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.success).toBe(true);
    const byId = new Map(
      (store.event_waves as any[]).map((w) => [w.id, w.ord])
    );
    expect(byId.get(WAVE_A)).toBe(1);
    expect(byId.get(WAVE_B)).toBe(0);
    const bad = await call(
      wavesReorderHandler,
      req(
        'POST',
        { runId: RUN },
        {
          order: [
            { id: WAVE_A, ord: 0 },
            { id: WAVE_B, ord: 0 },
          ],
        }
      )
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('DUPLICATE_ORDS');
  });
});

describe('/api/admin/events/[runId]/stations', () => {
  it('POST (201, status idle) ; run inconnu → 404', async () => {
    seedRun();
    const ok = await call(
      stationsHandler,
      req('POST', { runId: RUN }, { name: 'Poste 1' })
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.body.station.status).toBe('idle');
    const missing = await call(stationsHandler, req('GET', { runId: MISSING }));
    expect(missing.statusCode).toBe(404);
  });

  it('[stationId] PATCH puis DELETE ; statut inconnu → 400', async () => {
    seedRun();
    store.event_stations = [
      {
        id: STATION,
        event_run_id: RUN,
        tenant_id: TENANT,
        ord: 0,
        name: 'P1',
        status: 'idle',
      },
    ] as any;
    const ok = await call(
      stationHandler,
      req('PATCH', { runId: RUN, stationId: STATION }, { status: 'in_use' })
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.body.station.status).toBe('in_use');
    const bad = await call(
      stationHandler,
      req('PATCH', { runId: RUN, stationId: STATION }, { status: 'broken' })
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_PAYLOAD');
    const del = await call(
      stationHandler,
      req('DELETE', { runId: RUN, stationId: STATION })
    );
    expect(del.body).toEqual({ success: true });
  });
});
