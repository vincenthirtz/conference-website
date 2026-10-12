// tests/unit/tcgLiveUi.test.ts
//
// Les blocs publics « TCG en action » (`components/tcg/live/`) : rendu SSR
// sans DOM. On vérifie surtout que l'absence de consentement s'affiche bien
// « Une joueuse », que l'âge reste grossier, et que les blocs vides ne
// trompent pas.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import RecentPullsSection, {
  formatPullAge,
} from '../../components/tcg/live/RecentPullsSection';
import CollectorsLeaderboard from '../../components/tcg/live/CollectorsLeaderboard';
import CardOfWeekSection from '../../components/tcg/live/CardOfWeekSection';
import TeamShowcasesSection from '../../components/tcg/live/TeamShowcasesSection';
import { normalizeTcgLive } from '../../utils/tcg/useTcgLive';
import nsTcgLive from '../../lib/i18n/locales/fr/tcgLive';
import type { ShowcaseCard } from '../../utils/tcg/showcase';

const t = nsTcgLive.fr;

const card: ShowcaseCard = {
  key: 'map:kings-row',
  kind: 'map',
  slug: 'kings-row',
  name: "King's Row",
  imageUrl: null,
  rarity: 'epic',
  isFoil: false,
};

describe('âge d’un tirage, à l’écran', () => {
  it('grossier : moins d’une heure, heures, hier, jours', () => {
    expect(formatPullAge(0, t)).toBe(t.ageUnderHour);
    expect(formatPullAge(5, t)).toBe('il y a 5 h');
    expect(formatPullAge(30, t)).toBe(t.ageDays_one);
    expect(formatPullAge(24 * 4 + 3, t)).toBe('il y a 4 jours');
  });
});

describe('derniers tirages', () => {
  it('sans nom consenti : « Une joueuse »', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecentPullsSection, {
        pulls: [
          { card, collector: null, ageHours: 2 },
          { card, collector: 'Alice', ageHours: 0 },
        ],
      })
    );
    expect(html).toContain('Une joueuse l’a tirée');
    expect(html).toContain('Alice l’a tirée');
    expect(html).toContain('il y a 2 h');
  });

  it('aucun tirage : un message, pas une grille vide', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecentPullsSection, { pulls: [] })
    );
    expect(html).toContain(t.pullsEmpty);
    expect(html).not.toContain('<ul');
  });
});

describe('classement', () => {
  it('affiche rang, nom, pourcentage, et l’invitation à activer sa vitrine', () => {
    const html = renderToStaticMarkup(
      React.createElement(CollectorsLeaderboard, {
        collectors: [
          { rank: 1, name: 'Alice', owned: 9, total: 20, completion: 45 },
        ],
      })
    );
    expect(html).toContain('Alice');
    expect(html).toContain('45');
    expect(html).toContain('href="/player/tcg"');
  });

  it('vide : message, toujours l’invitation', () => {
    const html = renderToStaticMarkup(
      React.createElement(CollectorsLeaderboard, { collectors: [] })
    );
    expect(html).toContain(t.collectorsEmpty);
    expect(html).toContain(t.collectorsJoin);
  });
});

describe('carte de la semaine', () => {
  it('rien sans carte', () => {
    expect(
      renderToStaticMarkup(
        React.createElement(CardOfWeekSection, { cardOfWeek: null })
      )
    ).toBe('');
  });

  it('numéro de semaine et lien vers le catalogue', () => {
    const html = renderToStaticMarkup(
      React.createElement(CardOfWeekSection, {
        cardOfWeek: { week: '2026-W07', card },
      })
    );
    expect(html).toContain('Semaine 7');
    expect(html).toContain('href="/tcg#catalogue"');
  });
});

describe('vitrines d’équipe', () => {
  it('rien sans vitrine active', () => {
    expect(
      renderToStaticMarkup(
        React.createElement(TeamShowcasesSection, { showcases: [] })
      )
    ).toBe('');
  });

  it('une vitrine par joueuse, avec lien vers sa fiche', () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamShowcasesSection, {
        showcases: [{ userId: 'u-1', name: 'Alice', cards: [card] }],
      })
    );
    expect(html).toContain('Vitrine de Alice');
    expect(html).toContain('href="/player/u-1"');
  });
});

describe('normalisation de la réponse', () => {
  it('un champ absent ou faux vaut un bloc vide', () => {
    expect(normalizeTcgLive(null)).toEqual({
      recentPulls: [],
      collectors: [],
      cardOfWeek: null,
    });
    expect(normalizeTcgLive({ recentPulls: 'x', collectors: [] })).toEqual({
      recentPulls: [],
      collectors: [],
      cardOfWeek: null,
    });
  });
});
