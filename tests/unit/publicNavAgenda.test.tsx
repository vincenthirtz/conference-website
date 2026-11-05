// @vitest-environment happy-dom
//
// Le sous-menu « Agenda » du menu du site, au clavier (components/Navbar/PublicNav.tsx).
//
// Deux pièges : l'entrée grisée « OWWC 2027 » ne doit pas prendre le focus, et
// les liens d'un sous-menu ne doivent pas être écrasés par ceux du suivant.
// Tous les sous-menus sont rendus (cachés) ; quand leurs liens partageaient une
// seule liste rangée par position, Communauté écrasait l'Agenda, et les flèches
// cherchaient le focus dans un menu fermé.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

vi.mock('next/router', () => ({
  useRouter: () => ({
    asPath: '/',
    pathname: '/',
    push: vi.fn(),
    prefetch: vi.fn(async () => undefined),
  }),
}));
vi.mock('@/hooks/useAuthSession', () => ({
  useAuthSession: () => ({ user: null, loading: false }),
}));
vi.mock('@/components/Navbar/PlayerBell', () => ({ default: () => null }));

import PublicNav from '@/components/Navbar/PublicNav';

afterEach(() => cleanup());

function openAgenda() {
  const { container } = render(
    <PublicNav staffLoading={false} showStaffLogin={false} />
  );
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-test="nav-Agenda"] button'
  );
  if (!trigger) throw new Error('bouton Agenda introuvable');
  return trigger;
}

describe('menu du site — Agenda au clavier', () => {
  it('↓ ouvre sur le premier lien à revoir, en sautant OWWC 2027', () => {
    fireEvent.keyDown(openAgenda(), { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Event Halloween');
  });

  it('les flèches restent dans l’Agenda et bouclent sur ses liens', () => {
    fireEvent.keyDown(openAgenda(), { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toBe('OWWC 2025');
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Event Halloween');
  });
});
