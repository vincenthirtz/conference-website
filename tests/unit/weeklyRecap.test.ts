// Unit tests — récap hebdomadaire d'équipe (N7), cœur pur.
//
// Un canal de notification se perd en une semaine et se regagne en six mois.
// L'essentiel de ces tests porte donc sur le SILENCE :
//
//   - rien quand la semaine est vide ;
//   - et surtout : les constats CHRONIQUES (comptes non liés, créneau
//     inexploité, débriefs en retard) n'ouvrent JAMAIS un récap. Les traiter
//     comme un motif d'envoi ferait partir le même message toutes les semaines
//     à une équipe dormante — c'est-à-dire du spam.
//
// Le résumé est testé sur la même exigence : on n'écrit que ce qu'on sait.

import { describe, it, expect } from 'vitest';

import {
  buildWeeklyRecap,
  hasWeeklyActivity,
  renderRecapSummary,
  type WeeklyRecapFacts,
} from '../../utils/teams/weeklyRecap';

/** Semaine sans rien : la base dont on dévie cas par cas. */
function quiet(over: Partial<WeeklyRecapFacts> = {}): WeeklyRecapFacts {
  return {
    encounters: [],
    ratingDelta: null,
    ratedPlayers: 0,
    pendingProposals: 0,
    unusedCoreSlots: 0,
    unreviewedEncounters: 0,
    identityGaps: 0,
    ...over,
  };
}

const win = (opponentName: string | null = 'Bravo') =>
  ({ subjectType: 'match', opponentName, result: 'win' }) as const;
const loss = (opponentName: string | null = 'Charlie') =>
  ({ subjectType: 'scrim', opponentName, result: 'loss' }) as const;

describe('silence', () => {
  it('ne produit rien pour une semaine vide', () => {
    expect(buildWeeklyRecap(quiet())).toBeNull();
  });

  it('ne se déclenche PAS sur des constats chroniques seuls', () => {
    // Le test qui protège le canal : sans cette règle, une équipe dormante
    // recevrait le même message chaque semaine, indéfiniment.
    const chronic = quiet({
      unusedCoreSlots: 3,
      unreviewedEncounters: 7,
      identityGaps: 4,
    });
    expect(hasWeeklyActivity(chronic)).toBe(false);
    expect(buildWeeklyRecap(chronic)).toBeNull();
  });

  it('se déclenche sur un affrontement joué', () => {
    expect(buildWeeklyRecap(quiet({ encounters: [win()] }))).not.toBeNull();
  });

  it('se déclenche sur une proposition en attente', () => {
    expect(buildWeeklyRecap(quiet({ pendingProposals: 1 }))).not.toBeNull();
  });

  it('se déclenche sur une variation de niveau, même nulle', () => {
    // `ratingDelta: 0` signifie « on a mesuré, ça n'a pas bougé » — c'est une
    // information. `null` signifie « on n'a rien mesuré » — ce n'en est pas une.
    expect(
      buildWeeklyRecap(quiet({ ratingDelta: 0, ratedPlayers: 3 }))
    ).not.toBeNull();
    expect(buildWeeklyRecap(quiet({ ratingDelta: null }))).toBeNull();
  });
});

describe('bilan', () => {
  it('compte les issues et déduplique les adversaires', () => {
    const recap = buildWeeklyRecap(
      quiet({
        encounters: [
          win('Bravo'),
          loss('Charlie'),
          win('Bravo'),
          { subjectType: 'match', opponentName: 'Delta', result: 'draw' },
        ],
      })
    );
    expect(recap).toMatchObject({
      played: 4,
      wins: 2,
      losses: 1,
      draws: 1,
      opponents: ['Bravo', 'Charlie', 'Delta'],
    });
  });

  it('n’invente pas d’adversaire quand le nom manque', () => {
    const recap = buildWeeklyRecap(quiet({ encounters: [win(null)] }));
    expect(recap?.opponents).toEqual([]);
    expect(recap?.played).toBe(1);
  });

  it('compte un affrontement sans issue connue sans le classer', () => {
    const recap = buildWeeklyRecap(
      quiet({
        encounters: [{ subjectType: 'scrim', opponentName: 'X', result: null }],
      })
    );
    expect(recap?.played).toBe(1);
    expect(recap?.wins).toBe(0);
    expect(recap?.losses).toBe(0);
    expect(recap?.draws).toBe(0);
  });

  it('reporte les constats chroniques une fois le récap ouvert', () => {
    const recap = buildWeeklyRecap(
      quiet({
        encounters: [win()],
        unusedCoreSlots: 2,
        unreviewedEncounters: 5,
        identityGaps: 1,
      })
    );
    expect(recap).toMatchObject({
      unusedCoreSlots: 2,
      unreviewedEncounters: 5,
      identityGaps: 1,
    });
  });
});

describe('renderRecapSummary', () => {
  it('n’écrit que ce qu’on sait', () => {
    const recap = buildWeeklyRecap(quiet({ encounters: [win(), loss()] }))!;
    const summary = renderRecapSummary(recap);
    expect(summary).toBe('2 affrontements (1 V · 1 D)');
    // Rien sur le niveau : personne n'a été noté.
    expect(summary).not.toMatch(/niveau/);
  });

  it('accorde le singulier', () => {
    const recap = buildWeeklyRecap(quiet({ encounters: [win()] }))!;
    expect(renderRecapSummary(recap)).toBe('1 affrontement (1 V)');
  });

  it('signe la variation de niveau et tait le zéro', () => {
    const up = buildWeeklyRecap(
      quiet({ encounters: [win()], ratingDelta: 12, ratedPlayers: 3 })
    )!;
    expect(renderRecapSummary(up)).toMatch(/niveau \+12/);

    const down = buildWeeklyRecap(
      quiet({ encounters: [loss()], ratingDelta: -8, ratedPlayers: 3 })
    )!;
    expect(renderRecapSummary(down)).toMatch(/niveau -8/);

    // Mesuré mais immobile : le dire n'apporte rien à une phrase courte.
    const flat = buildWeeklyRecap(
      quiet({ encounters: [win()], ratingDelta: 0, ratedPlayers: 3 })
    )!;
    expect(renderRecapSummary(flat)).not.toMatch(/niveau/);
  });

  it('énumère ce qui appelle une action', () => {
    const recap = buildWeeklyRecap(
      quiet({
        encounters: [win()],
        pendingProposals: 2,
        unusedCoreSlots: 1,
        unreviewedEncounters: 3,
        identityGaps: 1,
      })
    )!;
    const summary = renderRecapSummary(recap);
    expect(summary).toContain('2 propositions en attente');
    expect(summary).toContain('1 créneau libre inexploité');
    expect(summary).toContain('3 affrontements à débriefer');
    expect(summary).toContain('1 profil incomplet');
  });

  it('ne parle pas de bilan quand rien n’a été joué', () => {
    const recap = buildWeeklyRecap(quiet({ pendingProposals: 1 }))!;
    expect(renderRecapSummary(recap)).toBe('1 proposition en attente');
  });
});
