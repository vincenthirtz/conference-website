// GET /api/player/agenda.ics — flux personnel à jeton porteur (lot J2).
//
// La route n'a PAS de Bearer : elle est appelée par Google/Apple Calendar, qui
// ne présentent jamais de session. Le jeton EST l'authentification — donc les
// seuls tests qui comptent portent sur lui : un jeton inconnu, révoqué ou
// malformé ne doit rien révéler, et surtout pas la différence entre les trois.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/agenda.ics';

const USER = '00000000-0000-0000-0000-0000000000aa';
const TEAM = '00000000-0000-0000-0000-0000000000b1';
const OPP = '00000000-0000-0000-0000-0000000000cc';
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makeReq(query: Record<string, unknown> = {}): any {
  return { method: 'GET', headers: { host: 'h' }, query, body: {} };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  store.player_calendar_tokens = [
    {
      id: 'ct-1',
      tenant_id: 'tenant-1',
      auth_user_id: USER,
      token: TOKEN,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
    },
  ] as any;
  store.teams = [
    { id: TEAM, name: 'Phenix', is_active: true },
    { id: OPP, name: 'Avoidgers', is_active: true },
  ] as any;
  store.team_members = [
    { id: 'tm-1', team_id: TEAM, user_id: USER, role: 'player' },
  ] as any;
  store.matches = [
    {
      id: 'm-1',
      status: 'pending',
      scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      match_format: 'bo3',
      team1_id: TEAM,
      team2_id: OPP,
      team1: { id: TEAM, name: 'Phenix' },
      team2: { id: OPP, name: 'Avoidgers' },
    },
  ] as any;
  store.scrims = [] as any;
});

describe('/api/player/agenda.ics', () => {
  it('sert un calendrier avec le bon type MIME', async () => {
    const res = makeRes();
    await handler(makeReq({ token: TOKEN }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/calendar');
    expect(String(res.body)).toContain('BEGIN:VCALENDAR');
    expect(String(res.body)).toContain('Phenix vs Avoidgers');
  });

  it('ne se laisse ni indexer ni mettre en cache partagé', async () => {
    const res = makeRes();
    await handler(makeReq({ token: TOKEN }), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
  });

  it('404 sans jeton', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('404 sur un jeton inconnu — même réponse qu’un jeton révoqué', async () => {
    const unknown = makeRes();
    await handler(makeReq({ token: 'b'.repeat(43) }), unknown);

    (store.player_calendar_tokens as any[])[0].revoked_at =
      new Date().toISOString();
    const revoked = makeRes();
    await handler(makeReq({ token: TOKEN }), revoked);

    expect(unknown.statusCode).toBe(404);
    expect(revoked.statusCode).toBe(404);
    expect(revoked.body).toEqual(unknown.body);
  });

  it('404 sur un jeton malformé, sans requête base', async () => {
    const res = makeRes();
    await handler(makeReq({ token: '../../etc/passwd' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('refuse les méthodes autres que GET', async () => {
    const res = makeRes();
    await handler({ ...makeReq({ token: TOKEN }), method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });
});
