// tests/unit/scrimConflictLabel.test.ts
//
// Mise en forme des conflits de créneau. `findScrimConflicts` renvoyait le
// détail (quel scrim, quand) et l'agenda l'écrasait sous un message générique.

import { describe, it, expect } from 'vitest';
import { summarizeConflicts } from '@/utils/teams/scrimConflictLabel';

const when = (iso: string) => `[${iso}]`;

describe('summarizeConflicts', () => {
  it('ne signale rien quand il n’y a pas de conflit', () => {
    expect(summarizeConflicts([], when, 'X')).toBeNull();
    expect(summarizeConflicts(null, when, 'X')).toBeNull();
    expect(summarizeConflicts(undefined, when, 'X')).toBeNull();
  });

  it('nomme le conflit et formate sa date', () => {
    const res = summarizeConflicts(
      [{ type: 'scrim', name: 'Phoenix vs Dragons', when: '2026-09-08T18:00:00Z' }],
      when,
      'Sans nom'
    );
    expect(res).toEqual({
      name: 'Phoenix vs Dragons',
      when: '[2026-09-08T18:00:00Z]',
      others: 0,
    });
  });

  it('nomme le PLUS PROCHE et compte les autres', () => {
    const res = summarizeConflicts(
      [
        { type: 'match', name: 'Tardif', when: '2026-09-08T22:00:00Z' },
        { type: 'scrim', name: 'Plus tôt', when: '2026-09-08T18:00:00Z' },
        { type: 'scrim', name: 'Entre deux', when: '2026-09-08T20:00:00Z' },
      ],
      when,
      'Sans nom'
    );
    expect(res?.name).toBe('Plus tôt');
    expect(res?.others).toBe(2);
  });

  it('retombe sur le libellé de repli quand l’élément n’a pas de nom', () => {
    // Un match n'a pas toujours de nom : mieux vaut « Match » que « null ».
    expect(
      summarizeConflicts(
        [{ type: 'match', name: null, when: '2026-09-08T18:00:00Z' }],
        when,
        'Match programmé'
      )?.name
    ).toBe('Match programmé');
    expect(
      summarizeConflicts(
        [{ type: 'match', name: '   ', when: '2026-09-08T18:00:00Z' }],
        when,
        'Match programmé'
      )?.name
    ).toBe('Match programmé');
  });

  it('ne masque pas une date illisible derrière un formatage', () => {
    const res = summarizeConflicts(
      [{ type: 'scrim', name: 'Bancal', when: 'pas-une-date' }],
      when,
      'Sans nom'
    );
    expect(res?.when).toBe('pas-une-date');
  });

  it('ne mute pas la liste reçue', () => {
    const input = [
      { type: 'scrim', name: 'B', when: '2026-09-08T22:00:00Z' },
      { type: 'scrim', name: 'A', when: '2026-09-08T18:00:00Z' },
    ];
    summarizeConflicts(input, when, 'X');
    expect(input[0].name).toBe('B');
  });
});
