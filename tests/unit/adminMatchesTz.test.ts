import { describe, it, expect } from 'vitest';
import {
  csvDateToIso,
  dayRangeToIsoBounds,
  DEFAULT_TOURNAMENT_TZ,
  formatDayLabel,
  formatMatchDateTime,
  formatMatchTime,
  groupMatchesByTzDay,
  isoToTzInput,
  resolveTournamentTz,
  tzInputToIso,
} from '../../utils/matches/adminMatchesTz';

// Tous les attendus sont indépendants du fuseau de la machine qui lance les
// tests : c'est précisément la propriété que le module doit garantir.

const PARIS = 'Europe/Paris';
const NY = 'America/New_York';

describe('resolveTournamentTz', () => {
  it('garde un fuseau IANA valide', () => {
    expect(resolveTournamentTz(NY)).toBe(NY);
  });
  it('replie sur Europe/Paris si absent ou invalide', () => {
    expect(resolveTournamentTz(null)).toBe(DEFAULT_TOURNAMENT_TZ);
    expect(resolveTournamentTz(undefined)).toBe(DEFAULT_TOURNAMENT_TZ);
    expect(resolveTournamentTz('')).toBe(DEFAULT_TOURNAMENT_TZ);
    expect(resolveTournamentTz('Mars/Olympus')).toBe(DEFAULT_TOURNAMENT_TZ);
  });
});

describe('formatMatchDateTime / formatMatchTime', () => {
  it('affiche l’heure murale du tournoi, pas celle du navigateur', () => {
    // 19:00Z = 21:00 à Paris (CEST), 15:00 à New York (EDT).
    expect(formatMatchTime('2026-09-18T19:00:00Z', PARIS)).toBe('21:00');
    expect(formatMatchTime('2026-09-18T19:00:00Z', NY)).toBe('15:00');
    expect(formatMatchDateTime('2026-09-18T19:00:00Z', PARIS)).toMatch(
      /^18 sept\.?,? 21:00$/
    );
  });
  it('bascule de jour près de minuit UTC', () => {
    expect(formatMatchDateTime('2026-09-18T22:30:00Z', PARIS)).toMatch(
      /^19 sept\.?,? 00:30$/
    );
  });
  it('tiret pour null, brut pour illisible', () => {
    expect(formatMatchDateTime(null, PARIS)).toBe('—');
    expect(formatMatchDateTime('nope', PARIS)).toBe('nope');
    expect(formatMatchTime(null, PARIS)).toBe('—');
  });
});

describe('isoToTzInput / tzInputToIso', () => {
  it('convertit un instant en datetime-local dans le fuseau', () => {
    expect(isoToTzInput('2026-09-18T19:00:00Z', PARIS)).toBe(
      '2026-09-18T21:00'
    );
    expect(isoToTzInput('2026-09-18T22:30:00Z', PARIS)).toBe(
      '2026-09-19T00:30'
    );
    expect(isoToTzInput('2026-09-18T19:00:00Z', NY)).toBe('2026-09-18T15:00');
  });
  it('vide pour null ou illisible', () => {
    expect(isoToTzInput(null, PARIS)).toBe('');
    expect(isoToTzInput('nope', PARIS)).toBe('');
  });
  it('relit une saisie dans le fuseau', () => {
    expect(tzInputToIso('2026-09-18T21:00', PARIS)).toBe(
      '2026-09-18T19:00:00.000Z'
    );
    expect(tzInputToIso('2026-01-15T21:00', PARIS)).toBe(
      '2026-01-15T20:00:00.000Z'
    );
    expect(tzInputToIso('', PARIS)).toBeNull();
  });
  it('aller-retour stable (heure d’été et d’hiver)', () => {
    for (const iso of [
      '2026-09-18T19:00:00.000Z',
      '2026-12-05T20:15:00.000Z',
    ]) {
      expect(tzInputToIso(isoToTzInput(iso, PARIS), PARIS)).toBe(iso);
    }
  });
});

