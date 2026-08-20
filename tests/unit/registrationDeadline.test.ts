// Compte à rebours de la date butoir des inscriptions (tournoi 2026).
//
// Ce qui est en jeu : un rappel qui reste affiché après la date décrédibilise
// tous les suivants, et un rappel qui disparaît trop tôt fait rater le
// tournoi. Les deux dépendent d'un seul calcul — des jours CALENDAIRES lus à
// Paris — dont voici les bornes.
//
// Cible : utils/registrationDeadline.ts

import { describe, it, expect } from 'vitest';

import {
  getRegistrationDeadlineState,
  formatRegistrationDeadline,
  TOURNAMENT_2026_REGISTRATION_DEADLINE,
} from '../../utils/registrationDeadline';

/** Un instant UTC, écrit lisiblement. */
const at = (iso: string) => new Date(iso);

describe('getRegistrationDeadlineState', () => {
  it('compte les jours restants avant la date butoir', () => {
    const s = getRegistrationDeadlineState(at('2026-08-20T12:00:00Z'));
    expect(s).toMatchObject({
      daysLeft: 11,
      isPast: false,
      isLastDay: false,
      isUrgent: false,
    });
  });

  it('bascule en urgence à J-7', () => {
    // J-8 : encore le ton « note ».
    expect(
      getRegistrationDeadlineState(at('2026-08-23T12:00:00Z'))
    ).toMatchObject({ daysLeft: 8, isUrgent: false });
    expect(
      getRegistrationDeadlineState(at('2026-08-24T12:00:00Z'))
    ).toMatchObject({ daysLeft: 7, isUrgent: true });
  });

  it('le jour même : dernier jour, pas encore passé', () => {
    const s = getRegistrationDeadlineState(at('2026-08-31T09:00:00Z'));
    expect(s).toMatchObject({ daysLeft: 0, isLastDay: true, isPast: false });
  });

  it('le 31 à 23 h 59 heure de Paris, on est ENCORE dans les temps', () => {
    // 21:59 UTC = 23:59 à Paris (CEST). C'est la borne qui décide si
    // quelqu'un peut encore s'inscrire ce soir-là.
    const s = getRegistrationDeadlineState(at('2026-08-31T21:59:00Z'));
    expect(s.isPast).toBe(false);
    expect(s.isLastDay).toBe(true);
  });

  it('le 1er septembre à 00 h 01 heure de Paris, c’est fini', () => {
    // 22:01 UTC le 31 = 00:01 le 1er septembre à Paris. Lu en UTC, on serait
    // encore le 31 — c'est exactement l'erreur que le fuseau forcé évite.
    const s = getRegistrationDeadlineState(at('2026-08-31T22:01:00Z'));
    expect(s).toMatchObject({ isPast: true, isUrgent: false });
    expect(s.daysLeft).toBeLessThan(0);
  });

  it('reste juste après la date butoir (le rappel doit disparaître)', () => {
    expect(
      getRegistrationDeadlineState(at('2026-09-01T12:00:00Z')).isPast
    ).toBe(true);
    expect(
      getRegistrationDeadlineState(at('2027-01-01T12:00:00Z')).isPast
    ).toBe(true);
  });

  it('traverse un changement d’heure sans décaler d’un jour', () => {
    // Échéance d'automne : le 25 octobre 2026, Paris repasse en heure d'hiver
    // et la journée fait 25 h. Un calcul en millisecondes / 86 400 000
    // renverrait 30,04 jours ici et se tromperait d'un jour à l'arrondi.
    const s = getRegistrationDeadlineState(
      at('2026-10-15T12:00:00Z'),
      '2026-11-14'
    );
    expect(s.daysLeft).toBe(30);
  });

  it('une date butoir illisible se comporte comme passée, jamais comme NaN', () => {
    const s = getRegistrationDeadlineState(
      at('2026-08-20T12:00:00Z'),
      'plus tard'
    );
    expect(s).toMatchObject({ isPast: true, daysLeft: 0 });
    expect(Number.isNaN(s.daysLeft)).toBe(false);
  });
});

describe('formatRegistrationDeadline', () => {
  it('rend la date dans la langue de l’interface', () => {
    expect(formatRegistrationDeadline('fr-FR')).toBe('31 août 2026');
    expect(formatRegistrationDeadline('en-GB')).toBe('31 August 2026');
  });

  it('ne dérive PAS d’un jour selon le fuseau du navigateur', () => {
    // La constante est une date murale ; formatée sans fuseau forcé, minuit
    // UTC se lirait « 30 août » à Los Angeles.
    expect(
      formatRegistrationDeadline('fr-FR', TOURNAMENT_2026_REGISTRATION_DEADLINE)
    ).toContain('31');
  });
});
