import { describe, it, expect } from 'vitest';
import {
  POLE_KEYS,
  POLE_LABELS,
  isPoleKey,
} from '../../utils/associationPoles';

describe('associationPoles', () => {
  it('expose les 4 pôles attendus, dans l\'ordre', () => {
    expect(POLE_KEYS).toEqual([
      'direction',
      'tournoi',
      'production',
      'communaute',
    ]);
  });

  it('chaque clé a un label humain non vide', () => {
    for (const key of POLE_KEYS) {
      expect(POLE_LABELS[key]).toBeTruthy();
      expect(POLE_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  describe('isPoleKey', () => {
    it('valide les clés connues', () => {
      for (const key of POLE_KEYS) {
        expect(isPoleKey(key)).toBe(true);
      }
    });

    it('rejette les clés inconnues, types incorrects, et casing différent', () => {
      expect(isPoleKey('inexistant')).toBe(false);
      expect(isPoleKey('Direction')).toBe(false);
      expect(isPoleKey('')).toBe(false);
      expect(isPoleKey(null)).toBe(false);
      expect(isPoleKey(undefined)).toBe(false);
      expect(isPoleKey(42)).toBe(false);
      expect(isPoleKey({})).toBe(false);
    });
  });
});
