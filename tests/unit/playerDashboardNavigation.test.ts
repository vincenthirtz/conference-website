// tests/unit/playerDashboardNavigation.test.ts
//
// Lot 8 — le tableau de bord joueuse comme porte d'entrée du soir de match.
//
// Ce que ces tests protègent :
//  1. les liens du bandeau « à faire » mènent à une ancre qui EXISTE sur la page
//     (avant : `/player` depuis /player, et `#scrim-plannings`, la mauvaise
//     carte) ;
//  2. une section repliée se déplie quand le hash vise son panneau ou un
//     élément qu'elle contient — une ancre dans un `hidden` ne défile pas ;
//  3. l'en-tête « Compétition » porte le lien vers l'agenda complet ;
//  4. une visiteuse déconnectée ne reste pas sur un squelette éternel : elle
//     voit « Connecte-toi », avec retour au tableau de bord.
//
// Rendu serveur (react-dom/server), pas de jsdom : politique zéro dépendance.

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const session = vi.hoisted(() => ({
  value: {
    user: null as unknown,
    token: null as string | null,
    loading: false,
    ready: false,
  },
}));
vi.mock('@/hooks/usePlayerSession', () => ({
  usePlayerSession: () => session.value,
}));
vi.mock('@/hooks/useAdminFetch', () => ({
  useAdminFetch: () => ({ adminFetchJson: vi.fn(async () => ({})) }),
}));

import {
  hashTargetId,
  sectionPanelId,
  shouldExpandForHash,
} from '../../utils/player/dashboardAnchors';
import PlayerDashboardScreen, {
  CategorySection,
} from '../../components/player/screens/PlayerDashboardScreen';
import { ToastProvider } from '../../components/Toast';

describe('ancres du tableau de bord', () => {
  it('lit la cible d’un hash, encodé ou non, sans lever', () => {
    expect(hashTargetId('#section-scrims')).toBe('section-scrims');
    expect(hashTargetId('section-scrims')).toBe('section-scrims');
    expect(hashTargetId('#section%2Dscrims')).toBe('section-scrims');
    expect(hashTargetId('#%E0%A4%A')).toBe('%E0%A4%A');
    expect(hashTargetId('#')).toBeNull();
    expect(hashTargetId('')).toBeNull();
    expect(hashTargetId(null)).toBeNull();
  });

  it('déplie la section visée par son panneau ou par un élément contenu', () => {
    const panel = sectionPanelId('scrims');
    expect(panel).toBe('section-scrims');
    const none = () => false;
    const containsPending = (id: string) => id === 'pending-scrims';

    expect(shouldExpandForHash('#section-scrims', panel, none)).toBe(true);
    expect(shouldExpandForHash('#pending-scrims', panel, containsPending)).toBe(
      true
    );
    // Une ancre d'une AUTRE section ne déplie pas celle-ci.
    expect(shouldExpandForHash('#discord-link', panel, containsPending)).toBe(
      false
    );
    expect(shouldExpandForHash('', panel, containsPending)).toBe(false);
  });

  it('le panneau de la section Scrims garde l’ancre que le mail de scrim vise', () => {
    // L'autre moitié de cette parité vit dans conference-api
    // (tests/unit/scrimRequestNotify.test.ts : CAPTAIN_CTA_URL se termine par
    // `/player#section-scrims`). Même littéral des deux côtés, à dessein.
    expect(sectionPanelId('scrims')).toBe('section-scrims');
  });
});

describe('CategorySection', () => {
  it('pose l’id du panneau et rend le lien d’en-tête hors du bouton de pli', () => {
    const html = renderToString(
      createElement(
        CategorySection,
        // Les enfants passent en 3ᵉ argument (règle noChildrenProp) ; le type
        // des props les exige, d'où la conversion.
        {
          id: 'competition',
          label: 'Compétition',
          action: createElement(
            'a',
            { href: '/player/matches' },
            'Voir tous mes matchs'
          ),
        } as Parameters<typeof CategorySection>[0],
        createElement('p', null, 'contenu')
      )
    );
    expect(html).toContain('id="section-competition"');
    expect(html).toContain('aria-controls="section-competition"');
    expect(html).toContain('href="/player/matches"');
    // Le lien n'est pas DANS le bouton : il reste cliquable section repliée.
    const buttonEnd = html.indexOf('</button>');
    expect(html.indexOf('href="/player/matches"')).toBeGreaterThan(buttonEnd);
  });
});

// Les items du bandeau « à faire » (`buildTodo`) sont calculés côté API et
// testés là-bas (conference-api, tests/unit/playerDashboardNavigation.routes.test.ts).
describe('PlayerDashboardScreen — déconnectée', () => {
  function render() {
    // La page réelle est enveloppée par `withPlayerQuery` (P5).
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(ToastProvider, null, createElement(PlayerDashboardScreen))
      )
    );
  }

  it('montre « Connecte-toi » avec retour au tableau de bord, pas un squelette', () => {
    session.value = { user: null, token: null, loading: false, ready: false };
    const html = render();
    expect(html).toContain('href="/login?next=/player"');
    expect(html).not.toContain('aria-busy="true"');
  });

  it('garde le squelette tant que la session se résout', () => {
    session.value = { user: null, token: null, loading: true, ready: false };
    const html = render();
    expect(html).toContain('aria-busy="true"');
  });

  it('garde le squelette pendant le premier chargement d’une session prête', () => {
    session.value = {
      user: { id: 'u-1', email: 'a@b.c', user_metadata: {} },
      token: 't',
      loading: false,
      ready: true,
    };
    const html = render();
    expect(html).toContain('aria-busy="true"');
  });
});
