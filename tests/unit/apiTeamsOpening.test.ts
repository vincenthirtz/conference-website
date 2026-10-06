// GET /api/teams — l'annonce de recrutement rattachée (lot P8), pour que le
// sélecteur de /player/join-team dise ce que chaque équipe cherche.
// Invariants : rattachement par `team_id` seulement (jamais par nom), annonce
// périmée ignorée, aucune donnée de contact dans la réponse publique.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import teamsHandler, { summarizeOpenings } from '../../pages/api/teams/index';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'example.com' },
    query: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

const team = (id: string, name: string) => ({
  id,
  tenant_id: CONFERENCE_TENANT_ID,
  name,
  short_name: null,
  logo_url: null,
  country: null,
  is_joinable: true,
  open_for_scrim: false,
  team_members: [{ role: 'player' }, { role: 'player' }],
});

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';

beforeEach(() => {
  resetSupabaseMock();
});

describe('summarizeOpenings', () => {
  it('ignore les annonces sans équipe et les périmées, garde la plus récente', () => {
    const map = summarizeOpenings([
      {
        team_id: null,
        roles: ['tank'],
        level: 'gold',
        marked_at: '2026-01-01',
        expires_at: FUTURE,
      },
      {
        team_id: 'a',
        roles: ['dps'],
        level: 'gold',
        marked_at: '2026-01-01',
        expires_at: PAST,
      },
      {
        team_id: 'b',
        roles: ['tank'],
        level: 'silver',
        marked_at: '2026-01-01',
        expires_at: FUTURE,
      },
      {
        team_id: 'b',
        roles: ['support', 'tank'],
        level: 'nope',
        marked_at: '2026-02-01',
        expires_at: FUTURE,
      },
    ]);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toEqual({
      roles: ['tank', 'support'],
      level: null,
      since: '2026-02-01',
    });
  });
});

describe('GET /api/teams — opening', () => {
  it('expose postes et niveau de l’annonce rattachée, sans contact', async () => {
    store.teams = [team('t-open', 'Alpha'), team('t-plain', 'Beta')] as any;
    store.team_openings = [
      {
        id: 'op-1',
        tenant_id: CONFERENCE_TENANT_ID,
        source: 'web',
        team_id: 't-open',
        team_name: 'Alpha',
        roles: ['support'],
        level: 'gold',
        contact_email: 'secret@gmail.com',
        contact_discord: 'secret_handle',
        marked_at: '2026-10-01T00:00:00.000Z',
        expires_at: FUTURE,
      },
      // Annonce publique SANS compte portant le nom d'une vraie équipe : ne
      // doit pas s'y accrocher (usurpation).
      {
        id: 'op-2',
        tenant_id: CONFERENCE_TENANT_ID,
        source: 'web',
        team_id: null,
        team_name: 'Beta',
        roles: ['tank'],
        level: 'gold',
        contact_email: 'imposteur@gmail.com',
        marked_at: '2026-10-01T00:00:00.000Z',
        expires_at: FUTURE,
      },
    ] as any;

    const res = makeRes();
    await teamsHandler(makeReq({ query: { joinable: '1' } }), res);
    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(
      (res.body.teams as any[]).map((t) => [t.id, t])
    );
    expect(byId['t-open'].opening).toEqual({
      roles: ['support'],
      level: 'gold',
      since: '2026-10-01T00:00:00.000Z',
    });
    expect(byId['t-plain'].opening).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
