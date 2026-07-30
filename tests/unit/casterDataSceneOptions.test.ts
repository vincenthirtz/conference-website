// Logique pure des pickers des scènes « données du site » du cockpit caster
// (lot 6) : bornage du topN, libellés d'options et résolution de la sélection.
// Les valeurs attendues sont celles des éditeurs desktop
// (womenscup-caster/src/renderer/{bracket,player,leaderboard,standings}Editor.js)
// — ce spec est le garde-fou de l'interop des deux cockpits.

import { describe, it, expect } from 'vitest';

import {
  TOP_N_DEFAULT,
  TOP_N_MAX,
  TOP_N_MIN,
  clampTopN,
  isUuid,
  labelWithStatus,
  memorizedNameFix,
  playerDisplayName,
  playerOptionLabel,
  resolvePickerSelection,
  type PickerOption,
} from '@/utils/caster/dataSceneOptions';

describe('clampTopN', () => {
  it('garde une valeur dans les bornes', () => {
    expect(clampTopN(3)).toBe(3);
    expect(clampTopN(10)).toBe(10);
    expect(clampTopN(20)).toBe(20);
  });

  it('borne en dessous de 3 et au-dessus de 20', () => {
    expect(clampTopN(1)).toBe(TOP_N_MIN);
    expect(clampTopN(-5)).toBe(TOP_N_MIN);
    expect(clampTopN(42)).toBe(TOP_N_MAX);
    expect(clampTopN(1000)).toBe(TOP_N_MAX);
  });

  it('replie sur 10 toute saisie non exploitable (parité desktop)', () => {
    expect(clampTopN('')).toBe(TOP_N_DEFAULT);
    expect(clampTopN('abc')).toBe(TOP_N_DEFAULT);
    expect(clampTopN(0)).toBe(TOP_N_DEFAULT);
    expect(clampTopN(null)).toBe(TOP_N_DEFAULT);
    expect(clampTopN(undefined)).toBe(TOP_N_DEFAULT);
    expect(clampTopN(NaN)).toBe(TOP_N_DEFAULT);
  });

  it('accepte les chaînes numériques du champ number et tronque', () => {
    expect(clampTopN('15')).toBe(15);
    expect(clampTopN('15px')).toBe(15);
    expect(clampTopN(7.9)).toBe(7);
    // parseInt('2.7') = 2, puis borné à 3.
    expect(clampTopN('2.7')).toBe(TOP_N_MIN);
  });
});

describe('labelWithStatus', () => {
  it('suffixe le statut entre crochets quand il existe', () => {
    expect(labelWithStatus('Summer Cup', 'running')).toBe(
      'Summer Cup [running]'
    );
  });

  it('renvoie le nom nu sans statut', () => {
    expect(labelWithStatus('Summer Cup', null)).toBe('Summer Cup');
    expect(labelWithStatus('Summer Cup')).toBe('Summer Cup');
    expect(labelWithStatus('  Summer Cup  ')).toBe('Summer Cup');
    expect(labelWithStatus(null, 'running')).toBe(' [running]');
  });
});

describe('playerDisplayName / playerOptionLabel', () => {
  it('préfère displayName, puis battleTag, puis le repli', () => {
    expect(playerDisplayName({ displayName: 'Kiriko' }, 'Joueuse')).toBe(
      'Kiriko'
    );
    expect(
      playerDisplayName({ displayName: '', battleTag: 'Kiri#2100' }, 'Joueuse')
    ).toBe('Kiri#2100');
    expect(playerDisplayName({}, 'Joueuse')).toBe('Joueuse');
  });

  it('ajoute rang et rating arrondi entre parenthèses', () => {
    expect(
      playerOptionLabel(
        { displayName: 'Kiriko', rank: 3, rating: 1842.4 },
        'Joueuse'
      )
    ).toBe('Kiriko (#3 · 1842)');
    expect(playerOptionLabel({ displayName: 'Kiriko', rank: 1 }, 'J')).toBe(
      'Kiriko (#1)'
    );
    expect(playerOptionLabel({ displayName: 'Kiriko' }, 'J')).toBe('Kiriko');
  });

  it('gère un rang 0 (valeur falsy mais significative)', () => {
    expect(
      playerOptionLabel({ displayName: 'K', rank: 0, rating: 0 }, 'J')
    ).toBe('K (#0 · 0)');
  });
});

