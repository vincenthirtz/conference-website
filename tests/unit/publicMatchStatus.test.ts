// Fiche publique d'un match et liste des matchs d'un tournoi (lot 1) : plus
// de statut brut (« walkover », « disputed ») à l'écran, et un forfait reste
// sous le filtre « Terminés ».

import { describe, expect, it } from 'vitest';
import nsMatchDetail from '@/lib/i18n/locales/fr/matchDetail';
import nsMatchDetailEn from '@/lib/i18n/locales/en/matchDetail';
import {
  getMatchStatusChipClass,
  getMatchStatusLabel,
  isFinishedForFilter,
} from '@/utils/publicMatchStatus';

const fr = nsMatchDetail.fr;
const en = nsMatchDetailEn as unknown as typeof fr;

describe('getMatchStatusLabel', () => {
  it('donne un libellé lisible à chaque statut, FR et EN', () => {
    expect(getMatchStatusLabel('walkover', fr)).toBe('Forfait');
    expect(getMatchStatusLabel('disputed', fr)).toBe('En litige');
    expect(getMatchStatusLabel('postponed', fr)).toBe('Reporté');
    expect(getMatchStatusLabel('cancelled', fr)).toBe('Annulé');
    expect(getMatchStatusLabel('walkover', en)).toBe('Forfeit');
    expect(getMatchStatusLabel('disputed', en)).toBe('Disputed');
    expect(getMatchStatusLabel('postponed', en)).toBe('Postponed');
  });

  it('aucun statut connu ne retombe sur la valeur brute', () => {
    for (const s of [
      'pending',
      'ongoing',
      'finished',
      'cancelled',
      'postponed',
      'disputed',
      'walkover',
    ] as const) {
      expect(getMatchStatusLabel(s, fr)).not.toBe(s);
    }
  });

  it('un forfait a la puce d’un match terminé', () => {
    expect(getMatchStatusChipClass('walkover')).toBe(
      getMatchStatusChipClass('finished')
    );
  });
});

describe('isFinishedForFilter', () => {
  it('range forfaits et matchs terminés sous « Terminés »', () => {
    expect(isFinishedForFilter('finished')).toBe(true);
    expect(isFinishedForFilter('completed')).toBe(true);
    expect(isFinishedForFilter('walkover')).toBe(true);
    expect(isFinishedForFilter('cancelled')).toBe(false);
    expect(isFinishedForFilter('pending')).toBe(false);
  });
});
