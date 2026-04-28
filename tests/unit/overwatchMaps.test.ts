import { describe, it, expect } from 'vitest';
import { OVERWATCH_MAPS } from '../../config/overwatch-maps';

describe('OVERWATCH_MAPS config', () => {
  it('contient au moins 20 maps', () => {
    expect(OVERWATCH_MAPS.length).toBeGreaterThanOrEqual(20);
  });

  it('chaque map a un nom, type et image', () => {
    for (const map of OVERWATCH_MAPS) {
      expect(map.name).toBeTruthy();
      expect(map.type).toBeTruthy();
      expect(map.image).toBeTruthy();
    }
  });

  it('les noms de maps sont uniques', () => {
    const names = OVERWATCH_MAPS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('tous les types sont valides', () => {
    const validTypes = ['control', 'escort', 'hybrid', 'push', 'flashpoint'];
    for (const map of OVERWATCH_MAPS) {
      expect(validTypes).toContain(map.type);
    }
  });

  it('contient les 5 types de maps', () => {
    const types = new Set(OVERWATCH_MAPS.map((m) => m.type));
    expect(types.has('control')).toBe(true);
    expect(types.has('escort')).toBe(true);
    expect(types.has('hybrid')).toBe(true);
    expect(types.has('push')).toBe(true);
    expect(types.has('flashpoint')).toBe(true);
  });

  it("les URLs d'images utilisent le CDN attendu", () => {
    const cdnPrefix = 'https://overfast-api.tekrop.fr/static/maps';
    for (const map of OVERWATCH_MAPS) {
      expect(map.image).toContain(cdnPrefix);
    }
  });

  it('les images se terminent par .jpg', () => {
    for (const map of OVERWATCH_MAPS) {
      expect(map.image).toMatch(/\.jpg$/);
    }
  });

  it('contient des maps connues', () => {
    const names = OVERWATCH_MAPS.map((m) => m.name);
    expect(names).toContain('Busan');
    expect(names).toContain("King's Row");
    expect(names).toContain('Dorado');
    expect(names).toContain('Colosseo');
  });
});
