// Tests de GET /api/bot/v1/autocomplete/matches.
//
// Ce qui motive ce fichier : les matchs de la PREMIÈRE ÉDITION (Cup 2025,
// tournoi `completed`) remontaient dans l'autocomplete de `/mvp ouvrir`.
// C'est la première commande à demander des matchs `finished` — les autres
// cherchent du pending/ongoing/disputed, dont une édition terminée n'a plus,
// d'où un problème resté invisible jusque-là. Proposer d'ouvrir un vote MVP
// sur un match d'il y a un an n'a aucun sens, et les libellés se ressemblent
// d'une édition à l'autre.
//
// Couvert :
//   - une édition close (completed / archived) n'est pas proposée
//   - l'édition en cours l'est
//   - les scrims (tournament_id NULL) survivent au filtre — `not.in` seul les
//     aurait écartés, NULL NOT IN (…) ne valant pas VRAI en SQL
//   - un `tournamentId` explicite est honoré, même sur une édition close

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/autocomplete/matches';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

const T_RUNNING = '22222222-2222-4222-8222-2222222222aa';
const T_COMPLETED = '22222222-2222-4222-8222-2222222222bb';
const T_ARCHIVED = '22222222-2222-4222-8222-2222222222cc';

const M_RUNNING = '11111111-1111-4111-8111-111111111111';
const M_COMPLETED = '11111111-1111-4111-8111-111111111112';
const M_ARCHIVED = '11111111-1111-4111-8111-111111111113';
const M_SCRIM = '11111111-1111-4111-8111-111111111114';

const TEAM_A = '33333333-3333-4333-8333-333333333aaa';
const TEAM_B = '33333333-3333-4333-8333-333333333bbb';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(query: Record<string, string> = {}) {
  const res = makeRes();
  await handler(
    {
      method: 'GET',
      headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT },
      query: { status: 'finished', ...query },
      body: {},
    } as any,
    res
  );
  return res;
}

const ids = (res: any) => (res.body?.results ?? []).map((r: any) => r.value);

function seed() {
  store.tenants = [
    {
      id: TENANT,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;

  store.tournaments = [
    { id: T_RUNNING, tenant_id: TENANT, status: 'running', name: 'Cup 2026' },
    {
      id: T_COMPLETED,
      tenant_id: TENANT,
      status: 'completed',
      name: 'Cup 2025',
    },
    {
      id: T_ARCHIVED,
      tenant_id: TENANT,
      status: 'archived',
      name: 'Tournoi Mixte',
    },
  ] as any;

  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Alpines' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Bravos' },
  ] as any;

  const base = {
    tenant_id: TENANT,
    status: 'finished',
    round_name: 'J1',
    round_number: 1,
    scheduled_at: '2026-09-18T17:00:00Z',
    team1_id: TEAM_A,
    team2_id: TEAM_B,
    scrim_id: null,
  };

  store.matches = [
    { ...base, id: M_RUNNING, tournament_id: T_RUNNING },
    { ...base, id: M_COMPLETED, tournament_id: T_COMPLETED },
    { ...base, id: M_ARCHIVED, tournament_id: T_ARCHIVED },
    { ...base, id: M_SCRIM, tournament_id: null, scrim_id: 'scrim-1' },
  ] as any;
}

describe('/api/bot/v1/autocomplete/matches', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
  });

  it("ne propose pas les matchs d'une édition close", async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    const got = ids(res);
    expect(got).not.toContain(M_COMPLETED);
    expect(got).not.toContain(M_ARCHIVED);
  });

  it("propose les matchs de l'édition en cours", async () => {
    expect(ids(await call())).toContain(M_RUNNING);
  });

  it('laisse passer les scrims, qui n’appartiennent à aucun tournoi', async () => {
    // `not.in` seul les aurait écartés : NULL NOT IN (…) ne vaut pas VRAI.
    expect(ids(await call())).toContain(M_SCRIM);
  });

  it('une édition close nombreuse ne vide pas la liste (sur-récupération)', async () => {
    // Les éditions closes sont les plus ANCIENNES, donc les premières dans un
    // tri par date croissante. Sans sur-récupération, la limite serait remplie
    // par elles seules et le filtrage rendrait une liste vide.
    const olds = Array.from({ length: 30 }, (_, i) => ({
      id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
      tenant_id: TENANT,
      tournament_id: T_COMPLETED,
      status: 'finished',
      round_name: 'J1',
      round_number: 1,
      // Antérieurs d'un an : ils passent devant dans le tri.
      scheduled_at: `2025-09-${String((i % 28) + 1).padStart(2, '0')}T17:00:00Z`,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      scrim_id: null,
    }));
    store.matches = [...olds, ...(store.matches as any[])] as any;

    const got = ids(await call());
    expect(got).toContain(M_RUNNING);
    expect(got.some((id: string) => id.startsWith('44444444'))).toBe(false);
  });

  it('honore un tournoi explicitement demandé, même clos', async () => {
    const got = ids(await call({ tournamentId: T_COMPLETED }));
    expect(got).toEqual([M_COMPLETED]);
  });
});
