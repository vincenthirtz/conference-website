// Règles de temps du soir de match, côté client : quand proposer le report de
// score, quand refermer le check-in, à quelle cadence rafraîchir le fil.

import { describe, expect, it } from 'vitest';

import {
  FAST_REFRESH_MS,
  LIVE_REFRESH_MS,
  canOfferScoreReport,
  isCheckinStillOpen,
  matchThreadRefreshMs,
} from '@/utils/matches/playerMatchLive';

const KICKOFF = '2026-09-18T17:00:00.000Z'; // 19:00 Paris
const OPENS = '2026-09-18T16:00:00.000Z'; // 18:00 Paris
const at = (iso: string) => new Date(iso).getTime();
const MIN = 60_000;

describe('canOfferScoreReport', () => {
  const base = {
    status: 'pending',
    scheduledAt: KICKOFF,
    canReport: true,
    hasOpponent: true,
  };

  it('pas de bouton sur un match à venir, même pour la capitaine', () => {
    expect(canOfferScoreReport(base, at(KICKOFF) - MIN)).toBe(false);
  });

  it('bouton dès le coup d’envoi passé', () => {
    expect(canOfferScoreReport(base, at(KICKOFF) + MIN)).toBe(true);
  });

  it('bouton sur un match en cours ou en litige, quel que soit l’horaire', () => {
    const early = at(KICKOFF) - 30 * MIN;
    expect(canOfferScoreReport({ ...base, status: 'ongoing' }, early)).toBe(
      true
    );
    expect(canOfferScoreReport({ ...base, status: 'disputed' }, early)).toBe(
      true
    );
  });

  it('jamais pour une joueuse qui n’est pas capitaine', () => {
    expect(
      canOfferScoreReport(
        { ...base, status: 'ongoing', canReport: false },
        at(KICKOFF) + MIN
      )
    ).toBe(false);
  });

  it('jamais sur un match clôturé ou sans adversaire', () => {
    const later = at(KICKOFF) + 60 * MIN;
    for (const status of ['finished', 'walkover', 'cancelled']) {
      expect(canOfferScoreReport({ ...base, status }, later)).toBe(false);
    }
    expect(canOfferScoreReport({ ...base, hasOpponent: false }, later)).toBe(
      false
    );
  });

  it('s’abstient sans horaire tant que rien n’atteste du début', () => {
    expect(
      canOfferScoreReport({ ...base, scheduledAt: null }, at(KICKOFF))
    ).toBe(false);
  });
});

describe('isCheckinStillOpen', () => {
  it('referme au coup d’envoi sans attendre le serveur', () => {
    const c = { isOpen: true, closesAt: KICKOFF };
    expect(isCheckinStillOpen(c, at(KICKOFF) - MIN)).toBe(true);
    expect(isCheckinStillOpen(c, at(KICKOFF) + 1)).toBe(false);
  });

  it('n’ouvre JAMAIS ce que le serveur dit fermé', () => {
    expect(
      isCheckinStillOpen({ isOpen: false, closesAt: KICKOFF }, at(OPENS) + MIN)
    ).toBe(false);
  });
});

describe('matchThreadRefreshMs', () => {
  const pending = {
    status: 'pending',
    checkinOpensAt: OPENS,
    checkinClosesAt: KICKOFF,
  };

  it('rien sur un match lointain', () => {
    expect(matchThreadRefreshMs(pending, at(OPENS) - 2 * 60 * MIN)).toBeNull();
  });

  it('30 s dès 10 min avant l’ouverture du check-in (fil ouvert à T-65)', () => {
    expect(matchThreadRefreshMs(pending, at(KICKOFF) - 65 * MIN)).toBe(
      FAST_REFRESH_MS
    );
  });

  it('30 s pendant la fenêtre et juste après le coup d’envoi', () => {
    expect(matchThreadRefreshMs(pending, at(KICKOFF) - 5 * MIN)).toBe(
      FAST_REFRESH_MS
    );
    expect(matchThreadRefreshMs(pending, at(KICKOFF) + 5 * MIN)).toBe(
      FAST_REFRESH_MS
    );
  });

  it('60 s pendant un match en cours, puis rien une fois terminé', () => {
    const late = at(KICKOFF) + 90 * MIN;
    expect(matchThreadRefreshMs({ ...pending, status: 'ongoing' }, late)).toBe(
      LIVE_REFRESH_MS
    );
    expect(
      matchThreadRefreshMs({ ...pending, status: 'finished' }, late)
    ).toBeNull();
  });

  it('un pending oublié depuis des jours ne relance pas l’API en boucle', () => {
    expect(
      matchThreadRefreshMs(pending, at(KICKOFF) + 3 * 24 * 60 * MIN)
    ).toBeNull();
  });
});
