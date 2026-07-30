import { describe, expect, it } from 'vitest';

import {
  formatPresenceState,
  othersBySceneId,
  othersOnScene,
  presenceColor,
  presenceInitials,
} from '@/utils/caster/presence';
import type { CasterPresenceUser } from '@/types/caster';

function user(over: Partial<CasterPresenceUser> = {}): CasterPresenceUser {
  return {
    staffId: 's1',
    displayName: 'Perceval',
    role: 'caster',
    activeScene: null,
    activeField: null,
    joinedAt: '2026-07-30T10:00:00.000Z',
    ...over,
  };
}

describe('formatPresenceState', () => {
  it('aplatit l’état Supabase en une entrée par clé (la 1re présence gagne)', () => {
    const users = formatPresenceState({
      's-1': [
        {
          staffId: 's-1',
          displayName: 'Perceval',
          role: 'caster',
          activeScene: 'scene-a',
          activeField: 'ed-team1',
          joinedAt: '2026-07-30T10:00:00.000Z',
        },
        // Seconde fenêtre du même caster : ignorée.
        { staffId: 's-1', displayName: 'Perceval (2)', joinedAt: 'z' },
      ],
    });
    expect(users).toEqual([
      {
        staffId: 's-1',
        displayName: 'Perceval',
        role: 'caster',
        activeScene: 'scene-a',
        activeField: 'ed-team1',
        joinedAt: '2026-07-30T10:00:00.000Z',
      },
    ]);
  });

  it('tolère un payload partiel (repli sur la clé de présence)', () => {
    expect(formatPresenceState({ 's-2': [{}] })).toEqual([
      {
        staffId: 's-2',
        displayName: 's-2',
        role: '',
        activeScene: null,
        activeField: null,
        joinedAt: '',
      },
    ]);
  });

  it('ignore les clés vides et gère un état absent', () => {
    expect(formatPresenceState({ 's-3': [] })).toEqual([]);
    expect(formatPresenceState(null)).toEqual([]);
    expect(formatPresenceState(undefined)).toEqual([]);
  });

  it('ordre stable : arrivée puis nom', () => {
    const users = formatPresenceState({
      b: [{ displayName: 'Bohort', joinedAt: '2026-07-30T10:05:00.000Z' }],
      a: [{ displayName: 'Arthur', joinedAt: '2026-07-30T10:00:00.000Z' }],
      c: [{ displayName: 'Caius', joinedAt: '2026-07-30T10:05:00.000Z' }],
    });
    expect(users.map((u) => u.displayName)).toEqual([
      'Arthur',
      'Bohort',
      'Caius',
    ]);
  });
});

describe('presenceInitials', () => {
  it('2 lettres max, en capitales', () => {
    expect(presenceInitials('Perceval de Galles')).toBe('PD');
    expect(presenceInitials('arthur')).toBe('A');
    expect(presenceInitials('  jean  michel  ')).toBe('JM');
  });

  it('repli ? sur vide', () => {
    expect(presenceInitials('')).toBe('?');
    expect(presenceInitials(null)).toBe('?');
  });
});

describe('presenceColor', () => {
  it('couleur HSL stable par graine', () => {
    expect(presenceColor('Perceval')).toBe(presenceColor('Perceval'));
    expect(presenceColor('Perceval')).toMatch(/^hsl\(\d+, 48%, 40%\)$/);
  });

  it('graines différentes → teintes différentes', () => {
    expect(presenceColor('Perceval')).not.toBe(presenceColor('Karadoc'));
  });

  it('graine vide acceptée', () => {
    expect(presenceColor(null)).toMatch(/^hsl\(/);
  });
});

describe('othersOnScene', () => {
  const users = [
    user({ staffId: 'me', activeScene: 'scene-a' }),
    user({ staffId: 'other1', displayName: 'Karadoc', activeScene: 'scene-a' }),
    user({ staffId: 'other2', displayName: 'Bohort', activeScene: 'scene-b' }),
  ];

  it('exclut self et les autres scènes', () => {
    expect(othersOnScene(users, 'scene-a', 'me').map((u) => u.staffId)).toEqual(
      ['other1']
    );
  });

  it('scène sans id → aucun autre', () => {
    expect(othersOnScene(users, null, 'me')).toEqual([]);
  });
});

describe('othersBySceneId', () => {
  it('indexe les autres casters par scène ouverte', () => {
    const index = othersBySceneId(
      [
        user({ staffId: 'me', activeScene: 'scene-a' }),
        user({ staffId: 'o1', displayName: 'Karadoc', activeScene: 'scene-a' }),
        user({ staffId: 'o2', displayName: 'Bohort', activeScene: 'scene-a' }),
        user({ staffId: 'o3', displayName: 'Arthur', activeScene: null }),
      ],
      'me'
    );
    expect(Object.keys(index)).toEqual(['scene-a']);
    expect(index['scene-a'].map((u) => u.displayName)).toEqual([
      'Karadoc',
      'Bohort',
    ]);
  });
});
