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
  DASHBOARD_ANCHORS,
  hashTargetId,
  sectionPanelId,
  shouldExpandForHash,
} from '../../utils/player/dashboardAnchors';
import { buildTodo, EMPTY_NEXT_MATCH } from '../../pages/api/player/dashboard';
import PlayerDashboardScreen, {
  CategorySection,
} from '../../components/player/screens/PlayerDashboardScreen';
import { ToastProvider } from '../../components/Toast';
import { CAPTAIN_CTA_URL } from '../../utils/scrimRequestNotify';

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

  it('le mail de scrim vise le panneau de la section Scrims', () => {
    expect(
      CAPTAIN_CTA_URL.endsWith(`/player#${sectionPanelId('scrims')}`)
    ).toBe(true);
  });
});

describe('bandeau « à faire » — liens vers une cible réelle', () => {
  const base = {
    userId: 'u-1',
    nextMatch: EMPTY_NEXT_MATCH,
    unreadMessages: 0,
    members: [],
    canManage: true,
    permissions: [],
  };

  it('invitation → l’enveloppe d’InvitationsSection, pas `/player` seul', () => {
    const todo = buildTodo({
      ...base,
      pendingScrims: [],
      pendingInvitations: 2,
    });
    expect(todo).toEqual([
      {
        id: 'invitation',
        href: `/player#${DASHBOARD_ANCHORS.invitations}`,
        count: 2,
      },
    ]);
  });

  it('scrims → le bloc des scrims qui attendent une réponse, pas les grilles', () => {
    const todo = buildTodo({
      ...base,
      pendingScrims: [{ id: 's-1' } as never],
      pendingInvitations: 0,
      permissions: ['manage_scrims'],
    });
    expect(todo[0].href).toBe(`/player#${DASHBOARD_ANCHORS.pendingScrims}`);
    expect(todo[0].href).not.toContain('scrim-plannings');
  });

  it('pas d’item scrims sans `manage_scrims` : la section et son ancre n’existent pas', () => {
    const todo = buildTodo({
      ...base,
      pendingScrims: [{ id: 's-1' } as never],
      pendingInvitations: 0,
      permissions: ['validate_lineup'],
    });
    expect(todo.map((i) => i.id)).not.toContain('scrims');
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

describe('PlayerDashboardScreen — déconnectée', () => {
  function render() {
    return renderToString(
      createElement(ToastProvider, null, createElement(PlayerDashboardScreen))
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
