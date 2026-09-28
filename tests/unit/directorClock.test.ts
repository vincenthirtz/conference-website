// utils/director/clock.ts — l'heure HH:MM des écrans du director.

import { describe, it, expect } from 'vitest';
import { clockHHMM, clockOrDash } from '../../utils/director/clock';

// Instant construit en heure LOCALE : le test ne dépend pas du fuseau de la
// machine qui l'exécute.
const at = (h: number, m: number) => new Date(2026, 8, 28, h, m).toISOString();

describe('clockHHMM', () => {
  it('rend HH:MM sur 24 h, avec zéros', () => {
    expect(clockHHMM(at(18, 5))).toBe('18:05');
    expect(clockHHMM(at(0, 0))).toBe('00:00');
  });

  it('rend null pour une valeur absente ou illisible', () => {
    expect(clockHHMM(null)).toBeNull();
    expect(clockHHMM(undefined)).toBeNull();
    expect(clockHHMM('pas une date')).toBeNull();
  });
});

describe('clockOrDash', () => {
  it('tiret quand il n’y a rien', () => {
    expect(clockOrDash(null)).toBe('—');
    expect(clockOrDash(at(9, 30))).toBe('09:30');
  });
});
