// tests/unit/navbarHeaderBars.test.ts
//
// Quelle barre d'en-tête, et quel onglet joueuse actif (components/Navbar/
// headerBars.ts).
//
//  1. Une capitaine qui est AUSSI staff retrouve la navigation joueuse sur
//     /player (elle n'y avait que la barre admin, sans « Mes matchs ») ;
//  2. hors /player, rien ne change ;
//  3. jamais deux barres, et jamais une barre qui ne s'affichera pas (cf.
//     navbarHeaderNeverEmpty.test.ts) ;
//  4. « Mes matchs » reste actif sur le fil d'un match.

import { describe, it, expect } from 'vitest';
import {
  isPlayerLinkActive,
  resolveHeaderBars,
  type HeaderBarsInput,
} from '@/components/Navbar/headerBars';
import { PLAYER_LINKS } from '@/components/Navbar/playerLinks';

const resolved: Omit<HeaderBarsInput, 'pathname'> = {
  staffLoading: false,
  isStaff: false,
  adminLinkCount: 0,
  playerLoading: false,
  hasPlayerUser: true,
};

describe('resolveHeaderBars', () => {
  it('staff + joueuse sur /player : barre joueuse, pas la barre admin', () => {
    for (const pathname of [
      '/player',
      '/player/matches',
      '/player/match/[id]',
    ]) {
      expect(
        resolveHeaderBars({
          ...resolved,
          pathname,
          isStaff: true,
          adminLinkCount: 12,
        })
      ).toEqual({ showAdminBar: false, showPlayerBar: true });
    }
  });

  it('staff hors /player : barre admin, comme avant', () => {
    expect(
      resolveHeaderBars({
        ...resolved,
        pathname: '/admin/users/[id]/player-view',
        isStaff: true,
        adminLinkCount: 12,
      })
    ).toEqual({ showAdminBar: true, showPlayerBar: false });
    expect(
      resolveHeaderBars({
        ...resolved,
        pathname: '/',
        isStaff: true,
        adminLinkCount: 12,
      })
    ).toEqual({ showAdminBar: true, showPlayerBar: false });
  });

  it('joueuse non staff : barre joueuse sur /player seulement', () => {
    expect(resolveHeaderBars({ ...resolved, pathname: '/player' })).toEqual({
      showAdminBar: false,
      showPlayerBar: true,
    });
    expect(
      resolveHeaderBars({ ...resolved, pathname: '/tournaments' })
    ).toEqual({ showAdminBar: false, showPlayerBar: false });
  });

  it('rien tant qu’une session se résout, ni sans session joueuse', () => {
    expect(
      resolveHeaderBars({
        ...resolved,
        pathname: '/player',
        staffLoading: true,
      })
    ).toEqual({ showAdminBar: false, showPlayerBar: false });
    expect(
      resolveHeaderBars({
        ...resolved,
        pathname: '/player',
        playerLoading: true,
      })
    ).toEqual({ showAdminBar: false, showPlayerBar: false });
    // Staff sans session joueuse résolue sur /player : la barre admin reste.
    expect(
      resolveHeaderBars({
        ...resolved,
        pathname: '/player',
        hasPlayerUser: false,
        isStaff: true,
        adminLinkCount: 3,
      })
    ).toEqual({ showAdminBar: true, showPlayerBar: false });
  });

  it('jamais deux barres, et jamais la barre admin sans lien', () => {
    const paths = ['/', '/player', '/player/profile', '/admin'];
    for (const pathname of paths) {
      for (const isStaff of [true, false]) {
        for (const adminLinkCount of [0, 4]) {
          for (const hasPlayerUser of [true, false]) {
            const bars = resolveHeaderBars({
              ...resolved,
              pathname,
              isStaff,
              adminLinkCount,
              hasPlayerUser,
            });
            expect(bars.showAdminBar && bars.showPlayerBar).toBe(false);
            if (bars.showAdminBar) expect(adminLinkCount).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('isPlayerLinkActive', () => {
  it('« Mes matchs » reste actif sur le fil d’un match', () => {
    expect(isPlayerLinkActive('/player/match/[id]', '/player/matches')).toBe(
      true
    );
    expect(isPlayerLinkActive('/player/matches', '/player/matches')).toBe(true);
  });

  it('le tableau de bord n’est actif que sur /player exactement', () => {
    expect(isPlayerLinkActive('/player', '/player')).toBe(true);
    expect(isPlayerLinkActive('/player/matches', '/player')).toBe(false);
  });

  it('un préfixe de nom ne suffit pas (`/player/profile-x` ≠ profil)', () => {
    expect(isPlayerLinkActive('/player/profile-x', '/player/profile')).toBe(
      false
    );
    expect(isPlayerLinkActive('/player/profile/edit', '/player/profile')).toBe(
      true
    );
  });

  it('un seul onglet actif par route de l’espace', () => {
    for (const pathname of [
      '/player',
      '/player/matches',
      '/player/match/[id]',
      '/player/discovery',
      '/player/notifications',
      '/player/profile',
    ]) {
      const active = PLAYER_LINKS.filter((l) =>
        isPlayerLinkActive(pathname, l.ref)
      );
      expect(active, pathname).toHaveLength(1);
    }
  });
});
