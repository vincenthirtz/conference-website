import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';

import teamsHandler from '../../pages/api/teams/index';

/* -----------------------------------------------------------
 * Helpers — minimal req/res shims (même pattern que apiPublicRoutes)
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'example.com' },
    query: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

/**
 * Le mock supabase ne résout pas l'agrégat embarqué `team_members(count)` :
 * il renvoie la row brute telle que seedée. On reproduit donc la forme que
 * PostgREST renverrait en posant directement la propriété `team_members`.
 */
function seedTeam(
  over: Partial<Record<string, unknown>> & { member_count?: number } = {}
) {
  const { member_count = 0, ...rest } = over;
  return {
    id: 'team-x',
    name: 'Team',
    short_name: null,
    logo_url: null,
    country: null,
    is_joinable: true,
    team_members: [{ count: member_count }],
    ...rest,
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * GET /api/teams?joinable=1
 * ---------------------------------------------------------*/

describe('GET /api/teams?joinable=1', () => {
  it('ne renvoie que les équipes is_joinable=true', async () => {
    store.teams = [
      seedTeam({ id: 'a', name: 'Open', is_joinable: true, member_count: 2 }),
      seedTeam({
        id: 'b',
        name: 'Closed',
        is_joinable: false,
        member_count: 2,
      }),
    ];
    const res = makeRes();
    await teamsHandler(makeReq({ query: { joinable: '1' } }), res);

    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams;
    expect(teams.map((t: any) => t.id)).toEqual(['a']);
  });

  it('exclut les équipes PLEINES (member_count >= MAX_TEAM_PLAYERS)', async () => {
    store.teams = [
      seedTeam({ id: 'free', name: 'Has Slots', member_count: 4 }),
      seedTeam({
        id: 'full',
        name: 'Full Roster',
        member_count: MAX_TEAM_PLAYERS,
      }),
      seedTeam({
        id: 'over',
        name: 'Over Capacity',
        member_count: MAX_TEAM_PLAYERS + 1,
      }),
    ];
    const res = makeRes();
    await teamsHandler(makeReq({ query: { joinable: '1' } }), res);

    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams;
    expect(teams.map((t: any) => t.id)).toEqual(['free']);
  });

  it('accepte aussi joinable=true (alias)', async () => {
    store.teams = [
      seedTeam({ id: 'a', is_joinable: true, member_count: 1 }),
      seedTeam({ id: 'b', is_joinable: false, member_count: 1 }),
    ];
    const res = makeRes();
    await teamsHandler(makeReq({ query: { joinable: 'true' } }), res);

    const teams = (res.body as any).teams;
    expect(teams.map((t: any) => t.id)).toEqual(['a']);
  });

  it("scope au tenant courant (équipe d'un autre tenant absente)", async () => {
    store.teams = [
      // Pas de tenant_id => le mock laisse passer (= tenant courant).
      seedTeam({ id: 'mine', member_count: 1 }),
      // tenant_id explicitement différent => exclu par .eq('tenant_id', ...).
      seedTeam({
        id: 'other',
        member_count: 1,
        tenant_id: '00000000-0000-0000-0000-000000000999',
      }),
    ];
    const res = makeRes();
    await teamsHandler(makeReq({ query: { joinable: '1' } }), res);

    const teams = (res.body as any).teams;
    expect(teams.map((t: any) => t.id)).toEqual(['mine']);
  });

  it("aplatit member_count depuis l'agrégat team_members(count)", async () => {
    store.teams = [seedTeam({ id: 'a', member_count: 3 })];
    const res = makeRes();
    await teamsHandler(makeReq({ query: { joinable: '1' } }), res);

    const teams = (res.body as any).teams;
    expect(teams[0].member_count).toBe(3);
    expect(teams[0].is_joinable).toBe(true);
  });

  // NOTE mock : la recherche `search` passe par `.or('name.ilike...,short_name.ilike...')`
  // que le mock supabase traite comme un NO-OP (cf. supabaseMock Builder.or).
  // On vérifie donc seulement que la requête n'échoue pas quand `search` est
  // fourni — aucune assertion sur le filtrage par nom, qui n'est pas représenté
  // par le mock. Le filtrage réel est couvert côté e2e / PostgREST.
  it('accepte un paramètre search sans erreur (filtrage non testable via mock)', async () => {
    store.teams = [
      seedTeam({ id: 'a', name: 'Alpha', member_count: 1 }),
      seedTeam({ id: 'b', name: 'Beta', member_count: 1 }),
    ];
    const res = makeRes();
    await teamsHandler(
      makeReq({ query: { joinable: '1', search: 'Alph' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(Array.isArray((res.body as any).teams)).toBe(true);
  });
});

/* -----------------------------------------------------------
 * GET /api/teams (sans joinable)
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * Disponibilité scrim (R3)
 *
 * `open_for_scrim` est le signal qui rend la sélection d'adversaire informée :
 * sans lui, choisir revient à tirer au sort dans une liste alphabétique.
 * ---------------------------------------------------------*/

describe('GET /api/teams — disponibilité scrim', () => {
  it('expose open_for_scrim sur chaque équipe (défaut false)', async () => {
    store.teams = [
      seedTeam({ id: 'a', name: 'Dispo', open_for_scrim: true }),
      seedTeam({ id: 'b', name: 'Pas dispo', open_for_scrim: false }),
      // Colonne absente (équipe ancienne) → false, jamais undefined.
      seedTeam({ id: 'c', name: 'Inconnue' }),
    ] as any;

    const res = makeRes();
    await teamsHandler(makeReq({ query: {} }), res);

    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams as Array<Record<string, unknown>>;
    const byId = new Map(teams.map((t) => [t.id, t]));
    expect(byId.get('a')!.open_for_scrim).toBe(true);
    expect(byId.get('b')!.open_for_scrim).toBe(false);
    expect(byId.get('c')!.open_for_scrim).toBe(false);
  });

  it('?open_for_scrim=1 ne renvoie que les équipes disponibles', async () => {
    store.teams = [
      seedTeam({ id: 'a', name: 'Dispo', open_for_scrim: true }),
      seedTeam({ id: 'b', name: 'Pas dispo', open_for_scrim: false }),
    ] as any;

    const res = makeRes();
    await teamsHandler(makeReq({ query: { open_for_scrim: '1' } }), res);

    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams as Array<Record<string, unknown>>;
    expect(teams.map((t) => t.id)).toEqual(['a']);
  });
});

describe('GET /api/teams (sans joinable)', () => {
  it('renvoie toutes les équipes du tenant, pleines incluses', async () => {
    store.teams = [
      seedTeam({ id: 'a', is_joinable: true, member_count: 2 }),
      seedTeam({ id: 'b', is_joinable: false, member_count: 2 }),
      seedTeam({
        id: 'full',
        is_joinable: true,
        member_count: MAX_TEAM_PLAYERS,
      }),
    ];
    const res = makeRes();
    await teamsHandler(makeReq({ query: {} }), res);

    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams;
    // Sans joinable : pas de filtre is_joinable ni d'exclusion fullness.
    expect(teams.map((t: any) => t.id).sort()).toEqual(['a', 'b', 'full']);
  });

  it('filtre par country quand fourni', async () => {
    store.teams = [
      seedTeam({ id: 'fr', country: 'FR', member_count: 1 }),
      seedTeam({ id: 'de', country: 'DE', member_count: 1 }),
    ];
    const res = makeRes();
    await teamsHandler(makeReq({ query: { country: 'FR' } }), res);

    const teams = (res.body as any).teams;
    expect(teams.map((t: any) => t.id)).toEqual(['fr']);
  });

  it('rejette les méthodes non-GET avec 405 + header Allow', async () => {
    const res = makeRes();
    await teamsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('pose un Cache-Control public sur succès', async () => {
    store.teams = [seedTeam({ id: 'a', member_count: 1 })];
    const res = makeRes();
    await teamsHandler(makeReq({ query: {} }), res);
    expect(String(res.headers['Cache-Control'])).toContain('public');
  });
});
