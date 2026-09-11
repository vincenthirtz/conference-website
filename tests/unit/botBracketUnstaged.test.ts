// GET /api/bot/v1/tournaments/[tournamentId]/bracket — commande /bracket.
//
// Deux trous corrigés :
//   - les matchs SANS phase (stage_id NULL : Petite finale, Grande finale)
//     étaient absents — la requête filtrait `.in('stage_id', …)` ;
//   - phases et matchs soft-supprimés (`deleted_at` posé) remontaient.
//
// Contrat : champ de premier niveau `unstagedMatches` (mêmes objets que
// `stages[].matches`), toujours présent, `[]` avec `?stageId=`, renvoyé aussi
// quand le tournoi n'a aucune phase. `stages` garde sa shape d'origine.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID as TENANT,
} from './__helpers__/supabaseMock';
import bracketHandler from '../../pages/api/bot/v1/tournaments/[tournamentId]/bracket';

const T = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
const T_OTHER = 'e8fa740c-d92b-49d8-a654-05a37d0eea3c';
const S1 = '33333333-3333-4333-8333-333333333331';
const S_DEL = '33333333-3333-4333-8333-333333333332';

const M_S1 = '44444444-4444-4444-8444-444444444401';
const M_S1_DEL = '44444444-4444-4444-8444-444444444402';
const M_SDEL = '44444444-4444-4444-8444-444444444403';
const GF = '44444444-4444-4444-8444-444444444404';
const PF = '44444444-4444-4444-8444-444444444405';
const FINAL_DEL = '44444444-4444-4444-8444-444444444406';
const OTHER = '44444444-4444-4444-8444-444444444407';

function makeReq(query: Record<string, string>): any {
  return {
    method: 'GET',
    headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT },
    query,
    body: {},
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(query: Record<string, string>) {
  const res = makeRes();
  await bracketHandler(makeReq(query), res);
  return res;
}

function m(id: string, over: Record<string, unknown>) {
  return {
    id,
    tenant_id: TENANT,
    tournament_id: T,
    stage_id: null,
    status: 'pending',
    is_bye: false,
    round_number: 1,
    round_name: null,
    scheduled_at: null,
    deleted_at: null,
    ...over,
  };
}

const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  store.tournaments = [
    {
      id: T,
      tenant_id: TENANT,
      name: 'OW WOMEN’s CUP 2026',
      status: 'running',
    },
  ] as any;
  store.tournament_stages = [
    {
      id: S1,
      tenant_id: TENANT,
      tournament_id: T,
      name: 'Playoffs',
      stage_type: 'single_elim',
      order_index: 0,
      deleted_at: null,
    },
    {
      id: S_DEL,
      tenant_id: TENANT,
      tournament_id: T,
      name: 'Phase supprimée',
      stage_type: 'single_elim',
      order_index: 1,
      deleted_at: '2026-09-01T00:00:00.000Z',
    },
  ] as any;
  store.matches = [
    m(M_S1, { stage_id: S1, round_name: 'Demi-finale' }),
    m(M_S1_DEL, { stage_id: S1, deleted_at: '2026-09-02T00:00:00.000Z' }),
    m(M_SDEL, { stage_id: S_DEL }),
    m(GF, {
      round_name: 'Grande finale',
      round_number: 2,
      scheduled_at: '2026-10-24T19:00:00.000Z',
    }),
    m(PF, {
      round_name: 'Petite finale',
      round_number: 1,
      scheduled_at: '2026-10-24T17:00:00.000Z',
    }),
    m(FINAL_DEL, {
      round_name: 'Finale annulée',
      deleted_at: '2026-09-03T00:00:00.000Z',
    }),
    m(OTHER, { tournament_id: T_OTHER, round_name: 'Autre tournoi' }),
  ] as any;
});

describe('GET /api/bot/v1/tournaments/[tournamentId]/bracket', () => {
  it('renvoie les finales sans phase dans `unstagedMatches`', async () => {
    const res = await call({ tournamentId: T });
    expect(res.statusCode).toBe(200);
    expect(ids(res.body.stages)).toEqual([S1]);
    expect(ids(res.body.unstagedMatches)).toEqual([PF, GF]);
    // Même shape de match que dans une phase.
    expect(res.body.unstagedMatches[1]).toEqual({
      id: GF,
      status: 'pending',
      isBye: false,
      roundNumber: 2,
      roundName: 'Grande finale',
      bracketSide: null,
      groupKey: null,
      scheduledAt: '2026-10-24T19:00:00.000Z',
      team1: null,
      team2: null,
      team1Score: null,
      team2Score: null,
      winnerTeamId: null,
    });
  });

  it('exclut phases et matchs soft-supprimés', async () => {
    const res = await call({ tournamentId: T });
    const all = [
      ...(res.body.stages as any[]).flatMap((s) => ids(s.matches)),
      ...ids(res.body.unstagedMatches),
    ];
    expect(all).toContain(M_S1);
    expect(all).not.toContain(M_S1_DEL);
    expect(all).not.toContain(M_SDEL);
    expect(all).not.toContain(FINAL_DEL);
    expect(all).not.toContain(OTHER);
    expect(ids(res.body.stages)).not.toContain(S_DEL);
  });

  it('?stageId= zoome sur la phase, `unstagedMatches` vide', async () => {
    const res = await call({ tournamentId: T, stageId: S1 });
    expect(ids(res.body.stages)).toEqual([S1]);
    expect(ids(res.body.stages[0].matches)).toEqual([M_S1]);
    expect(res.body.unstagedMatches).toEqual([]);
  });

  it('?stageId= d’une phase supprimée → aucune phase', async () => {
    const res = await call({ tournamentId: T, stageId: S_DEL });
    expect(res.statusCode).toBe(200);
    expect(res.body.stages).toEqual([]);
    expect(res.body.unstagedMatches).toEqual([]);
  });

  it('tournoi SANS phase : les finales sont quand même renvoyées', async () => {
    store.tournament_stages = [] as any;
    const res = await call({ tournamentId: T });
    expect(res.statusCode).toBe(200);
    expect(res.body.stages).toEqual([]);
    expect(ids(res.body.unstagedMatches)).toEqual([PF, GF]);
  });

  it('aucun match sans phase → `unstagedMatches: []`', async () => {
    store.matches = (store.matches as any[]).filter((x) => x.stage_id) as any;
    const res = await call({ tournamentId: T });
    expect(ids(res.body.stages)).toEqual([S1]);
    expect(res.body.unstagedMatches).toEqual([]);
  });
});
