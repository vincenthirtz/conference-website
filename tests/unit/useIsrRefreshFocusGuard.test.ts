// Garde de revalidation au retour d'onglet (`hooks/useIsrRefresh.ts`).
//
// Revenir sur l'onglet d'un téléphone émet `focus` ET `visibilitychange` :
// sans garde, deux fetchs partaient — sur le profil joueuse, deux agrégations
// d'environ 18 requêtes serveur. La logique est pure et testée ici sans DOM.

import { describe, it, expect } from 'vitest';

import {
  FOCUS_REVALIDATE_MIN_INTERVAL_MS,
  shouldRevalidateOnFocus,
} from '@/hooks/useIsrRefresh';

describe('shouldRevalidateOnFocus', () => {
  it('rafraîchit au premier retour d’onglet', () => {
    expect(
      shouldRevalidateOnFocus({ inFlight: false, lastStartedAt: null, now: 0 })
    ).toBe(true);
  });

  it('n’empile pas un second fetch sur un fetch en vol', () => {
    // Le cas mobile : `focus` lance, `visibilitychange` arrive dans la foulée.
    expect(
      shouldRevalidateOnFocus({
        inFlight: true,
        lastStartedAt: null,
        now: 1_000,
      })
    ).toBe(false);
  });

  it('ignore un retour trop rapproché du dernier fetch, même terminé', () => {
    expect(
      shouldRevalidateOnFocus({
        inFlight: false,
        lastStartedAt: 10_000,
        now: 10_000 + FOCUS_REVALIDATE_MIN_INTERVAL_MS - 1,
      })
    ).toBe(false);
  });

  it('rafraîchit de nouveau une fois l’intervalle écoulé', () => {
    expect(
      shouldRevalidateOnFocus({
        inFlight: false,
        lastStartedAt: 10_000,
        now: 10_000 + FOCUS_REVALIDATE_MIN_INTERVAL_MS,
      })
    ).toBe(true);
  });

  it('bloque un fetch pendu au-delà de l’intervalle tant qu’il est en vol', () => {
    expect(
      shouldRevalidateOnFocus({
        inFlight: true,
        lastStartedAt: 0,
        now: FOCUS_REVALIDATE_MIN_INTERVAL_MS * 10,
      })
    ).toBe(false);
  });

  it('respecte un intervalle personnalisé', () => {
    expect(
      shouldRevalidateOnFocus({
        inFlight: false,
        lastStartedAt: 0,
        now: 500,
        minIntervalMs: 400,
      })
    ).toBe(true);
  });

  it('fixe l’intervalle par défaut à 30 s', () => {
    expect(FOCUS_REVALIDATE_MIN_INTERVAL_MS).toBe(30_000);
  });
});
