// Session expirée sur les écrans de match : reconnaître le 401, et renvoyer
// vers /login en revenant sur la page courante.

import { describe, expect, it } from 'vitest';

import {
  isSessionExpiredError,
  loginHrefFor,
} from '@/utils/player/sessionExpiry';
import { matchCheckinHref } from '@/components/player/MatchLineupCard';

describe('isSessionExpiredError', () => {
  it('reconnaît un 401 (AdminFetchError ou équivalent)', () => {
    expect(isSessionExpiredError({ status: 401 })).toBe(true);
  });

  it('ne confond pas une panne avec une session expirée', () => {
    expect(isSessionExpiredError({ status: 500 })).toBe(false);
    expect(isSessionExpiredError(new Error('network'))).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});

describe('loginHrefFor', () => {
  it('ramène sur la page courante, paramètres compris', () => {
    const href = loginHrefFor('/player/matches?teamId=abc&as=x');
    expect(href).toBe(
      `/login?next=${encodeURIComponent('/player/matches?teamId=abc&as=x')}`
    );
    const next = new URLSearchParams(href.split('?')[1]).get('next');
    expect(next).toBe('/player/matches?teamId=abc&as=x');
  });

  it('refuse une cible externe', () => {
    expect(loginHrefFor('//evil.example')).toBe(
      `/login?next=${encodeURIComponent('/player')}`
    );
    expect(loginHrefFor('https://evil.example')).toBe(
      `/login?next=${encodeURIComponent('/player')}`
    );
  });
});

describe('matchCheckinHref (feuille de match → check-in)', () => {
  it('vise le check-in de CE match, jamais « le prochain match »', () => {
    const href = matchCheckinHref('match-2');
    expect(href).toBe('/player/match/match-2#checkin');
    expect(href).not.toContain('/player/checkin');
  });
});
