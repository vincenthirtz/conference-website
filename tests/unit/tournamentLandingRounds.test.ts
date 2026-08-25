// tests/unit/tournamentLandingRounds.test.ts
//
// Découpage saison régulière / phase finale de l'aperçu de déroulé
// (components/tournament/landing/BracketPreview). Le bug d'origine : une
// saison régulière s'affichait comme un winner bracket ; la règle « manches
// finales = dernières manches à un seul match » doit rester stable.

import { describe, it, expect } from 'vitest';
import { splitSeasonAndFinals } from '../../components/tournament/landing/BracketPreview';
import type { LandingRound } from '../../components/tournament/landing/types';

const round = (
  number: number,
  name: string,
  matchCount: number
): LandingRound => ({ number, name, matchCount, side: 'none' });

describe('splitSeasonAndFinals', () => {
  it('isole la petite et la grande finale d’un round robin', () => {
    const rounds = [
      ...Array.from({ length: 7 }, (_, i) => round(i + 1, `J${i + 1}`, 4)),
      round(8, 'Petite finale', 1),
      round(9, 'Grande finale', 1),
    ];

    const { season, finals } = splitSeasonAndFinals(rounds);

    expect(season.map((r) => r.name)).toEqual([
      'J1',
      'J2',
      'J3',
      'J4',
      'J5',
      'J6',
      'J7',
    ]);
    expect(finals.map((r) => r.name)).toEqual([
      'Petite finale',
      'Grande finale',
    ]);
  });

  it('ne coupe rien quand toutes les manches ont un seul match', () => {
    // Tournoi à deux équipes : sans manche « pleine » en amont, tout
    // requalifier en finales n'aurait aucun sens.
    const rounds = [round(1, 'J1', 1), round(2, 'J2', 1)];

    const { season, finals } = splitSeasonAndFinals(rounds);

    expect(season).toHaveLength(2);
    expect(finals).toHaveLength(0);
  });

  it('ne coupe rien quand la dernière manche compte plusieurs matchs', () => {
    const rounds = [round(1, 'J1', 4), round(2, 'J2', 4)];

    const { season, finals } = splitSeasonAndFinals(rounds);

    expect(season).toHaveLength(2);
    expect(finals).toHaveLength(0);
  });

  it('accepte une finale unique', () => {
    const rounds = [round(1, 'J1', 3), round(2, 'Finale', 1)];

    const { season, finals } = splitSeasonAndFinals(rounds);

    expect(season.map((r) => r.name)).toEqual(['J1']);
    expect(finals.map((r) => r.name)).toEqual(['Finale']);
  });

  it('gère un calendrier vide', () => {
    expect(splitSeasonAndFinals([])).toEqual({ season: [], finals: [] });
  });
});
