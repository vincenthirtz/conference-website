// @vitest-environment happy-dom
//
// Décoration d'Halloween du site public (components/Halloween) :
//   * la fenêtre de dates (config/halloweenDecor) : bornes incluse / exclue ;
//   * la porte ne monte la décoration qu'en saison, et jamais sous une marque
//     blanche ;
//   * la citrouille éteint et rallume la décoration (WCAG 2.2.2), le choix
//     est mémorisé pour l'édition en cours seulement.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { halloweenDecor, isHalloweenDecorOn } from '@/config/halloweenDecor';

const brand = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/lib/branding/TenantBrandingProvider', () => ({
  useTenantBranding: () => brand.value,
}));
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function HalloweenDecorStub() {
        return React.createElement('div', { 'data-testid': 'decor' });
      },
  };
});

import HalloweenDecorGate from '@/components/Halloween/HalloweenDecorGate';
import HalloweenDecor from '@/components/Halloween/HalloweenDecor';

const PERIOD = {
  visibleFrom: '2026-10-27T00:00:00+01:00',
  visibleUntil: '2026-11-02T00:00:00+01:00',
};
const at = (iso: string) => new Date(iso).getTime();

describe('isHalloweenDecorOn', () => {
  it('à l’affiche de visibleFrom (inclus) à visibleUntil (exclu)', () => {
    expect(isHalloweenDecorOn(PERIOD, at('2026-10-26T23:59:59+01:00'))).toBe(
      false
    );
    expect(isHalloweenDecorOn(PERIOD, at(PERIOD.visibleFrom))).toBe(true);
    expect(isHalloweenDecorOn(PERIOD, at('2026-10-31T21:00:00+01:00'))).toBe(
      true
    );
    expect(isHalloweenDecorOn(PERIOD, at(PERIOD.visibleUntil))).toBe(false);
  });

  it('null : jamais', () => {
    expect(isHalloweenDecorOn(null, at('2026-10-31T21:00:00+01:00'))).toBe(
      false
    );
  });
});

describe('HalloweenDecorGate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    brand.value = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('en saison : monte la décoration', () => {
    vi.setSystemTime(new Date(halloweenDecor?.visibleFrom ?? 0));
    render(<HalloweenDecorGate />);
    expect(screen.getByTestId('decor')).toBeTruthy();
  });

  it('hors saison : rien', () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00+01:00'));
    render(<HalloweenDecorGate />);
    expect(screen.queryByTestId('decor')).toBeNull();
  });

  it('marque blanche : rien, même en saison', () => {
    vi.setSystemTime(new Date(halloweenDecor?.visibleFrom ?? 0));
    brand.value = { name: 'Autre orga' };
    render(<HalloweenDecorGate />);
    expect(screen.queryByTestId('decor')).toBeNull();
  });
});

describe('HalloweenDecor — la citrouille marche/arrêt', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  const decor = () =>
    document.querySelector('[data-test="halloween-decor"] [aria-hidden]');

  it('éteint, mémorise, puis rallume', () => {
    const { unmount } = render(<HalloweenDecor />);
    expect(decor()).not.toBeNull();

    act(() => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Éteindre la décoration d’Halloween',
        })
      );
    });
    expect(decor()).toBeNull();
    expect(window.localStorage.getItem('wc.halloweenDecorOff')).toBe(
      halloweenDecor?.visibleFrom
    );

    // Page suivante : le choix tient.
    unmount();
    render(<HalloweenDecor />);
    expect(decor()).toBeNull();

    act(() => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Rallumer la décoration d’Halloween',
        })
      );
    });
    expect(decor()).not.toBeNull();
    expect(window.localStorage.getItem('wc.halloweenDecorOff')).toBeNull();
  });

  it('un « éteint » d’une autre édition ne compte pas', () => {
    window.localStorage.setItem(
      'wc.halloweenDecorOff',
      '2025-10-27T00:00:00+01:00'
    );
    render(<HalloweenDecor />);
    expect(decor()).not.toBeNull();
  });

  it('la décoration est muette pour les lecteurs d’écran, le bouton non', () => {
    render(<HalloweenDecor />);
    expect(decor()?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
