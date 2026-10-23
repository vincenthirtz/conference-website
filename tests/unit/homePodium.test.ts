// Le podium de l'accueil, sous l'annonce de la championne.
//
// Lu dans `final_rankings` (figé par la finalisation admin) : vide avant, et
// alors rien ne s'affiche. Rendu côté serveur via react-dom/server, comme
// homeHeroV2A11y.

import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import HomeHeroV2 from '@/components/Home/HomeHeroV2';
import HomePodium from '@/components/Home/HomePodium';
import type { HomeChampion } from '@/config/homeChampion';
import {
  loadHomePodium,
  type HomePodiumEntry,
} from '@/utils/home/loadHomePodium';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const CUP = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';

const team = (id: string, name: string, slug: string | null = id) => ({
  id,
  name,
  short_name: null,
  slug,
  logo_url: null,
});

const PODIUM: HomePodiumEntry[] = [
  {
    rank: 1,
    team: {
      id: 'c',
      name: 'Chocomates',
      shortName: null,
      slug: 'chocomates',
      logoUrl: null,
    },
  },
  {
    rank: 2,
    team: {
      id: 'h',
      name: 'Hinode Sparkles',
      shortName: null,
      slug: 'hinode-sparkles',
      logoUrl: null,
    },
  },
  {
    rank: 3,
    team: {
      id: 'e',
      name: 'LVN EMBERS',
      shortName: null,
      slug: null,
      logoUrl: null,
    },
  },
];

const champion: HomeChampion = {
  year: 2026,
  tournamentId: CUP,
  tournamentSlug: 'ow-womens-cup-2026',
  teamName: 'Chocomates',
  teamSlug: 'chocomates',
  logoUrl: null,
  runnerUp: 'Hinode Sparkles',
  finalScore: '3–1',
  visibleUntil: '2026-12-01T00:00:00+01:00',
};

describe('loadHomePodium', () => {
  beforeEach(() => {
    resetSupabaseMock();
    store.final_rankings = [
      // Désordre volontaire : l'ordre vient de la requête.
      {
        tenant_id: TENANT,
        tournament_id: CUP,
        rank: 3,
        teams: team('e', 'LVN EMBERS'),
      },
      {
        tenant_id: TENANT,
        tournament_id: CUP,
        rank: 1,
        teams: [team('c', 'Chocomates')],
      },
      {
        tenant_id: TENANT,
        tournament_id: CUP,
        rank: 4,
        teams: team('v', 'Venom Valkyries'),
      },
      {
        tenant_id: TENANT,
        tournament_id: CUP,
        rank: 2,
        teams: team('h', 'Hinode Sparkles'),
      },
      // Un autre tournoi, un autre espace : hors podium.
      {
        tenant_id: TENANT,
        tournament_id: 'autre',
        rank: 1,
        teams: team('x', 'Autre'),
      },
      {
        tenant_id: 'autre-tenant',
        tournament_id: CUP,
        rank: 1,
        teams: team('y', 'Ailleurs'),
      },
    ] as any;
  });

  it('rend les trois premières du tournoi, dans l’ordre', async () => {
    const podium = await loadHomePodium(TENANT, CUP);
    expect(podium.map((p) => [p.rank, p.team.name])).toEqual([
      [1, 'Chocomates'],
      [2, 'Hinode Sparkles'],
      [3, 'LVN EMBERS'],
    ]);
    // L'embed en tableau (variante PostgREST) est lu comme l'objet.
    expect(podium[0].team).toEqual({
      id: 'c',
      name: 'Chocomates',
      shortName: null,
      slug: 'c',
      logoUrl: null,
    });
  });

  it('vide tant que le tournoi n’est pas finalisé', async () => {
    store.final_rankings = [] as any;
    expect(await loadHomePodium(TENANT, CUP)).toEqual([]);
  });
});

describe('HomePodium', () => {
  const html = renderToString(
    createElement(HomePodium, {
      entries: PODIUM,
      year: 2026,
      fullHref: '/tournament/ow-womens-cup-2026/podium',
    })
  );

  it('est une liste lue 1-2-3, rangée 2-1-3 à l’écran', () => {
    expect(html).toContain('aria-label="Podium 2026"');
    expect(html.match(/<li /g) ?? []).toHaveLength(3);
    expect(html.match(/ place :/g) ?? []).toHaveLength(3);
    const iC = html.indexOf('Chocomates');
    const iH = html.indexOf('Hinode Sparkles');
    const iE = html.indexOf('LVN EMBERS');
    expect(iC).toBeLessThan(iH);
    expect(iH).toBeLessThan(iE);
    // L'affichage en marches : 2e à gauche, 1re au centre, 3e à droite.
    expect(html).toMatch(/<li class="[^"]*order-2"/);
    expect(html).toMatch(/<li class="[^"]*order-1"/);
    expect(html).toMatch(/<li class="[^"]*order-3"/);
  });

  it('dit le rang avant chaque nom et lie les fiches qui existent', () => {
    expect(html).toContain('1re place :');
    expect(html).toContain('2e place :');
    expect(html).toContain('3e place :');
    expect(html).toContain('href="/team/chocomates"');
    expect(html).toContain('href="/team/hinode-sparkles"');
    // Sans slug, le nom seul.
    expect(html).not.toContain('href="/team/null"');
    expect(html).toContain('href="/tournament/ow-womens-cup-2026/podium"');
  });

  it('ne rend rien sans classement figé', () => {
    expect(
      renderToString(createElement(HomePodium, { entries: [], year: 2026 }))
    ).toBe('');
  });
});

describe('HomeHeroV2 — podium et tournoi clos', () => {
  const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const render = (props: Partial<Parameters<typeof HomeHeroV2>[0]>) =>
    renderToString(
      createElement(HomeHeroV2, { countdownTarget: FUTURE, ...props })
    );

  it('place le podium sous l’annonce de la championne', () => {
    const html = render({ champion, podium: PODIUM });
    expect(html.indexOf('Championnes 2026')).toBeLessThan(
      html.indexOf('Podium 2026')
    );
  });

  it('sans championne, pas de podium', () => {
    expect(render({ podium: PODIUM })).not.toContain('Podium 2026');
  });

  it('clos, le tournoi reste sur « suivre » : ni inscription ni « complet »', () => {
    const html = render({
      champion,
      podium: PODIUM,
      tournamentCompleted: true,
      tournamentFull: true,
      tournamentMaxTeams: 8,
      tournamentPath: '/tournament/ow-womens-cup-2026',
    });
    expect(html).toContain('href="/tournament/ow-womens-cup-2026/standings"');
    expect(html).toContain('href="/tournament/ow-womens-cup-2026/matches"');
    expect(html).not.toContain('href="/team/create"');
    expect(html).not.toContain('href="/rejoindre"');
    expect(html).not.toContain('Tournoi complet');
    expect(html).not.toContain('sont pourvues');
    expect(html).not.toContain('Saison régulière en cours');
  });
});
