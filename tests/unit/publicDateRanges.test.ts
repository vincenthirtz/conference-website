// Périodes de tournoi affichées sur le site public : lues en heure de Paris.
//
// Les pages sont rendues en ISR/SSR sur Netlify, en UTC. Les anciens
// formateurs mélangeaient deux fuseaux : la date de fin passait par
// `timeZone: 'Europe/Paris'`, mais le test « même mois » et le jour de début
// lisaient `getDate()` / `getMonth()` — le fuseau de la machine. Un tournoi
// commençant à 0 h 30 heure de Paris affichait donc la veille côté serveur,
// puis sautait au bon jour à l'hydratation.
//
// Les instants choisis ici tombent sur un autre jour à Paris qu'en UTC : le
// résultat attendu ne dépend pas du fuseau de la machine qui lance le test.

import { describe, it, expect, afterEach, vi } from 'vitest';

import { formatTournamentRange } from '@/components/Home/HomeUpcomingTournament';
import { formatTournamentDates } from '@/components/Tournaments/TournamentsList';

describe('formatTournamentRange (accueil)', () => {
  it('rend une période dans un même mois', () => {
    expect(formatTournamentRange('2026-09-18', '2026-09-20', 'fr-FR')).toBe(
      '18 – 20 septembre 2026'
    );
    expect(formatTournamentRange('2026-09-18', '2026-09-20', 'en-GB')).toBe(
      '18 – 20 September 2026'
    );
  });

  it('rend une période à cheval sur deux mois', () => {
    expect(formatTournamentRange('2026-09-30', '2026-10-04', 'fr-FR')).toBe(
      '30 septembre → 4 octobre 2026'
    );
  });

  it('lit le jour et le mois de début à Paris, pas en UTC', () => {
    // 30 sept. 22 h 30 UTC = 1er oct. 0 h 30 à Paris : même mois que la fin.
    expect(
      formatTournamentRange(
        '2026-09-30T22:30:00Z',
        '2026-10-04T10:00:00Z',
        'fr-FR'
      )
    ).toBe('1 – 4 octobre 2026');
  });

  it('rend une seule date quand début et fin tombent le même jour à Paris', () => {
    expect(
      formatTournamentRange(
        '2026-09-18T17:00:00Z',
        '2026-09-18T20:30:00Z',
        'fr-FR'
      )
    ).toBe('18 septembre 2026');
  });

  it('rend null sans date de début, ou avec une date illisible', () => {
    expect(formatTournamentRange(null, '2026-09-20', 'fr-FR')).toBeNull();
    expect(formatTournamentRange('pas une date', null, 'fr-FR')).toBeNull();
  });
});

describe('formatTournamentDates (liste des tournois)', () => {
  afterEach(() => vi.useRealTimers());

  it("n'affiche l'année que hors de l'année en cours, à Paris", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    // 31 déc. 23 h 30 UTC = 1er janv. 2027 à Paris : l'année s'affiche.
    expect(
      formatTournamentDates('2026-12-31T23:30:00Z', null, 'fr-FR', '')
    ).toBe('01 janv. 2027');
    expect(formatTournamentDates('2026-09-18', null, 'fr-FR', '')).toBe(
      '18 sept.'
    );
  });

  it('rend une période et le gabarit « jusqu’au »', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    expect(formatTournamentDates('2026-09-18', '2026-09-20', 'fr-FR', '')).toBe(
      '18 sept. - 20 sept.'
    );
    expect(
      formatTournamentDates(null, '2026-09-20', 'en-GB', 'until {date}')
    ).toBe('until 20 Sept');
  });
});
