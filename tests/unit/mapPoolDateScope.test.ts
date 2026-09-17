// tests/unit/mapPoolDateScope.test.ts
//
// Pools de cartes PAR DATE de jeu (`tournament_maps.play_date`).
//
// Contexte : l'organisation publie « Map Pool 30/09 », et le 30/09 réunit des
// matchs J2 et J3 — aucun pool de journée ne peut le représenter. Priorité
// appliquée à un match : date > journée > pool par défaut > tenant > statique.
//
// LE risque que ces tests verrouillent : le pool par défaut est
// `round_number IS NULL AND play_date IS NULL`. Oublier la seconde moitié fait
// fuiter chaque pool daté dans le pool par défaut.

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveEffectiveMapPool } from '@/utils/maps/pool';
import {
  applyPoolScope,
  buildDateOptions,
  formatPlayDateShort,
  isValidPlayDate,
  parseDateParam,
  poolScopeColumns,
} from '@/utils/maps/poolScope';
import { buildScopedPools } from '@/utils/maps/publicPools';
import {
  sameScope,
  scopeFromQuery,
  withScope,
} from '@/components/admin/tournament/mapPool/usePoolScope';

const TENANT = 'tenant-1';
const TID = 'trn-1';

function row(
  name: string,
  scope: { round?: number; date?: string } = {},
  order = 0
) {
  return {
    id: `${name}-${scope.round ?? ''}-${scope.date ?? ''}`,
    tenant_id: TENANT,
    tournament_id: TID,
    map_name: name,
    map_type: 'control',
    image_url: null,
    enabled: true,
    order_index: order,
    round_number: scope.round ?? null,
    play_date: scope.date ?? null,
  };
}

describe('isValidPlayDate / parseDateParam', () => {
  it('accepte un YYYY-MM-DD calendaire réel', () => {
    expect(isValidPlayDate('2026-09-30')).toBe(true);
    expect(parseDateParam('2026-09-30')).toEqual({
      ok: true,
      date: '2026-09-30',
    });
  });

  it('refuse les dates impossibles ou mal formées', () => {
    expect(isValidPlayDate('2026-02-31')).toBe(false);
    expect(isValidPlayDate('30/09/2026')).toBe(false);
    expect(isValidPlayDate('2026-9-30')).toBe(false);
    expect(parseDateParam('30/09').ok).toBe(false);
    expect(parseDateParam(['2026-09-30']).ok).toBe(false);
  });

  it('absent ou vide → pas de date (pool par défaut)', () => {
    expect(parseDateParam(undefined)).toEqual({ ok: true, date: null });
    expect(parseDateParam('')).toEqual({ ok: true, date: null });
  });
});

describe('poolScopeColumns / formatPlayDateShort', () => {
  it('une ligne ne porte jamais les deux clés', () => {
    expect(poolScopeColumns({ kind: 'default' })).toEqual({
      round_number: null,
      play_date: null,
    });
    expect(poolScopeColumns({ kind: 'round', round: 2 })).toEqual({
      round_number: 2,
      play_date: null,
    });
    expect(poolScopeColumns({ kind: 'date', date: '2026-09-30' })).toEqual({
      round_number: null,
      play_date: '2026-09-30',
    });
  });

  it('formate JJ/MM sans passer par le fuseau du lecteur', () => {
    expect(formatPlayDateShort('2026-09-30')).toBe('30/09');
  });
});

describe('applyPoolScope (mock PostgREST)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    store.tournament_maps = [
      row('Busan'),
      row('Nepal', { round: 2 }),
      row('Oasis', { date: '2026-09-30' }),
    ] as any;
  });

  async function names(scope: Parameters<typeof applyPoolScope>[1]) {
    const { data } = await applyPoolScope(
      supabaseAdmin.from('tournament_maps').select('*'),
      scope
    );
    return ((data ?? []) as { map_name: string }[]).map((r) => r.map_name);
  }

  it('le pool par défaut EXCLUT les lignes datées et de journée', async () => {
    expect(await names({ kind: 'default' })).toEqual(['Busan']);
  });

  it('journée et date ne lisent que leur pool', async () => {
    expect(await names({ kind: 'round', round: 2 })).toEqual(['Nepal']);
    expect(await names({ kind: 'date', date: '2026-09-30' })).toEqual([
      'Oasis',
    ]);
  });
});

describe('resolveEffectiveMapPool — priorité date > journée > défaut', () => {
  beforeEach(() => {
    resetSupabaseMock();
    store.tournament_maps = [
      row('Busan', {}, 0),
      row('Ilios', {}, 1),
      row('Nepal', { round: 2 }),
      row('Oasis', { date: '2026-09-30' }, 0),
      row('Havana', { date: '2026-09-30' }, 1),
    ] as any;
  });

  const base = {
    tenantId: TENANT,
    tournamentId: TID,
    game: 'overwatch',
  };

  it('un match du 30/09 en J2 prend le pool du 30/09', async () => {
    const res = await resolveEffectiveMapPool(supabaseAdmin, {
      ...base,
      roundNumber: 2,
      playDate: '2026-09-30',
    });
    expect(res.source).toBe('tournament-date');
    expect(res.maps.map((m) => m.name)).toEqual(['Oasis', 'Havana']);
  });

  it('une autre date de J2, sans pool daté, prend le pool de J2', async () => {
    const res = await resolveEffectiveMapPool(supabaseAdmin, {
      ...base,
      roundNumber: 2,
      playDate: '2026-09-23',
    });
    expect(res.source).toBe('tournament-round');
    expect(res.maps.map((m) => m.name)).toEqual(['Nepal']);
  });

  it('ni date ni journée couvertes → pool par défaut, SANS les lignes datées', async () => {
    const res = await resolveEffectiveMapPool(supabaseAdmin, {
      ...base,
      roundNumber: 5,
      playDate: '2026-10-16',
    });
    expect(res.source).toBe('tournament');
    expect(res.maps.map((m) => m.name)).toEqual(['Busan', 'Ilios']);
  });

  it('sans paramètre, le pool par défaut ne mêle ni dates ni journées', async () => {
    const res = await resolveEffectiveMapPool(supabaseAdmin, base);
    expect(res.maps.map((m) => m.name)).toEqual(['Busan', 'Ilios']);
  });

  it('une date invalide est ignorée (retombe sur la journée)', async () => {
    const res = await resolveEffectiveMapPool(supabaseAdmin, {
      ...base,
      roundNumber: 2,
      playDate: '30/09',
    });
    expect(res.source).toBe('tournament-round');
  });

  it('un pool daté désactivé ne masque pas la journée', async () => {
    for (const r of store.tournament_maps as any[]) {
      if (r.play_date) r.enabled = false;
    }
    const res = await resolveEffectiveMapPool(supabaseAdmin, {
      ...base,
      roundNumber: 2,
      playDate: '2026-09-30',
    });
    expect(res.source).toBe('tournament-round');
  });
});

