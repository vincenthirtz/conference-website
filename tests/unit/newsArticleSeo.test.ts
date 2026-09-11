// SEO d'une actualité, émis par DefaultSeo via `props.seo` (une seule série
// de balises og:* / canonical, au lieu de celles de la page PLUS celles de
// DefaultSeo).

import { describe, it, expect } from 'vitest';

import {
  buildNewsArticleSeo,
  type NewsArticleSeoInput,
} from '@/utils/news/newsArticleSeo';

function input(over: Partial<NewsArticleSeoInput> = {}): NewsArticleSeoInput {
  return {
    title: 'Le calendrier est en ligne',
    slug: 'calendrier',
    excerpt: 'Huit équipes, sept journées.',
    imageUrl: '/img/teams-images/choco.png',
    publishedAt: '2026-08-31T18:00:00Z',
    createdAt: '2026-08-30T10:00:00Z',
    updatedAt: '2026-09-01T08:00:00Z',
    ...over,
  };
}

describe('buildNewsArticleSeo', () => {
  it('produit un SEO de type article, titre nu (DefaultSeo ajoute le site)', () => {
    const seo = buildNewsArticleSeo(input());
    expect(seo.type).toBe('article');
    expect(seo.title).toBe('Le calendrier est en ligne');
    expect(seo.description).toBe('Huit équipes, sept journées.');
    expect(seo.publishedTime).toBe('2026-08-31T18:00:00Z');
    expect(seo.modifiedTime).toBe('2026-09-01T08:00:00Z');
  });

  it('rend l’image absolue, et retombe sur la carte de marque', () => {
    expect(buildNewsArticleSeo(input()).image).toMatch(
      /^https?:\/\/[^/]+\/img\/teams-images\/choco\.png$/
    );
    expect(buildNewsArticleSeo(input({ imageUrl: null })).image).toMatch(
      /\/img\/og-cover\.png$/
    );
  });

  it('retombe sur la date de création sans date de publication', () => {
    const seo = buildNewsArticleSeo(
      input({ publishedAt: null, updatedAt: null })
    );
    expect(seo.publishedTime).toBe('2026-08-30T10:00:00Z');
    expect(seo).not.toHaveProperty('modifiedTime');
  });

  it('traduit la description de repli quand il n’y a pas de chapô', () => {
    const seo = buildNewsArticleSeo(input({ excerpt: null }));
    expect(seo.description).toEqual({
      fr: "Actualité OW Women's Cup : Le calendrier est en ligne",
      en: "OW Women's Cup news: Le calendrier est en ligne",
    });
  });

  it('porte un JSON-LD NewsArticle complet', () => {
    const jsonLd = buildNewsArticleSeo(input()).jsonLd as Record<
      string,
      unknown
    >;
    expect(jsonLd['@type']).toBe('NewsArticle');
    expect(jsonLd.headline).toBe('Le calendrier est en ligne');
    expect(jsonLd.datePublished).toBe('2026-08-31T18:00:00Z');
    expect(jsonLd.dateModified).toBe('2026-09-01T08:00:00Z');
    expect(jsonLd.mainEntityOfPage).toMatch(/\/news\/calendrier$/);
  });
});
