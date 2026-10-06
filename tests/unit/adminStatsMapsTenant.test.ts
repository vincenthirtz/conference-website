// Stats de maps par espace (lot A10, ex-TODO S5c+).
//
// `map_stats_view` agrégeait toute la plateforme : un espace voyait les cartes
// de tous les autres. La vue porte désormais tenant_id (migration
// map_stats_view_tenant.sql) ; tant qu'elle n'est pas appliquée, la lecture
// retombe sur un calcul depuis `games` — filtré par tenant lui aussi.

import { describe, it, expect } from 'vitest';
import {
  aggregateMapStats,
  isMissingTenantColumn,
  listMapStats,
} from '../../features/admin/stats/repository';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Call = { table: string; filters: [string, unknown][] };

/** Client minimal : la vue répond `viewResult`, `games` filtre par eq(). */
function fakeDb(opts: {
  viewResult: { data: unknown[] | null; error: unknown; count?: number };
  games?: Record<string, unknown>[];
}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      const builder: any = {
        select: () => builder,
        eq: (col: string, v: unknown) => (call.filters.push([col, v]), builder),
        gte: () => builder,
        order: () => builder,
        ilike: () => builder,
        range: (a: number, b: number) => ((from = a), (to = b), builder),
        then: (resolve: (v: unknown) => void) => {
          if (table === 'map_stats_view') return resolve(opts.viewResult);
          const rows = (opts.games ?? []).filter((r) =>
            call.filters.every(([c, v]) => r[c] === v)
          );
          return resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
  return { db: db as any, calls };
}

const BASE = {
  tenantId: TENANT,
  minMatches: 0,
  sortBy: 'games_played',
  ascending: false,
  offset: 0,
  limit: 100,
  search: null,
};

describe('listMapStats — bornée à l’espace', () => {
  it('filtre la vue par tenant_id', async () => {
    const { db, calls } = fakeDb({
      viewResult: { data: [{ map_name: 'Lijiang' }], error: null, count: 1 },
    });
    const out = await listMapStats(db, BASE);
    expect(out.source).toBe('view');
    expect(calls[0].table).toBe('map_stats_view');
    expect(calls[0].filters).toContainEqual(['tenant_id', TENANT]);
  });

  it('vue non migrée (42703) : repli sur games DE L’ESPACE, jamais l’agrégat plateforme', async () => {
    const { db, calls } = fakeDb({
      viewResult: {
        data: null,
        error: {
          code: '42703',
          message: 'column map_stats_view.tenant_id does not exist',
        },
      },
      games: [
        {
          tenant_id: TENANT,
          map_name: 'Lijiang',
          team1_score: 2,
          team2_score: 1,
        },
        {
          tenant_id: TENANT,
          map_name: 'Lijiang',
          team1_score: 0,
          team2_score: 2,
        },
        {
          tenant_id: TENANT,
          map_name: 'Busan',
          team1_score: 1,
          team2_score: 0,
        },
        {
          tenant_id: OTHER,
          map_name: 'Lijiang',
          team1_score: 3,
          team2_score: 0,
        },
        { tenant_id: OTHER, map_name: 'Ilios', team1_score: 1, team2_score: 0 },
      ],
    });
    const out = await listMapStats(db, BASE);
    expect(out.source).toBe('games');
    expect(out.error).toBeNull();
    expect(calls[1].table).toBe('games');
    expect(calls[1].filters).toContainEqual(['tenant_id', TENANT]);
    expect(out.count).toBe(2);
    const names = out.rows.map((r) => r.map_name);
    expect(names).toEqual(['Lijiang', 'Busan']); // tri games_played desc
    expect(names).not.toContain('Ilios');
    const lijiang = out.rows[0];
    expect(lijiang.games_played).toBe(2);
    expect(lijiang.wins_team1).toBe(1);
    expect(lijiang.wins_team2).toBe(1);
    expect(lijiang.total_rounds).toBe(5);
  });

  it('le repli applique minMatches, recherche et pagination', async () => {
    const { db } = fakeDb({
      viewResult: { data: null, error: { code: '42703' } },
      games: [
        {
          tenant_id: TENANT,
          map_name: 'Lijiang',
          team1_score: 1,
          team2_score: 0,
        },
        {
          tenant_id: TENANT,
          map_name: 'Lijiang',
          team1_score: 1,
          team2_score: 0,
        },
        {
          tenant_id: TENANT,
          map_name: 'Busan',
          team1_score: 1,
          team2_score: 0,
        },
      ],
    });
    const min = await listMapStats(db, { ...BASE, minMatches: 2 });
    expect(min.rows.map((r) => r.map_name)).toEqual(['Lijiang']);
    const search = await listMapStats(db, { ...BASE, search: 'bus' });
    expect(search.rows.map((r) => r.map_name)).toEqual(['Busan']);
    const page = await listMapStats(db, { ...BASE, offset: 1, limit: 1 });
    expect(page.rows.map((r) => r.map_name)).toEqual(['Busan']);
    expect(page.count).toBe(2);
  });

  it('une autre erreur de la vue remonte telle quelle (pas de repli silencieux)', async () => {
    const { db, calls } = fakeDb({
      viewResult: { data: null, error: { code: '57014', message: 'timeout' } },
    });
    const out = await listMapStats(db, BASE);
    expect(out.source).toBe('view');
    expect(out.error).toEqual({ code: '57014', message: 'timeout' });
    expect(calls).toHaveLength(1);
  });
});

describe('isMissingTenantColumn', () => {
  it('reconnaît 42703 et le message PostgREST', () => {
    expect(isMissingTenantColumn({ code: '42703' })).toBe(true);
    expect(
      isMissingTenantColumn({
        message: "Could not find the 'tenant_id' column of 'map_stats_view'",
      })
    ).toBe(true);
    expect(isMissingTenantColumn({ code: '57014', message: 'x' })).toBe(false);
    expect(isMissingTenantColumn(null)).toBe(false);
  });
});

describe('aggregateMapStats — même calcul que la vue SQL', () => {
  it('ignore les scores NULL dans les sommes, compte la partie', () => {
    const [row] = aggregateMapStats([
      { map_name: 'Ilios', team1_score: null, team2_score: 1 },
    ]);
    expect(row.games_played).toBe(1);
    expect(row.wins_team1).toBe(0);
    expect(row.wins_team2).toBe(0);
    expect(row.total_rounds).toBeNull();
  });
});
