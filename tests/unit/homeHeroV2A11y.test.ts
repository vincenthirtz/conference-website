// Hero de l'accueil : sémantique des CTA et de la pastille de compte à rebours,
// et bouton d'inscription alimenté par les props plutôt que par une requête.
//
// Pas de jsdom/testing-library dans ce repo (politique zéro dépendance) : on
// rend côté serveur via react-dom/server, comme homeSpotlightFull.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import HomeHeroV2 from '@/components/Home/HomeHeroV2';
import RegisterTeamCta from '@/components/RegisterTeamCta';
import {
  isHomeChampionVisible,
  type HomeChampion,
} from '@/config/homeChampion';

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

function renderHero(props: Partial<Parameters<typeof HomeHeroV2>[0]> = {}) {
  return renderToString(
    createElement(HomeHeroV2, { countdownTarget: FUTURE, ...props })
  );
}

describe('HomeHeroV2 — CTA', () => {
  it('rend des liens, sans <button> imbriqué dans un <a>', () => {
    const html = renderHero();
    expect(html).toContain('href="/team/create"');
    expect(html).toContain('href="/rejoindre"');
    expect(html).toContain('href="https://discord.gg/');
    // Un <button> dans un <a> : HTML invalide et deux arrêts de tabulation.
    expect(html).not.toContain('<button');
  });

  it('porte les classes visuelles sur le lien lui-même', () => {
    const html = renderHero();
    expect(html).toMatch(
      /<a[^>]*class="esport-cta[^"]*"[^>]*href="\/team\/create"|<a[^>]*href="\/team\/create"[^>]*class="esport-cta/
    );
    expect(html).toMatch(
      /<a[^>]*class="hero-secondary-btn[^"]*"[^>]*href="\/rejoindre"/
    );
  });
});

describe('HomeHeroV2 — pastille du compte à rebours', () => {
  it("n'est pas une région vivante dans son ensemble", () => {
    const html = renderHero();
    // Une seule région : le libellé d'état. Les cellules j/h/min/s, mises à
    // jour chaque seconde, ne doivent pas être annoncées en boucle.
    expect(html.match(/aria-live=/g) ?? []).toHaveLength(1);
    expect(html).toMatch(
      /aria-live="polite"[^>]*>(<[^>]+>)*[^<]*<\/span><\/span>Prochain rendez-vous dans/
    );
  });

  it('masque les cellules aux technologies d’assistance', () => {
    const html = renderHero();
    expect(html).toMatch(
      /<span class="inline-flex gap-1\.5" aria-hidden="true">/
    );
  });

  it('garde la région vivante en direct', () => {
    const html = renderHero({ isLive: true });
    expect(html).toContain('En direct maintenant');
    expect(html.match(/aria-live=/g) ?? []).toHaveLength(1);
  });
});

describe('HomeHeroV2 — soir de finales', () => {
  it('annonce les finales et l’heure du coup d’envoi, à Paris', () => {
    const html = renderHero({
      tournamentRunning: true,
      tournamentTeamCount: 8,
      tournamentEndDate: '2026-10-23',
      tournamentPath: '/tournament/ow-womens-cup-2026',
      // 19 h à Paris (CEST = UTC+2).
      finalsKickoff: '2026-10-23T17:00:00.000Z',
    });
    expect(html).toContain('Finales ce soir');
    expect(html).toContain('19:00');
    expect(html).not.toContain('Saison régulière en cours');
  });

  it('garde la ligne de saison les autres jours', () => {
    const html = renderHero({
      tournamentRunning: true,
      tournamentTeamCount: 8,
    });
    expect(html).toContain('Saison régulière en cours');
    expect(html).not.toContain('Finales ce soir');
  });
});

describe('HomeHeroV2 — championnes', () => {
  const champion: HomeChampion = {
    year: 2026,
    teamName: 'Chocomates',
    teamSlug: 'chocomates',
    logoUrl: null,
    runnerUp: 'Hinode Sparkles',
    finalScore: '3–1',
    visibleUntil: '2026-12-01T00:00:00+01:00',
  };

  it('annonce la championne, le score et lie sa fiche', () => {
    const html = renderHero({ champion });
    expect(html).toContain('Championnes 2026');
    expect(html).toContain('href="/team/chocomates"');
    expect(html).toContain('Victoire 3–1 face à Hinode Sparkles');
  });

  it('remplace « finales ce soir » et la ligne de saison', () => {
    const html = renderHero({
      champion,
      tournamentRunning: true,
      tournamentTeamCount: 8,
      tournamentPath: '/tournament/ow-womens-cup-2026',
      finalsKickoff: '2026-10-23T17:00:00.000Z',
    });
    expect(html).toContain('Championnes 2026');
    expect(html).not.toContain('Finales ce soir');
    expect(html).not.toContain('Saison régulière en cours');
    // Les portes de suivi restent : classement final, résultats.
    expect(html).toContain('href="/tournament/ow-womens-cup-2026/standings"');
  });

  it('se retire seule passé sa date', () => {
    expect(isHomeChampionVisible(champion, '2026-10-23T20:30:00Z')).toBe(true);
    expect(isHomeChampionVisible(champion, '2026-12-01T00:00:00+01:00')).toBe(
      false
    );
    expect(isHomeChampionVisible(null, '2026-10-23T20:30:00Z')).toBe(false);
  });
});

describe('RegisterTeamCta — isFull fourni par la page', () => {
  it('affiche « Complet » immédiatement quand la page le sait', () => {
    const html = renderToString(
      createElement(RegisterTeamCta, {
        label: 'Inscrire mon équipe',
        isFull: true,
      })
    );
    expect(html).toContain('Complet');
    expect(html).not.toContain('href="/team/create"');
  });

  it('garde le lien quand la page sait qu’il reste des places', () => {
    const html = renderToString(
      createElement(RegisterTeamCta, {
        label: 'Inscrire mon équipe',
        isFull: false,
      })
    );
    expect(html).toContain('href="/team/create"');
    expect(html).not.toContain('Complet');
  });

  it('sans la prop, reste sur le lien tant que la réponse n’est pas connue', () => {
    const html = renderToString(
      createElement(RegisterTeamCta, { label: 'Inscrire mon équipe' })
    );
    expect(html).toContain('href="/team/create"');
  });
});
