// L'heure d'un match s'affiche en heure de PARIS, quel que soit le fuseau du
// processus (téléphone à l'étranger, serveur Netlify en UTC).
//
// Constat d'origine : le fil du match et l'agenda formataient sans `timeZone`
// et rendaient l'heure du téléphone. Le 18/09/2026, match à 19:00 à Paris =
// 17:00 UTC (heure d'été, UTC+2).

import { describe, expect, it, vi } from 'vitest';

import {
  formatMatchDateTime,
  MATCH_TIMEZONE,
} from '@/utils/dates/formatMatchDateTime';

const KICKOFF_UTC = '2026-09-18T17:00:00.000Z';

describe('formatMatchDateTime', () => {
  it('épingle Europe/Paris', () => {
    expect(MATCH_TIMEZONE).toBe('Europe/Paris');
  });

  // Changer `process.env.TZ` n'a AUCUN effet dans un worker thread (pool
  // `threads` de Vitest, vérifié) : un test qui « bascule le fuseau » y
  // passerait sans rien prouver. La garantie vérifiable est donc double :
  //   1. chaque formateur construit reçoit `timeZone: 'Europe/Paris'` — c'est
  //      ce qui rend le résultat indépendant du fuseau du processus ;
  //   2. la valeur rendue est l'heure de Paris, quelle que soit la machine
  //      qui lance la suite (UTC en CI, Paris en local).
  it.each(['long', 'agenda', 'time', 'stamp', 'date'] as const)(
    'style %s : fuseau épinglé, jamais celui du processus',
    (style) => {
      const spy = vi.spyOn(Intl, 'DateTimeFormat');
      try {
        formatMatchDateTime(KICKOFF_UTC, 'fr-FR', style);
        expect(spy).toHaveBeenCalled();
        for (const call of spy.mock.calls) {
          expect((call[1] as Intl.DateTimeFormatOptions)?.timeZone).toBe(
            'Europe/Paris'
          );
        }
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('rend 19:00 pour 17:00 UTC le 18/09 (heure d’été), partout', () => {
    expect(formatMatchDateTime(KICKOFF_UTC, 'fr-FR', 'time')).toBe('19:00');
    expect(formatMatchDateTime(KICKOFF_UTC, 'fr', 'long')).toMatch(
      /vendredi 18 septembre.*19:00/
    );
    expect(formatMatchDateTime(KICKOFF_UTC, 'fr-FR', 'agenda')).toMatch(
      /^ven\.? 18.*19:00$/
    );
    // 22:30 UTC = 00:30 à Paris le LENDEMAIN : le jour suit Paris aussi.
    expect(
      formatMatchDateTime('2026-09-18T22:30:00.000Z', 'fr-FR', 'date')
    ).toBe('19/09/2026');
  });

  it('suit la langue sans changer l’heure', () => {
    expect(formatMatchDateTime(KICKOFF_UTC, 'en-GB', 'long')).toMatch(
      /Friday 18 September.*19:00/
    );
  });

  it('rend le repli sur une date absente ou invalide', () => {
    expect(formatMatchDateTime(null, 'fr-FR', 'long', 'Date à venir')).toBe(
      'Date à venir'
    );
    expect(formatMatchDateTime('pas une date', 'fr-FR', 'time', '—')).toBe('—');
  });
});