describe('resolvePickerSelection', () => {
  const options: PickerOption[] = [
    {
      value: 'tid-1',
      label: 'Summer Cup [running]',
      name: 'Summer Cup',
      aliases: ['summer-cup'],
    },
    { value: 'tid-2', label: 'Winter Cup', name: 'Winter Cup' },
  ];

  it('aucune sélection → valeur vide, pas de fantôme', () => {
    expect(resolvePickerSelection(options, null)).toEqual({
      value: '',
      ghost: null,
    });
    expect(resolvePickerSelection(options, '')).toEqual({
      value: '',
      ghost: null,
    });
  });

  it('résout par valeur', () => {
    expect(resolvePickerSelection(options, 'tid-2')).toEqual({
      value: 'tid-2',
      ghost: null,
    });
  });

  it("résout un alias (slug persisté par le desktop) vers l'id de la ligne", () => {
    expect(resolvePickerSelection(options, 'summer-cup')).toEqual({
      value: 'tid-1',
      ghost: null,
    });
  });

  it('sélection absente de la liste → option fantôme libellée du nom mémorisé', () => {
    expect(
      resolvePickerSelection(options, 'tid-archive', 'Archive Cup 2024')
    ).toEqual({
      value: 'tid-archive',
      ghost: {
        value: 'tid-archive',
        label: 'Archive Cup 2024',
        name: 'Archive Cup 2024',
      },
    });
  });

  it('fantôme sans nom mémorisé → libellé = la référence brute', () => {
    expect(resolvePickerSelection(options, 'tid-archive')).toEqual({
      value: 'tid-archive',
      ghost: { value: 'tid-archive', label: 'tid-archive', name: '' },
    });
  });

  it('liste vide (API en erreur) : la sélection survit en fantôme', () => {
    expect(resolvePickerSelection([], 'tid-1', 'Summer Cup')).toEqual({
      value: 'tid-1',
      ghost: { value: 'tid-1', label: 'Summer Cup', name: 'Summer Cup' },
    });
  });
});

describe('isUuid', () => {
  it('accepte un UUID (contrat de /api/public/v1/players/:userId)', () => {
    expect(isUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isUuid('123E4567-E89B-42D3-A456-426614174000')).toBe(true);
  });

  it('refuse un pseudo, un BattleTag ou une valeur vide', () => {
    expect(isUuid('Kiriko')).toBe(false);
    expect(isUuid('Kiri#2100')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid('123e4567-e89b-42d3-a456')).toBe(false);
  });
});

describe('memorizedNameFix', () => {
  const options: PickerOption[] = [
    {
      value: 'tid-1',
      label: 'Summer Cup [running]',
      name: 'Summer Cup',
      aliases: ['summer-cup'],
    },
  ];

  it('nom mémorisé vide → à ré-écrire (sous-titre des overlays)', () => {
    expect(memorizedNameFix(options, 'tid-1', '')).toBe('Summer Cup');
    expect(memorizedNameFix(options, 'tid-1', null)).toBe('Summer Cup');
  });

  it('nom périmé (tournoi renommé côté admin) → à ré-écrire', () => {
    expect(memorizedNameFix(options, 'tid-1', 'Ancien nom')).toBe('Summer Cup');
  });

  it('résout aussi par alias (slug)', () => {
    expect(memorizedNameFix(options, 'summer-cup', '')).toBe('Summer Cup');
  });

  it('rien à faire : nom à jour, liste non chargée, hors liste, sans sélection', () => {
    expect(memorizedNameFix(options, 'tid-1', 'Summer Cup')).toBeNull();
    expect(memorizedNameFix(options, 'tid-1', '  Summer Cup ')).toBeNull();
    expect(memorizedNameFix(null, 'tid-1', '')).toBeNull();
    expect(memorizedNameFix(options, 'tid-archive', 'Archive')).toBeNull();
    expect(memorizedNameFix(options, null, '')).toBeNull();
  });
});