describe('dayRangeToIsoBounds', () => {
  it('bornes d’un jour ordinaire à Paris (UTC+2)', () => {
    expect(dayRangeToIsoBounds('2026-09-18', '2026-09-18', PARIS)).toEqual({
      dateFrom: '2026-09-17T22:00:00.000Z',
      dateTo: '2026-09-18T21:59:59.999Z',
    });
  });
  it('jour de 23 h (passage à l’heure d’été, 29/03/2026)', () => {
    expect(dayRangeToIsoBounds('2026-03-29', '2026-03-29', PARIS)).toEqual({
      dateFrom: '2026-03-28T23:00:00.000Z',
      dateTo: '2026-03-29T21:59:59.999Z',
    });
  });
  it('jour de 25 h (retour à l’heure d’hiver, 25/10/2026)', () => {
    expect(dayRangeToIsoBounds('2026-10-25', '2026-10-25', PARIS)).toEqual({
      dateFrom: '2026-10-24T22:00:00.000Z',
      dateTo: '2026-10-25T22:59:59.999Z',
    });
  });
  it('fin de mois / d’année', () => {
    expect(dayRangeToIsoBounds('', '2026-12-31', PARIS)).toEqual({
      dateTo: '2026-12-31T22:59:59.999Z',
    });
  });
  it('suit le fuseau du tournoi', () => {
    expect(dayRangeToIsoBounds('2026-09-18', '', NY)).toEqual({
      dateFrom: '2026-09-18T04:00:00.000Z',
    });
  });
  it('omet les bornes vides ou mal formées', () => {
    expect(dayRangeToIsoBounds('', '', PARIS)).toEqual({});
    expect(dayRangeToIsoBounds('18/09/2026', 'x', PARIS)).toEqual({});
  });
});

describe('csvDateToIso', () => {
  it('heure murale nue lue dans le fuseau du tournoi', () => {
    expect(csvDateToIso('2026-09-18 21:00', PARIS)).toBe(
      '2026-09-18T19:00:00.000Z'
    );
    expect(csvDateToIso('2026-09-18T21:00', PARIS)).toBe(
      '2026-09-18T19:00:00.000Z'
    );
    expect(csvDateToIso(' 2026-09-18 ', PARIS)).toBe(
      '2026-09-17T22:00:00.000Z'
    );
  });
  it('instant explicite gardé tel quel', () => {
    expect(csvDateToIso('2026-09-18T21:00:00Z', PARIS)).toBe(
      '2026-09-18T21:00:00.000Z'
    );
    expect(csvDateToIso('2026-09-18T21:00:00+02:00', NY)).toBe(
      '2026-09-18T19:00:00.000Z'
    );
  });
  it('lève sur une valeur illisible (comme avant)', () => {
    expect(() => csvDateToIso('demain soir', PARIS)).toThrow(RangeError);
  });
});

describe('formatDayLabel', () => {
  it('libellé long français du jour civil', () => {
    expect(formatDayLabel('2026-09-18')).toBe('vendredi 18 septembre 2026');
  });
});

describe('groupMatchesByTzDay', () => {
  const m = (id: string, scheduled_at: string | null) => ({ id, scheduled_at });

  it('regroupe par jour du tournoi, pas par jour UTC', () => {
    const { days } = groupMatchesByTzDay(
      [m('late', '2026-09-18T22:30:00Z'), m('evening', '2026-09-18T19:00:00Z')],
      PARIS
    );
    // 22:30Z = 00:30 le 19 à Paris : deux jours distincts.
    expect(days.map((d) => d.key)).toEqual(['2026-09-18', '2026-09-19']);
    expect(days[0].label).toBe('vendredi 18 septembre 2026');
    expect(days[1].matches.map((x) => x.id)).toEqual(['late']);
  });

  it('les mêmes instants tombent le même jour à New York', () => {
    const { days } = groupMatchesByTzDay(
      [m('late', '2026-09-18T22:30:00Z'), m('evening', '2026-09-18T19:00:00Z')],
      NY
    );
    expect(days.map((d) => d.key)).toEqual(['2026-09-18']);
    expect(days[0].matches.map((x) => x.id)).toEqual(['evening', 'late']);
  });

  it('trie jours et matchs chronologiquement', () => {
    const { days } = groupMatchesByTzDay(
      [
        m('b2', '2026-09-20T20:00:00Z'),
        m('a2', '2026-09-19T19:30:00Z'),
        m('b1', '2026-09-20T18:00:00Z'),
        m('a1', '2026-09-19T18:00:00Z'),
      ],
      PARIS
    );
    expect(days.map((d) => d.matches.map((x) => x.id))).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2'],
    ]);
  });

  it('range les horaires absents ou illisibles parmi les non planifiés', () => {
    const { days, unscheduled } = groupMatchesByTzDay(
      [m('none', null), m('bad', 'nope'), m('ok', '2026-09-18T19:00:00Z')],
      PARIS
    );
    expect(unscheduled.map((x) => x.id)).toEqual(['none', 'bad']);
    expect(days).toHaveLength(1);
  });
});