describe('buildDateOptions', () => {
  it('liste les jours du planning (Paris) avec leurs journées, triés', () => {
    const options = buildDateOptions(
      [
        {
          round_number: 3,
          round_name: 'J3',
          scheduled_at: '2026-09-30T19:00:00Z',
        },
        {
          round_number: 2,
          round_name: 'J2',
          scheduled_at: '2026-09-30T17:00:00Z',
        },
        // 23h30 UTC le 22/09 = 01h30 le 23/09 à Paris.
        {
          round_number: 2,
          round_name: 'J2',
          scheduled_at: '2026-09-22T23:30:00Z',
        },
        { round_number: null, scheduled_at: null },
      ],
      new Map([['2026-09-30', 4]])
    );
    expect(options).toEqual([
      { date: '2026-09-23', rounds: ['J2'], mapsCount: 0 },
      { date: '2026-09-30', rounds: ['J2', 'J3'], mapsCount: 4 },
    ]);
  });

  it('garde une date qui a un pool même sans match (report)', () => {
    expect(buildDateOptions([], new Map([['2026-10-02', 3]]))).toEqual([
      { date: '2026-10-02', rounds: [], mapsCount: 3 },
    ]);
  });
});

describe('buildScopedPools (page publique)', () => {
  const matches = [
    { round_number: 2, round_name: 'J2', scheduled_at: '2026-09-23T17:00:00Z' },
    { round_number: 2, round_name: 'J2', scheduled_at: '2026-09-30T17:00:00Z' },
    { round_number: 3, round_name: 'J3', scheduled_at: '2026-09-30T19:00:00Z' },
    { round_number: 1, round_name: 'J1', scheduled_at: '2026-09-18T17:00:00Z' },
  ];

  it('trie chronologiquement et retire des journées les dates qui ont leur pool', () => {
    const pools = buildScopedPools(
      [
        row('Nepal', { round: 2 }),
        row('Busan', { round: 1 }),
        row('Havana', { date: '2026-09-30' }, 1),
        row('Oasis', { date: '2026-09-30' }, 0),
        row('Ignored'), // pool par défaut : pas un pool scopé
      ],
      matches
    );
    expect(pools.map((p) => p.key)).toEqual([
      'round:1',
      'round:2',
      'date:2026-09-30',
    ]);
    const j2 = pools[1];
    expect(j2.dates).toEqual(['2026-09-23']);
    expect(j2.overriddenDates).toEqual(['2026-09-30']);
    const d = pools[2];
    expect(d.rounds).toEqual(['J2', 'J3']);
    expect(d.maps.map((m) => m.name)).toEqual(['Oasis', 'Havana']);
  });

  it('masque une journée dont chaque jour a son propre pool', () => {
    const pools = buildScopedPools(
      [row('Nepal', { round: 3 }), row('Oasis', { date: '2026-09-30' })],
      matches
    );
    expect(pools.map((p) => p.key)).toEqual(['date:2026-09-30']);
  });
});

describe('usePoolScope — helpers purs', () => {
  it('lit la portée dans la query (date prioritaire, valeurs invalides ignorées)', () => {
    expect(scopeFromQuery({})).toEqual({ kind: 'default' });
    expect(scopeFromQuery({ round: '2' })).toEqual({ kind: 'round', round: 2 });
    expect(scopeFromQuery({ date: '2026-09-30', round: '2' })).toEqual({
      kind: 'date',
      date: '2026-09-30',
    });
    expect(scopeFromQuery({ date: 'nope' })).toEqual({ kind: 'default' });
    expect(scopeFromQuery({ round: '0' })).toEqual({ kind: 'default' });
  });

  it('construit l’URL de l’API avec un seul paramètre', () => {
    expect(withScope('/api/x', { kind: 'default' })).toBe('/api/x');
    expect(withScope('/api/x', { kind: 'round', round: 3 })).toBe(
      '/api/x?round=3'
    );
    expect(withScope('/api/x?a=1', { kind: 'date', date: '2026-09-30' })).toBe(
      '/api/x?a=1&date=2026-09-30'
    );
  });

  it('compare deux portées', () => {
    expect(
      sameScope(
        { kind: 'date', date: '2026-09-30' },
        { kind: 'date', date: '2026-09-30' }
      )
    ).toBe(true);
    expect(sameScope({ kind: 'round', round: 2 }, { kind: 'default' })).toBe(
      false
    );
  });
});
