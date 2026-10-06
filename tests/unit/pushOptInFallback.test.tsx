// @vitest-environment happy-dom
//
// tests/unit/pushOptInFallback.test.tsx
//
// PushOptIn — repli quand l'opt-in est impossible (lot P6) : iOS hors PWA
// installée → lien /app ; permission refusée → réglages du navigateur. Sans
// `showFallback`, rien ne change (le tableau de bord ne l'active pas).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/hooks/useAdminFetch', () => ({
  useAdminFetch: () => ({ adminFetchJson: vi.fn() }),
}));

import PushOptIn, { isIosWithoutPwa } from '@/components/shared/PushOptIn';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const w = window as any;
const originalUA = navigator.userAgent;

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

/** Navigateur avec Web Push complet, permission donnée. */
function withPush(permission: NotificationPermission) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: async () => null },
    configurable: true,
  });
  w.PushManager = function PushManager() {};
  w.Notification = { permission, requestPermission: vi.fn() };
}

function withoutPush() {
  delete w.PushManager;
  delete (navigator as any).serviceWorker;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_PWA = '1';
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  setUA(originalUA);
  withoutPush();
  delete w.Notification;
  delete process.env.NEXT_PUBLIC_ENABLE_PWA;
});

describe('isIosWithoutPwa', () => {
  const nav = (ua: string, extra: Record<string, unknown> = {}) => ({
    userAgent: ua,
    platform: '',
    maxTouchPoints: 0,
    ...extra,
  });

  it('iPhone dans Safari → vrai', () => {
    expect(isIosWithoutPwa(nav(IPHONE_UA), false)).toBe(true);
  });

  it('iPhone en PWA installée → faux', () => {
    expect(isIosWithoutPwa(nav(IPHONE_UA, { standalone: true }), false)).toBe(
      false
    );
    expect(isIosWithoutPwa(nav(IPHONE_UA), true)).toBe(false);
  });

  it('iPad récent (MacIntel tactile) → vrai ; Mac de bureau → faux', () => {
    expect(
      isIosWithoutPwa(
        nav('Mozilla/5.0 (Macintosh)', {
          platform: 'MacIntel',
          maxTouchPoints: 5,
        }),
        false
      )
    ).toBe(true);
    expect(
      isIosWithoutPwa(
        nav('Mozilla/5.0 (Macintosh)', { platform: 'MacIntel' }),
        false
      )
    ).toBe(false);
  });

  it('Android → faux', () => {
    expect(isIosWithoutPwa(nav('Mozilla/5.0 (Linux; Android 14)'), false)).toBe(
      false
    );
  });
});

describe('PushOptIn — repli', () => {
  it('iOS sans PWA : invite à installer l’app, lien /app', async () => {
    withoutPush();
    setUA(IPHONE_UA);
    render(<PushOptIn audience="player" variant="card" showFallback />);
    const box = await screen.findByTestId('push-optin-fallback-ios-install');
    expect(box.textContent).toMatch(/check-in/);
    const link = box.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/app');
  });

  it('permission refusée : renvoie aux réglages du navigateur', async () => {
    withPush('denied');
    render(<PushOptIn audience="player" variant="card" showFallback />);
    const box = await screen.findByTestId('push-optin-fallback-denied');
    expect(box.textContent).toMatch(/réglages du navigateur/);
  });

  it('sans showFallback : rien de rendu (comportement inchangé)', async () => {
    withPush('denied');
    const { container } = render(
      <PushOptIn audience="player" variant="card" />
    );
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
  });

  it('un refus mémorisé périmé (permission revenue à default) ne masque plus l’opt-in', async () => {
    withPush('default');
    window.localStorage.setItem('pwa-push-denied', '1');
    render(<PushOptIn audience="player" variant="card" showFallback />);
    expect(await screen.findByTestId('push-optin-card-player')).toBeTruthy();
    expect(window.localStorage.getItem('pwa-push-denied')).toBeNull();
  });
});
