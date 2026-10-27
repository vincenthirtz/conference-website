// @vitest-environment happy-dom
//
// La source OBS « finales » (`/overlay/finales`) : la petite et la grande
// finale de la soirée, une bande chacune.
//
// CE QUE CES CAS PROTÈGENT :
//   - ne sont des finales que la petite et la grande (une demi-finale
//     contient aussi « finale ») ;
//   - la scène fixe de 1450×340, l'emplacement que l'habillage de la régie
//     lui réserve — sans titre, l'habillage le porte ;
//   - les trois états d'une bande, sans jamais masquer le score : l'heure à
//     venir, le score en direct, le score et les places une fois jouée —
//     forfait compris ;
//   - pas de « VS » (la scène de la régie porte déjà l'habillage) ;
//   - une journée sans finale : cadre vide dans OBS, explication en aperçu ;
//   - l'URL est proposée dans Diffusion › Overlays.

import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

const routerQuery: { current: Record<string, string> } = { current: {} };
vi.mock('next/router', () => ({
  useRouter: () => ({ query: routerQuery.current, isReady: true }),
}));
// Le signal de présence fait un `fetch` au montage : rien à envoyer ici.
vi.mock('../../hooks/useOverlayHeartbeat', () => ({
  useOverlayHeartbeat: () => {},
}));

import {
  finalKind,
  selectFinals,
} from '../../components/overlay/finals/finalsRounds';
import { FinalsSource } from '../../components/overlay/finals/FinalsSource';
import FinalsOverlayPage from '../../pages/overlay/finales';
import StreamSourcesPanel from '../../components/admin/tournament/StreamSourcesPanel';
import type {
  OverlayDayMatchView,
  OverlayDayResponse,
} from '../../utils/overlay/dayOverlay';

function team(
  name: string,
  over: Partial<NonNullable<OverlayDayMatchView['team1']>> = {}
) {
  return {
    name,
    shortName: null,
    logoUrl: null,
    score: 0,
    isWinner: false,
    ...over,
  };
}

function match(over: Partial<OverlayDayMatchView> = {}): OverlayDayMatchView {
  return {
    id: 'm-grand',
    phase: 'upcoming',
    format: 'bo5',
    roundName: 'Grande finale',
    // 20 h 30 à Paris le 23 octobre 2026 (CEST = UTC+2).
    scheduledAt: '2026-10-23T18:30:00.000Z',
    startedAt: null,
    team1: team('Hinode Sparkles'),
    team2: team('Chocomates'),
    ...over,
  };
}

const SMALL = match({
  id: 'm-small',
  roundName: 'Petite finale',
  scheduledAt: '2026-10-23T17:00:00.000Z',
  team1: team('LVN EMBERS'),
  team2: team('Venom Valkyries'),
});

function payload(matches: OverlayDayMatchView[]): OverlayDayResponse {
  return {
    date: '2026-10-23',
    matches,
    currentMatchId: matches[0]?.id ?? null,
    tournament: {
      id: 't-1',
      slug: 'ow-womens-cup-2026',
      name: "OW WOMEN's CUP 2026",
      shortName: null,
      game: 'overwatch',
    },
    branding: null,
    serverTime: '2026-10-23T12:00:00.000Z',
  };
}

function render(p: OverlayDayResponse | null, extra = {}): string {
  return renderToStaticMarkup(
    createElement(FinalsSource, { payload: p, ...extra })
  );
}

describe('finalKind — qu’est-ce qu’une finale', () => {
  it('reconnaît la grande et la petite finale', () => {
    expect(finalKind('Grande finale')).toBe('grand');
    expect(finalKind('Finale')).toBe('grand');
    expect(finalKind('Grand Final')).toBe('grand');
    expect(finalKind('Petite finale')).toBe('small');
    expect(finalKind('Match pour la 3e place')).toBe('small');
    expect(finalKind('Third-place match')).toBe('small');
  });

  it('écarte demi-finales, quarts et manches ordinaires', () => {
    expect(finalKind('Demi-finale 1')).toBeNull();
    expect(finalKind('Semi-final')).toBeNull();
    expect(finalKind('Quart de finale')).toBeNull();
    expect(finalKind('J7')).toBeNull();
    expect(finalKind(null)).toBeNull();
  });

  it('garde les finales de la journée, dans l’ordre du programme', () => {
    const picked = selectFinals([
      SMALL,
      match({ id: 'semi', roundName: 'Demi-finale' }),
      match(),
    ]);
    expect(picked.map((f) => [f.match.id, f.kind])).toEqual([
      ['m-small', 'small'],
      ['m-grand', 'grand'],
    ]);
  });
});

