import { describe, it, expect, vi } from 'vitest';

// supabaseAdmin is referenced at module load time; stub it so importing
// the module under test doesn't require a real client.
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: {},
}));

import {
  slugify,
  MAX_NAME,
  MAX_SHORT_NAME,
  MAX_COUNTRY,
  MAX_BATTLE_TAG,
  MAX_ROWS,
} from '../../utils/teamImport';

describe('slugify', () => {
  it('lowercases plain ascii', () => {
    expect(slugify('Team Alpha')).toBe('team-alpha');
  });

  it('strips French accents', () => {
    expect(slugify('Équipe Élite')).toBe('equipe-elite');
    expect(slugify('Châteauçà')).toBe('chateauca');
  });

  it('collapses runs of non-alphanumerics into a single dash', () => {
    expect(slugify('A!!!  B___C')).toBe('a-b-c');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
    expect(slugify('!!! Boom !!!')).toBe('boom');
  });

  it('returns empty string for input with no alphanumerics', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('handles emojis and unicode by stripping them', () => {
    expect(slugify('Team 🚀 Rocket')).toBe('team-rocket');
  });

  it('preserves digits', () => {
    expect(slugify('Team 2026')).toBe('team-2026');
  });

  it('combines multiple transformations', () => {
    expect(slugify('  Équipe ÉLITE — n°1!  ')).toBe('equipe-elite-n-1');
  });
});

describe('teamImport constants', () => {
  it('exposes the documented length limits', () => {
    expect(MAX_NAME).toBe(100);
    expect(MAX_SHORT_NAME).toBe(20);
    expect(MAX_COUNTRY).toBe(10);
    expect(MAX_BATTLE_TAG).toBe(50);
  });

  it('caps imports at 200 rows per batch', () => {
    expect(MAX_ROWS).toBe(200);
  });
});
