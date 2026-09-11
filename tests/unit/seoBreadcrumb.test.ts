import { describe, it, expect } from 'vitest';
import {
  buildBreadcrumbSchema,
  hasBreadcrumbList,
} from '@/components/Seo/breadcrumb';

const BASE = 'https://owwomenscup.fr';

function trail(path: string, route: string, title?: string) {
  const schema = buildBreadcrumbSchema({ path, route, title, baseUrl: BASE });
  return schema?.itemListElement.map((i) => [i.name, i.item]) ?? null;
}

describe('buildBreadcrumbSchema', () => {
  it('ne produit rien pour la home', () => {
    expect(trail('/', '/')).toBeNull();
  });

  it('page simple : Accueil › titre', () => {
    expect(trail('/about', '/about', 'À propos')).toEqual([
      ['Accueil', BASE],
      ['À propos', `${BASE}/about`],
    ]);
  });

  it('numérote les positions à partir de 1', () => {
    const schema = buildBreadcrumbSchema({
      path: '/news/mon-article',
      route: '/news/[slug]',
      title: 'Mon article',
      baseUrl: BASE,
    });
    expect(schema?.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it('mappe /tournament vers la vraie liste /tournaments et omet l’id brut', () => {
    const id = '3f2b8c1e-9a4d-4e57-8b21-0c6d5e7f8a90';
    expect(
      trail(
        `/tournament/${id}/bracket`,
        '/tournament/[id]/bracket',
        'Bracket – Cup 2026'
      )
    ).toEqual([
      ['Accueil', BASE],
      ['Tournois', `${BASE}/tournaments`],
      ['Bracket – Cup 2026', `${BASE}/tournament/${id}/bracket`],
    ]);
  });

  it('n’émet aucun intermédiaire pour /team et /match (pas de page index)', () => {
    expect(trail('/team/les-lionnes', '/team/[slug]', 'Les Lionnes')).toEqual([
      ['Accueil', BASE],
      ['Les Lionnes', `${BASE}/team/les-lionnes`],
    ]);
    expect(
      trail('/match/abc/games', '/match/[id]/games', 'Détail des manches')
    ).toEqual([
      ['Accueil', BASE],
      ['Détail des manches', `${BASE}/match/abc/games`],
    ]);
  });

  it('news : passe par la liste /news', () => {
    expect(trail('/news/mon-article', '/news/[slug]', 'Mon article')).toEqual([
      ['Accueil', BASE],
      ['Actualités', `${BASE}/news`],
      ['Mon article', `${BASE}/news/mon-article`],
    ]);
  });

  it('scrim : l’intermédiaire est /scrims', () => {
    expect(trail('/scrim/42', '/scrim/[id]', 'Scrim A vs B')?.[1]).toEqual([
      'Scrims',
      `${BASE}/scrims`,
    ]);
  });

  it('dernier segment dynamique sans titre : omis, jamais le slug brut', () => {
    expect(trail('/news/mon-article', '/news/[slug]')).toEqual([
      ['Accueil', BASE],
      ['Actualités', `${BASE}/news`],
    ]);
    expect(trail('/team/les-lionnes', '/team/[slug]')).toBeNull();
  });

  it('dernier segment statique sans titre : mis en forme', () => {
    expect(trail('/plan-du-site', '/plan-du-site')).toEqual([
      ['Accueil', BASE],
      ['Plan du site', `${BASE}/plan-du-site`],
    ]);
  });

  it('ne duplique pas une liste qui est aussi la page courante', () => {
    expect(trail('/news', '/news', 'Actualités du site')).toEqual([
      ['Accueil', BASE],
      ['Actualités du site', `${BASE}/news`],
    ]);
  });

  it('ignore query et hash', () => {
    expect(trail('/about?x=1#top', '/about', 'À propos')?.[1]).toEqual([
      'À propos',
      `${BASE}/about`,
    ]);
  });

  it('pages d’erreur et routes non alignées : pas de fil', () => {
    expect(trail('/nimporte/quoi', '/404', 'Page introuvable')).toBeNull();
    expect(trail('/a/b/c', '/a/[...rest]', 'X')).toBeNull();
  });

  it('sans baseUrl : pas de fil', () => {
    expect(
      buildBreadcrumbSchema({ path: '/about', route: '/about', baseUrl: '' })
    ).toBeNull();
  });
});

describe('hasBreadcrumbList', () => {
  it('détecte un BreadcrumbList fourni par la page', () => {
    expect(hasBreadcrumbList(undefined)).toBe(false);
    expect(hasBreadcrumbList({ '@type': 'SportsEvent' })).toBe(false);
    expect(
      hasBreadcrumbList([
        { '@type': 'SportsEvent' },
        { '@type': 'BreadcrumbList' },
      ])
    ).toBe(true);
    expect(hasBreadcrumbList({ '@type': ['Thing', 'BreadcrumbList'] })).toBe(
      true
    );
    expect(
      hasBreadcrumbList({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'BreadcrumbList' }],
      })
    ).toBe(true);
  });
});