describe('FinalsSource — les bandes', () => {
  it('se dessine sur la scène fixe de 1450×340, sans titre', () => {
    const html = render(payload([SMALL, match()]));
    expect(html).toMatch(
      /data-finals-stage=""[^>]*style="width:1450px;height:340px/
    );
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('OW WOMEN&#x27;s CUP 2026');
  });

  it('encadre chaque bande aux couleurs du fond de l’habillage', () => {
    const html = render(payload([SMALL, match()]));
    expect(html.match(/data-finals-frame=""/g) ?? []).toHaveLength(2);
    // Vert puis violet, les faisceaux du fond « STARTING WOMEN'S CUP ».
    expect(html).toContain('linear-gradient(90deg, #5c8c68, #823aa8)');
  });

  it('à venir : l’heure de Paris, le format, ni score ni « VS »', () => {
    const html = render(payload([SMALL, match()]));
    expect(html).toContain('Petite finale');
    expect(html).toContain('Grande finale');
    expect(html).toContain('19:00');
    expect(html).toContain('20:30');
    expect(html).toContain('BO5');
    expect(html).toContain('Coup d’envoi');
    expect(html).not.toContain('>VS<');
    // Ordre du programme : la petite finale d'abord.
    expect(html.indexOf('data-final="small"')).toBeLessThan(
      html.indexOf('data-final="grand"')
    );
  });

  it('en direct : le score et la pastille, pas encore de place', () => {
    const html = render(
      payload([
        match({
          phase: 'live',
          team1: team('Hinode Sparkles', { score: 2 }),
          team2: team('Chocomates', { score: 1 }),
        }),
      ])
    );
    expect(html).toContain('En direct');
    expect(html).toMatch(/>2<span[^>]*>:<\/span>1</);
    expect(html).not.toContain('Championnes');
  });

  it('terminé : championnes et finalistes, 3e et 4e place', () => {
    const html = render(
      payload([
        {
          ...SMALL,
          phase: 'final',
          team1: team('LVN EMBERS', { score: 3, isWinner: true }),
          team2: team('Venom Valkyries', { score: 1 }),
        },
        match({
          phase: 'final',
          team1: team('Hinode Sparkles', { score: 2 }),
          team2: team('Chocomates', { score: 3, isWinner: true }),
        }),
      ])
    );
    expect(html).toContain('Championnes');
    expect(html).toContain('Finalistes');
    expect(html).toContain('3ᵉ place');
    expect(html).toContain('4ᵉ place');
    expect(html).toContain('Terminé');
  });

  it('forfait : le score reste affiché, les places aussi', () => {
    const html = render(
      payload([
        match({
          phase: 'final',
          team1: team('Hinode Sparkles', { score: 0, isWinner: true }),
          team2: team('Chocomates', { score: 0 }),
        }),
      ])
    );
    expect(html).toMatch(/>0<span[^>]*>:<\/span>0</);
    expect(html).toContain('Championnes');
  });

  it('côté inconnu : « À déterminer », sans planter', () => {
    const html = render(payload([match({ team2: null })]));
    expect(html).toContain('À déterminer');
  });

  it('journée sans finale : cadre vide dans OBS, explication en aperçu', () => {
    const none = payload([match({ roundName: 'J7' })]);
    expect(render(none)).toBe('');
    expect(render(none, { preview: true })).toContain(
      'Aucune finale le 2026-10-23'
    );
    expect(render(null)).toBe('');
  });
});

describe('page /overlay/finales', () => {
  it('dit ce qui manque quand l’URL n’a pas de tournoi, une fois dans le navigateur', async () => {
    routerQuery.current = {};
    // Rendu serveur : la page est pré-rendue sans URL, elle ne peut rien en
    // dire — et doit rendre la même chose que l'hydratation (useRouterReady).
    expect(
      renderToStaticMarkup(createElement(FinalsOverlayPage))
    ).not.toContain('?tournament=');
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(createElement(FinalsOverlayPage)));
    expect(container.innerHTML).toContain('?tournament=');
    await act(async () => root.unmount());
  });
});

describe('Diffusion › Overlays — la source est proposée', () => {
  it('donne l’URL des finales du tournoi, avec son test sur un autre jour', () => {
    const html = renderToStaticMarkup(
      createElement(StreamSourcesPanel, {
        tournamentRef: 'ow-womens-cup-2026',
        baseUrl: 'https://owwomenscup.fr',
        enabled: true,
        planLabel: 'Régie',
      })
    );
    expect(html).toContain(
      'https://owwomenscup.fr/overlay/finales?tournament=ow-womens-cup-2026'
    );
    expect(html).toContain('id="finals-overlay-test-date"');
    expect(html).toContain('id="day-overlay-test-date"');
  });
});
