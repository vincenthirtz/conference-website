// tests/unit/mapPool.test.ts
//
// Pool de cartes effectif et normalisation des noms (utils/maps/pool.ts).
//
// Contexte : `games.map_name` était un champ texte libre. En production, les
// 17 parties enregistrées portent « Map 1 », « Map 2 », « Map 3 » alors que le
// pool en compte trente — toute statistique par carte est donc vide de sens.

import { describe, it, expect } from 'vitest';
import {
  sortPoolRows,
  staticPool,
  mapNameKey,
  normalizeMapName,
  resolveEffectiveMapPool,
  type PoolMap,
} from '@/utils/maps/pool';

const pool: PoolMap[] = [
  { name: "King's Row", type: 'hybrid', image: null },
  { name: 'Château Guillard', type: 'deathmatch', image: null },
  { name: 'Lijiang Tower', type: 'control', image: null },
];

describe('mapNameKey', () => {
  it('neutralise casse, accents, ponctuation et espaces multiples', () => {
    expect(mapNameKey('Château Guillard')).toBe(mapNameKey('chateau  guillard'));
    expect(mapNameKey('LIJIANG TOWER')).toBe(mapNameKey('lijiang-tower'));
  });

  it('supprime l’apostrophe au lieu d’en faire un séparateur', () => {
    // Sinon « King's Row » → « king s row » et « KINGS-ROW » → « kings row » :
    // deux clés pour une même carte.
    expect(mapNameKey("King's Row")).toBe('kings row');
    expect(mapNameKey('KINGS-ROW')).toBe('kings row');
    expect(mapNameKey('King’s Row')).toBe('kings row');
  });

  it('ne confond pas deux cartes différentes', () => {
    expect(mapNameKey('Busan')).not.toBe(mapNameKey('Busan Downtown'));
  });
});

describe('normalizeMapName', () => {
  it('ramène une saisie approximative à l’orthographe du pool', () => {
    expect(normalizeMapName('kings row', pool)).toBe("King's Row");
    expect(normalizeMapName('  CHATEAU   GUILLARD ', pool)).toBe('Château Guillard');
  });

  it('laisse passer une carte hors pool, nettoyée', () => {
    // Une arène personnalisée doit rester saisissable.
    expect(normalizeMapName('  Mon  Arène  Perso ', pool)).toBe('Mon Arène Perso');
  });

  it('traite le vide comme une absence', () => {
    expect(normalizeMapName('', pool)).toBeNull();
    expect(normalizeMapName('   ', pool)).toBeNull();
    expect(normalizeMapName(null, pool)).toBeNull();
    expect(normalizeMapName(undefined, pool)).toBeNull();
  });

  it('sans pool, se contente de nettoyer', () => {
    expect(normalizeMapName('kings row', [])).toBe('kings row');
  });

  it('conserve une saisie sans aucun caractère alphanumérique', () => {
    expect(normalizeMapName('---', pool)).toBe('---');
  });
});

describe('sortPoolRows', () => {
  it('trie par order_index, puis alphabétiquement', () => {
    const rows = [
      { map_name: 'Ilios', map_type: null, image_url: null, order_index: 2 },
      { map_name: 'Busan', map_type: null, image_url: null, order_index: 1 },
      { map_name: 'Nepal', map_type: null, image_url: null, order_index: 2 },
    ];
    expect(sortPoolRows(rows).map((m) => m.name)).toEqual(['Busan', 'Ilios', 'Nepal']);
  });

  it('place les lignes sans order_index à la fin', () => {
    const rows = [
      { map_name: 'Sans index', map_type: null, image_url: null, order_index: null },
      { map_name: 'Avec index', map_type: null, image_url: null, order_index: 5 },
    ];
    expect(sortPoolRows(rows).map((m) => m.name)).toEqual(['Avec index', 'Sans index']);
  });

  it('ne mute pas le tableau reçu', () => {
    const rows = [
      { map_name: 'B', map_type: null, image_url: null, order_index: 2 },
      { map_name: 'A', map_type: null, image_url: null, order_index: 1 },
    ];
    sortPoolRows(rows);
    expect(rows[0].map_name).toBe('B');
  });
});

describe('staticPool', () => {
  it('retourne le catalogue du jeu connu', () => {
    expect(staticPool('overwatch').length).toBeGreaterThan(0);
  });

  it('retourne une liste vide pour un jeu inconnu ou absent', () => {
    expect(staticPool('jeu-inexistant')).toEqual([]);
    expect(staticPool(null)).toEqual([]);
  });
});

// --- Résolveur (avec un client simulé) --------------------------------------

type Row = Record<string, unknown>;

/** Client minimal : rend les lignes de la table demandée, ou une erreur. */
function fakeClient(tables: Record<string, Row[] | { error: true }>) {
  const calls: string[] = [];
  const client = {
    calls,
    from(table: string) {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const method of ['select', 'eq']) {
        (builder as Record<string, unknown>)[method] = chain;
      }
      const result = tables[table];
      // La chaîne est « thenable » : c'est ce que `await` consomme.
      (builder as Record<string, unknown>).then = (
        resolve: (v: unknown) => unknown
      ) =>
        Promise.resolve(
          result && 'error' in result
            ? { data: null, error: { message: 'boom' } }
            : { data: result ?? [], error: null }
        ).then(resolve);
      return builder;
    },
  };
  return client as unknown as Parameters<typeof resolveEffectiveMapPool>[0] & {
    calls: string[];
  };
}

