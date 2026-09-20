// tests/unit/playerHubLinks.test.ts
//
// Lot 8 — liens et lectures partagées de l'espace joueuse.
//
//  1. « Mes équipes » : ouvrir l'équipe C désigne C AVANT de naviguer
//     (l'écran de gestion travaille sur l'équipe active) ;
//  2. dossier d'adversaire : un seul état vide honnête quand rien n'est
//     mesurable ;
//  3. cartes du cadeau d'accueil : elles rendent la lecture passée par la page,
//     sans attendre la leur.

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@/hooks/usePlayerSession', () => ({
  usePlayerSession: () => ({
    user: null,
    token: null,
    loading: true,
    ready: false,
  }),
}));
vi.mock('@/hooks/useAdminFetch', () => ({
  useAdminFetch: () => ({ adminFetchJson: vi.fn(async () => ({})) }),
}));

import { manageTeamLinkProps } from '../../components/player/screens/PlayerMyTeamsScreen';
import { isScoutingDossierEmpty } from '../../pages/player/scouting/[teamId]';
import WelcomeGiftCard from '../../components/player/WelcomeGiftCard';
import SupporterWelcomeCard from '../../components/player/SupporterWelcomeCard';

describe('« Mes équipes » → gestion', () => {
  it('désigne l’équipe de la ligne au clic, vers l’écran de gestion', () => {
    const setActiveTeamId = vi.fn();
    const a = manageTeamLinkProps('team-a', setActiveTeamId);
    const c = manageTeamLinkProps('team-c', setActiveTeamId);
    expect(a.href).toBe('/player/manage-team');
    expect(c.href).toBe('/player/manage-team');
    c.onClick();
    expect(setActiveTeamId).toHaveBeenLastCalledWith('team-c');
    a.onClick();
    expect(setActiveTeamId).toHaveBeenLastCalledWith('team-a');
  });
});

describe('dossier d’adversaire — état vide', () => {
  const empty = {
    report: {
      headToHead: { played: 0, wins: 0, losses: 0, recent: [] },
      recentForm: null,
      record: null,
      commonOpponents: [],
      usualSlots: null,
    },
    myNotes: [],
  } as any;

  it('vide quand aucune section n’a matière', () => {
    expect(isScoutingDossierEmpty(empty)).toBe(true);
    expect(
      isScoutingDossierEmpty({
        ...empty,
        report: { ...empty.report, usualSlots: [] },
      })
    ).toBe(true);
  });

  it('pas vide dès qu’UNE section a quelque chose', () => {
    const variants = [
      { report: { ...empty.report, headToHead: { played: 1 } } },
      {
        report: {
          ...empty.report,
          recentForm: ['win'],
          record: { played: 3, wins: 2, losses: 1 },
        },
      },
      { report: { ...empty.report, commonOpponents: [{ teamId: 'x' }] } },
      {
        report: {
          ...empty.report,
          usualSlots: [{ weekday: 1, hour: 20, count: 3 }],
        },
      },
      { myNotes: [{ subjectId: 'm' }] },
    ];
    for (const v of variants) {
      expect(isScoutingDossierEmpty({ ...empty, ...v } as any)).toBe(false);
    }
  });
});

describe('cadeaux d’accueil — lecture passée par la page', () => {
  const response = {
    gift: { coins: 150 },
    // Renommé le 2026-09-20 : la carte sert AUSSI le staff, pas seulement
    // les supportrices (cf. `grantSelfWelcome`).
    welcomeClaimable: true,
  } as any;

  it('WelcomeGiftCard rend le cadeau fourni dès le premier rendu', () => {
    const html = renderToString(
      createElement(WelcomeGiftCard, { data: response })
    );
    expect(html).toContain('welcome-gift-heading');
    expect(html).toContain('150');
  });

  it('SupporterWelcomeCard rend le bouton de réclamation fourni', () => {
    const html = renderToString(
      createElement(SupporterWelcomeCard, { data: response })
    );
    expect(html).toContain('supporter-welcome-heading');
  });

  it('`null` (page en cours de lecture ou en échec) : rien', () => {
    expect(renderToString(createElement(WelcomeGiftCard, { data: null }))).toBe(
      ''
    );
    expect(
      renderToString(createElement(SupporterWelcomeCard, { data: null }))
    ).toBe('');
  });

  it('sans prop, la carte reste autonome (et masquée avant sa lecture)', () => {
    expect(renderToString(createElement(WelcomeGiftCard))).toBe('');
    expect(renderToString(createElement(SupporterWelcomeCard))).toBe('');
  });
});
