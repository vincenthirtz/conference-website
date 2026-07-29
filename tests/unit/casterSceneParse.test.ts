import { describe, expect, it } from 'vitest';

import {
  creditsToText,
  mapResultsToText,
  parseCommaList,
  parseCredits,
  parseMapResults,
} from '@/utils/caster/sceneParse';
import { loadHeroes, resolveHero } from '@/utils/caster/heroBans';

describe('parseMapResults', () => {
  it('parse « NomMap 3-2 » avec espaces dans le nom', () => {
    expect(parseMapResults("King's Row 3-2\nLijiang Tower 0 - 1")).toEqual([
      { map: "King's Row", score1: 3, score2: 2 },
      { map: 'Lijiang Tower', score1: 0, score2: 1 },
    ]);
  });

  it('ignore les lignes vides et hors format', () => {
    expect(parseMapResults('\nIlios\n  \nIlios 1-0\n')).toEqual([
      { map: 'Ilios', score1: 1, score2: 0 },
    ]);
    expect(parseMapResults('')).toEqual([]);
  });
});

describe('mapResultsToText', () => {
  it('inverse de parseMapResults (aller-retour stable)', () => {
    const text = "Ilios 1-0\nKing's Row 2-3";
    expect(mapResultsToText(parseMapResults(text))).toBe(text);
    expect(mapResultsToText(null)).toBe('');
    expect(mapResultsToText([{ map: 'Oasis' }])).toBe('Oasis 0-0');
  });
});

describe('parseCredits', () => {
  it('découpe au premier deux-points seulement', () => {
    expect(parseCredits('Production: Women’s Cup\nURL: https://x')).toEqual([
      { label: 'Production', value: 'Women’s Cup' },
      { label: 'URL', value: 'https://x' },
    ]);
  });

  it('ligne sans deux-points → label vide', () => {
    expect(parseCredits('Merci à toutes !')).toEqual([
      { label: '', value: 'Merci à toutes !' },
    ]);
    expect(parseCredits('')).toEqual([]);
  });
});

describe('creditsToText', () => {
  it('inverse de parseCredits', () => {
    expect(
      creditsToText([
        { label: 'Production', value: 'WC' },
        { label: '', value: 'test' },
      ])
    ).toBe('Production: WC\n: test');
    expect(creditsToText(undefined)).toBe('');
  });
});

describe('parseCommaList', () => {
  it('découpe et trim', () => {
    expect(parseCommaList(' A , B ,,C ')).toEqual(['A', 'B', 'C']);
    expect(parseCommaList('')).toEqual([]);
  });
});

describe('resolveHero', () => {
  const list = [
    { key: 'ana', name: 'Ana', portrait: 'https://cdn/ana.png' },
    { key: 'mercy', name: 'Ange', portrait: '' },
  ];

  it('résout une clé connue en objet complet', () => {
    expect(resolveHero(list, 'ana', null)).toEqual({
      key: 'ana',
      name: 'Ana',
      portrait: 'https://cdn/ana.png',
    });
  });

  it('liste pas chargée (null) → préserve le fallback', () => {
    const prev = { key: 'ana', name: 'Ana', portrait: 'p' };
    expect(resolveHero(null, '', prev)).toEqual(prev);
    expect(resolveHero(null, '', null)).toBeNull();
  });

  it('clé vide → null ; clé inconnue égale au ban précédent → préservé', () => {
    const prev = { key: 'retired', name: 'Retirée', portrait: '' };
    expect(resolveHero(list, '', prev)).toBeNull();
    expect(resolveHero(list, 'retired', prev)).toEqual(prev);
    expect(resolveHero(list, 'unknown', null)).toBeNull();
  });
});

describe('loadHeroes', () => {
  it('filtre les entrées invalides', () => {
    expect(
      loadHeroes([
        { key: 'ana', name: 'Ana' },
        { key: 42, name: 'Bad' },
        null,
        'x',
      ])
    ).toEqual([{ key: 'ana', name: 'Ana' }]);
    expect(loadHeroes(null)).toEqual([]);
    expect(loadHeroes({})).toEqual([]);
  });
});
