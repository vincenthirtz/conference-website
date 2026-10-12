// @vitest-environment happy-dom
//
// Coquille joueuse (lot P8) : session + redirection à l'adresse de l'écran,
// navigation montrée à une joueuse connectée seulement, jamais en
// inspection admin ; entrées actives ; statiques de page recopiées.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { router, session } = vi.hoisted(() => ({
  router: {
    pathname: '/player/matches',
    asPath: '/player/matches?teamId=abc',
    replace: vi.fn(async () => true),
    events: { on: vi.fn(), off: vi.fn() },
  },
  session: { user: null as null | { id: string }, loading: false },
}));
vi.mock('next/router', () => ({ useRouter: () => router, default: router }));

vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ ...session, token: session.user ? 't' : null }),
}));

import PlayerShell, {
  withPlayerShell,
} from '../../features/player/_shared/shell/PlayerShell';
import {
  PLAYER_NAV_ITEMS,
  isPlayerNavItemActive,
} from '../../features/player/_shared/shell/playerNavItems';
import { PlayerAreaProvider } from '../../components/player/PlayerAreaContext';

afterEach(cleanup);
beforeEach(() => {
  router.replace.mockClear();
  session.user = null;
  session.loading = false;
});

const nav = () => screen.queryByRole('navigation', { name: /espace joueuse/ });

describe('PlayerShell', () => {
  it('visiteuse non connectée : redirigée vers l’adresse de l’écran, sans nav', () => {
    render(
      <PlayerShell redirectTo="/login?next=/player/matches">
        <p>contenu</p>
      </PlayerShell>
    );
    expect(router.replace).toHaveBeenCalledWith('/login?next=/player/matches');
    expect(nav()).toBeNull();
    expect(screen.getByText('contenu')).toBeTruthy();
  });

  it('adresse calculée depuis asPath (paramètres conservés)', () => {
    render(
      <PlayerShell redirectTo={(p) => `/login?next=${encodeURIComponent(p)}`}>
        <p>x</p>
      </PlayerShell>
    );
    expect(router.replace).toHaveBeenCalledWith(
      '/login?next=%2Fplayer%2Fmatches%3FteamId%3Dabc'
    );
  });

  it('redirectTo absent : la page garde sa propre redirection', () => {
    render(
      <PlayerShell>
        <p>x</p>
      </PlayerShell>
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('session en cours de résolution : ni redirection ni nav', () => {
    session.loading = true;
    render(
      <PlayerShell redirectTo="/login">
        <p>x</p>
      </PlayerShell>
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(nav()).toBeNull();
  });

  it('joueuse connectée : 5 entrées ≥ 44 px, l’entrée courante marquée', () => {
    session.user = { id: 'u1' };
    render(
      <PlayerShell redirectTo="/login">
        <p>x</p>
      </PlayerShell>
    );
    const n = nav();
    expect(n).toBeTruthy();
    expect(n?.hasAttribute('data-player-nav')).toBe(true);
    const links = screen.getAllByRole('link');
    // Nom accessible : le texte, ou l'aria-label quand la barre basse affiche
    // un libellé court (« Échanges » sous `lg`, « Mes échanges » au-dessus).
    expect(
      links.map((l) => l.getAttribute('aria-label') ?? l.textContent)
    ).toEqual(['Accueil', 'Équipe', 'Matchs', 'TCG', 'Mes échanges']);
    expect(
      screen.getByRole('link', { name: 'Mes échanges' }).getAttribute('href')
    ).toBe('/player/tcg/echanges');
    for (const l of links) expect(l.className).toContain('min-h-14');
    expect(
      screen.getByRole('link', { name: 'Matchs' }).getAttribute('aria-current')
    ).toBe('page');
    expect(
      screen.getByRole('link', { name: 'Accueil' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('page des échanges : « Mes échanges » allumé, TCG éteint', () => {
    session.user = { id: 'u1' };
    const previous = router.pathname;
    router.pathname = '/player/tcg/echanges';
    try {
      render(
        <PlayerShell redirectTo="/login">
          <p>x</p>
        </PlayerShell>
      );
      const trades = screen.getByRole('link', { name: 'Mes échanges' });
      expect(trades.getAttribute('aria-current')).toBe('page');
      expect(
        screen.getByRole('link', { name: 'TCG' }).getAttribute('aria-current')
      ).toBeNull();
      // Libellé court en barre basse, complet sur le rail (classes `lg`).
      const spans = [...trades.querySelectorAll('span')];
      expect(spans.map((s) => [s.textContent, s.className])).toEqual([
        ['Échanges', 'lg:hidden'],
        ['Mes échanges', 'hidden lg:inline'],
      ]);
    } finally {
      router.pathname = previous;
    }
  });

  it('inspection admin : ni coquille ni redirection', () => {
    session.user = null;
    render(
      <PlayerAreaProvider subjectId="4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f">
        <PlayerShell redirectTo="/login">
          <p>écran inspecté</p>
        </PlayerShell>
      </PlayerAreaProvider>
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(nav()).toBeNull();
    expect(screen.getByText('écran inspecté')).toBeTruthy();
  });

  it('withPlayerShell recopie `seo` (lu par _app)', () => {
    function Page() {
      return <p>page</p>;
    }
    Page.seo = { title: { fr: 'T', en: 'T' } };
    const Wrapped = withPlayerShell(Page, { redirectTo: '/login' });
    expect((Wrapped as unknown as { seo: unknown }).seo).toBe(Page.seo);
    session.user = { id: 'u1' };
    render(<Wrapped />);
    expect(screen.getByText('page')).toBeTruthy();
    expect(nav()).toBeTruthy();
  });
});

describe('isPlayerNavItemActive', () => {
  const item = (key: string) => {
    const found = PLAYER_NAV_ITEMS.find((i) => i.key === key);
    if (!found) throw new Error(key);
    return found;
  };
  it.each([
    ['/player', 'home', true],
    ['/player/matches', 'home', false],
    ['/player/match/[matchId]', 'matches', true],
    ['/player/tcg', 'tcg', true],
    ['/player/tcg/echanges', 'tcg', false],
    ['/player/tcg/echanges', 'trades', true],
    ['/player/tcg', 'trades', false],
    ['/player/tcg-guide', 'tcg', false],
    ['/player/tcg-guide', 'trades', false],
    ['/player/my-teams', 'team', true],
    ['/player/manage-team', 'team', true],
    ['/player/profile', 'team', false],
  ])('%s → %s = %s', (path, key, expected) => {
    expect(isPlayerNavItemActive(path, item(key))).toBe(expected);
  });
});
