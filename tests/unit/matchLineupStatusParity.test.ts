// Parité : chaque statut de `MatchStatus` est classé ouvert ou fermé pour la
// feuille de match.
//
// Le bug qui fonde ce test : la liste des statuts fermés citait `completed` et
// `forfeit` (inexistants) et oubliait `finished` et `walkover`. Une équipe
// pouvait réécrire qui avait joué APRÈS le résultat, alors que la feuille
// pilote l'attribution de rating.
//
// Le typecheck couvre déjà l'exhaustivité (`satisfies Record<MatchStatus, …>`),
// mais la suite unitaire ne type-checke pas : on relit donc l'union dans
// types/admin.ts pour échouer ICI aussi quand un statut y apparaît.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MATCH_STATUS_LINEUP_PHASE,
  isLineupClosedStatus,
  lineupOpenState,
} from '@/utils/matches/lineup';

function matchStatusUnion(): string[] {
  const src = readFileSync(
    path.resolve(__dirname, '../../types/admin.ts'),
    'utf8'
  );
  const m = /export type MatchStatus\s*=([^;]+);/.exec(src);
  if (!m) throw new Error('MatchStatus introuvable dans types/admin.ts');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
}

describe('feuille de match — classement des statuts', () => {
  it('classe TOUS les statuts de MatchStatus, et seulement eux', () => {
    const union = matchStatusUnion();
    expect(union.length).toBeGreaterThan(0);
    expect(Object.keys(MATCH_STATUS_LINEUP_PHASE).sort()).toEqual(union);
  });

  it('ferme la feuille sur un match fini, forfait, annulé ou en litige', () => {
    for (const status of ['finished', 'walkover', 'cancelled', 'disputed']) {
      expect(isLineupClosedStatus(status)).toBe(true);
    }
  });

  it('la laisse ouverte avant et pendant le match, et sur un report', () => {
    for (const status of ['pending', 'ongoing', 'postponed']) {
      expect(isLineupClosedStatus(status)).toBe(false);
    }
  });

  it('refuse la réécriture après un résultat, même check-in fait', () => {
    for (const status of ['finished', 'walkover']) {
      expect(
        lineupOpenState(
          {
            id: 'm',
            status,
            team1_id: 'A',
            team2_id: 'B',
            team1_checked_in_at: '2026-09-18T16:30:00Z',
          },
          'A'
        )
      ).toMatchObject({ open: false, reason: 'match_over' });
    }
  });

  it('tolère la casse et les espaces', () => {
    expect(isLineupClosedStatus(' Finished ')).toBe(true);
    expect(isLineupClosedStatus(null)).toBe(false);
  });
});