const tournamentRows = [
  { map_name: 'Busan', map_type: 'control', image_url: null, order_index: 1 },
];
const tenantRows = [
  { map_name: 'Ilios', map_type: 'control', image_url: null, order_index: 1 },
];

describe('resolveEffectiveMapPool', () => {
  it('préfère les cartes déclarées sur le tournoi', async () => {
    const client = fakeClient({ tournament_maps: tournamentRows, tenant_map_pool: tenantRows });
    const res = await resolveEffectiveMapPool(client, {
      tenantId: 't1',
      tournamentId: 'trn',
      game: 'overwatch',
    });
    expect(res.source).toBe('tournament');
    expect(res.maps.map((m) => m.name)).toEqual(['Busan']);
  });

  it('retombe sur le pool du tenant si le tournoi n’a rien déclaré', async () => {
    const client = fakeClient({ tournament_maps: [], tenant_map_pool: tenantRows });
    const res = await resolveEffectiveMapPool(client, {
      tenantId: 't1',
      tournamentId: 'trn',
      game: 'overwatch',
    });
    expect(res.source).toBe('tenant');
    expect(res.maps.map((m) => m.name)).toEqual(['Ilios']);
  });

  it('retombe sur le catalogue statique si les deux sont vides', async () => {
    const client = fakeClient({ tournament_maps: [], tenant_map_pool: [] });
    const res = await resolveEffectiveMapPool(client, {
      tenantId: 't1',
      tournamentId: 'trn',
      game: 'overwatch',
    });
    expect(res.source).toBe('defaults');
    expect(res.maps.length).toBeGreaterThan(0);
  });

  it('ignore le tournoi quand includeTournamentMaps est faux', async () => {
    // C'est le cas de « ajouter les maps par défaut », qui ALIMENTE
    // tournament_maps et ne peut donc pas s'en servir comme source.
    const client = fakeClient({ tournament_maps: tournamentRows, tenant_map_pool: tenantRows });
    const res = await resolveEffectiveMapPool(client, {
      tenantId: 't1',
      tournamentId: 'trn',
      game: 'overwatch',
      includeTournamentMaps: false,
    });
    expect(res.source).toBe('tenant');
    expect(client.calls).not.toContain('tournament_maps');
  });

  it('dégrade sans jeter quand la base est en erreur', async () => {
    // Un pool indisponible ne doit pas empêcher d'enregistrer un score.
    const client = fakeClient({
      tournament_maps: { error: true },
      tenant_map_pool: { error: true },
    });
    const res = await resolveEffectiveMapPool(client, {
      tenantId: 't1',
      tournamentId: 'trn',
      game: 'overwatch',
    });
    expect(res.source).toBe('defaults');
  });

  it('sans tournoi ni jeu, ne consulte que le catalogue statique', async () => {
    const client = fakeClient({});
    const res = await resolveEffectiveMapPool(client, { tenantId: 't1' });
    expect(res).toEqual({ maps: [], source: 'defaults' });
    expect(client.calls).toEqual([]);
  });
});

describe('normalizeGameSlug', () => {
  it('ramène le jeu à son slug minuscule', async () => {
    const { normalizeGameSlug } = await import('@/utils/maps/pool');
    // `scrims.game` porte aussi bien « overwatch » que « Overwatch » en base,
    // alors que le pool est toujours en minuscules.
    expect(normalizeGameSlug('Overwatch')).toBe('overwatch');
    expect(normalizeGameSlug('  OVERWATCH  ')).toBe('overwatch');
    expect(normalizeGameSlug('')).toBeNull();
    expect(normalizeGameSlug(null)).toBeNull();
  });

  it('un jeu en majuscules trouve quand même son catalogue', () => {
    expect(staticPool('Overwatch').length).toBeGreaterThan(0);
  });

  it('un scrim « Overwatch » atteint le pool du tenant', async () => {
    const client = fakeClient({ tournament_maps: [], tenant_map_pool: tenantRows });
    const res = await resolveEffectiveMapPool(client, {
      tenantId: 't1',
      game: 'Overwatch',
    });
    expect(res.source).toBe('tenant');
  });
});

describe('toOne', () => {
  it('accepte l’objet renvoyé par PostgREST comme le tableau des typings', async () => {
    const { toOne } = await import('@/utils/maps/pool');
    expect(toOne({ game: 'overwatch' })).toEqual({ game: 'overwatch' });
    expect(toOne([{ game: 'overwatch' }])).toEqual({ game: 'overwatch' });
  });

  it('rend null sur vide, tableau vide, null ou undefined', async () => {
    const { toOne } = await import('@/utils/maps/pool');
    expect(toOne([])).toBeNull();
    expect(toOne(null)).toBeNull();
    expect(toOne(undefined)).toBeNull();
  });
});
