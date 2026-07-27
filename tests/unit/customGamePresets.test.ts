// tests/unit/customGamePresets.test.ts
//
// Couvre la logique pure des presets de partie personnalisée :
// normalisation/validation du code d'import, normalisation du map_pool,
// et surtout la RÉSOLUTION de périmètre (phase > tournoi > tenant) qui décide
// quel code est poussé à l'hôte d'un match.

import { describe, it, expect } from 'vitest';
import {
  normalizeImportCode,
  isValidImportCode,
  normalizeMapPool,
  presetScope,
  resolvePreset,
  toResolvedPreset,
  formatPresetLines,
  type CustomGamePresetRow,
} from '@/utils/customGamePresets';

const TENANT = '11111111-1111-1111-1111-111111111111';
const TOURNAMENT = '22222222-2222-2222-2222-222222222222';
const OTHER_TOURNAMENT = '33333333-3333-3333-3333-333333333333';
const STAGE = '44444444-4444-4444-4444-444444444444';
const OTHER_STAGE = '55555555-5555-5555-5555-555555555555';

function row(over: Partial<CustomGamePresetRow> = {}): CustomGamePresetRow {
  return {
    id: over.id ?? 'preset-1',
    tenant_id: TENANT,
    game: 'overwatch',
    tournament_id: null,
    stage_id: null,
    name: 'Preset',
    import_code: 'ABC12',
    description: null,
    map_pool: [],
    enabled: true,
    updated_at: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('normalizeImportCode', () => {
  it('trim, retire espaces/tirets et met en majuscules pour Overwatch', () => {
    expect(normalizeImportCode('  a1b-2c ', 'overwatch')).toBe('A1B2C');
    expect(normalizeImportCode('a1 b2 c3', 'overwatch')).toBe('A1B2C3');
  });

  it('se contente d’un trim pour les autres jeux (mots de passe sensibles à la casse)', () => {
    expect(normalizeImportCode('  Mon Lobby ', 'valorant')).toBe('Mon Lobby');
  });

  it('renvoie une chaîne vide sur entrée non-string', () => {
    expect(normalizeImportCode(null)).toBe('');
    expect(normalizeImportCode(42)).toBe('');
    expect(normalizeImportCode(undefined)).toBe('');
  });
});

describe('isValidImportCode', () => {
  it('accepte les codes Overwatch alphanumériques de 4 à 12 signes', () => {
    expect(isValidImportCode('ABC1', 'overwatch')).toBe(true);
    expect(isValidImportCode('A1B2C3', 'overwatch')).toBe(true);
    expect(isValidImportCode('ABCDEFGH1234', 'overwatch')).toBe(true);
  });

  it('rejette les codes Overwatch trop courts, trop longs ou non alphanumériques', () => {
    expect(isValidImportCode('AB1', 'overwatch')).toBe(false);
    expect(isValidImportCode('ABCDEFGH12345', 'overwatch')).toBe(false);
    expect(isValidImportCode('ABC-12', 'overwatch')).toBe(false);
    expect(isValidImportCode('abc12', 'overwatch')).toBe(false);
    expect(isValidImportCode('', 'overwatch')).toBe(false);
  });

  it('reste permissif pour les autres jeux mais refuse les bords espacés', () => {
    expect(isValidImportCode('Mon Lobby', 'valorant')).toBe(true);
    expect(isValidImportCode('x', 'cs2')).toBe(true);
    expect(isValidImportCode(' leading', 'valorant')).toBe(false);
    expect(isValidImportCode('trailing ', 'valorant')).toBe(false);
  });
});

describe('normalizeMapPool', () => {
  it('ne garde que les strings non vides, dédupliquées sans tenir compte de la casse', () => {
    expect(
      normalizeMapPool(['Ilios', ' Busan ', 'ilios', '', 42, null, 'Nepal'])
    ).toEqual(['Ilios', 'Busan', 'Nepal']);
  });

  it('renvoie [] sur une valeur non-tableau', () => {
    expect(normalizeMapPool(null)).toEqual([]);
    expect(normalizeMapPool('Ilios')).toEqual([]);
    expect(normalizeMapPool({ maps: ['Ilios'] })).toEqual([]);
  });

  it('borne la liste à 32 entrées', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Map ${i}`);
    expect(normalizeMapPool(many)).toHaveLength(32);
  });
});

describe('presetScope', () => {
  it('classe selon les refs présentes', () => {
    expect(presetScope({ tournament_id: null, stage_id: null })).toBe('tenant');
    expect(presetScope({ tournament_id: TOURNAMENT, stage_id: null })).toBe(
      'tournament'
    );
    expect(presetScope({ tournament_id: TOURNAMENT, stage_id: STAGE })).toBe(
      'stage'
    );
  });
});

describe('resolvePreset', () => {
  const tenantPreset = row({ id: 'tenant', import_code: 'TENAN' });
  const tournamentPreset = row({
    id: 'tournament',
    tournament_id: TOURNAMENT,
    import_code: 'TOURN',
  });
  const stagePreset = row({
    id: 'stage',
    tournament_id: TOURNAMENT,
    stage_id: STAGE,
    import_code: 'STAGE',
  });
  const all = [tenantPreset, tournamentPreset, stagePreset];

  it('prend le preset de phase quand la phase correspond', () => {
    const r = resolvePreset(all, {
      tournamentId: TOURNAMENT,
      stageId: STAGE,
    });
    expect(r?.id).toBe('stage');
    expect(r?.scope).toBe('stage');
  });

  it('retombe sur le preset du tournoi pour une autre phase', () => {
    const r = resolvePreset(all, {
      tournamentId: TOURNAMENT,
      stageId: OTHER_STAGE,
    });
    expect(r?.id).toBe('tournament');
  });

  it('retombe sur le preset tenant pour un autre tournoi', () => {
    const r = resolvePreset(all, {
      tournamentId: OTHER_TOURNAMENT,
      stageId: null,
    });
    expect(r?.id).toBe('tenant');
  });

  it('retombe sur le preset tenant pour un match sans tournoi (scrim)', () => {
    const r = resolvePreset(all, { tournamentId: null, stageId: null });
    expect(r?.id).toBe('tenant');
  });

  it('ignore les presets désactivés', () => {
    const r = resolvePreset(
      [{ ...stagePreset, enabled: false }, tournamentPreset],
      { tournamentId: TOURNAMENT, stageId: STAGE }
    );
    expect(r?.id).toBe('tournament');
  });

  it('ignore les presets d’un autre jeu', () => {
    const r = resolvePreset([{ ...tenantPreset, game: 'valorant' }], {
      game: 'overwatch',
      tournamentId: null,
      stageId: null,
    });
    expect(r).toBeNull();
  });

  it('un preset de phase ne fuit jamais sur une phase voisine sans repli', () => {
    const r = resolvePreset([stagePreset], {
      tournamentId: TOURNAMENT,
      stageId: OTHER_STAGE,
    });
    expect(r).toBeNull();
  });

  it('départage un doublon de périmètre par updated_at', () => {
    const older = row({ id: 'older', updated_at: '2026-01-01T00:00:00.000Z' });
    const newer = row({ id: 'newer', updated_at: '2026-06-01T00:00:00.000Z' });
    expect(resolvePreset([older, newer], {})?.id).toBe('newer');
    expect(resolvePreset([newer, older], {})?.id).toBe('newer');
  });

  it('renvoie null sur une liste vide', () => {
    expect(resolvePreset([], { tournamentId: TOURNAMENT })).toBeNull();
  });
});

describe('toResolvedPreset / formatPresetLines', () => {
  it('expose une forme camelCase avec map_pool normalisé', () => {
    const r = toResolvedPreset(
      row({ map_pool: ['Ilios', 'ilios', 7], description: 'Bo5 finale' })
    );
    expect(r).toMatchObject({
      importCode: 'ABC12',
      description: 'Bo5 finale',
      mapPool: ['Ilios'],
      scope: 'tenant',
    });
  });

  it('rend des lignes Discord contenant le code et les cartes', () => {
    const lines = formatPresetLines(
      toResolvedPreset(
        row({ name: 'OWWC Finale', map_pool: ['Ilios', 'Busan'] })
      )
    );
    const text = lines.join('\n');
    expect(text).toContain('OWWC Finale');
    expect(text).toContain('`ABC12`');
    expect(text).toContain('Ilios · Busan');
  });

  it('omet la ligne cartes quand le pool est vide', () => {
    const lines = formatPresetLines(toResolvedPreset(row()));
    expect(lines.join('\n')).not.toContain('🗺️');
  });
});
