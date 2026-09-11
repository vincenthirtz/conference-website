// La page d'une actualité (`pages/news/[slug].tsx`).
//
// Ce qui se teste ici :
//
//   - seul un article PUBLIÉ est servi : un brouillon a déjà un slug, et une
//     page ISR le rendait public et indexable à qui devinait son adresse ;
//   - une erreur Supabase LÈVE au lieu de rendre une page d'erreur : sinon
//     l'ISR met en cache une page 200 qui écrase la bonne version ;
//   - le premier rendu des commentaires est un CHARGEMENT, pas « aucun
//     commentaire », et le bouton Publier n'est pas bloqué en « Envoi… ».
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo) : les effets ne
// tournent pas, on voit exactement ce que reçoit le navigateur avant
// hydratation.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GetStaticPropsContext } from 'next';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const h = vi.hoisted(() => ({ failNews: false }));

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  // Le mock partagé ne sait pas simuler une erreur PostgREST : on intercepte
  // la table `news` quand le test le demande, le reste passe au mock.
  const failing: any = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then') return undefined;
        if (prop === 'maybeSingle')
          return async () => ({ data: null, error: { message: 'boom' } });
        return () => failing;
      },
    }
  );
  const supabaseAdmin = new Proxy(m.supabaseAdmin as any, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) =>
          h.failNews && table === 'news' ? failing : target.from(table);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import NewsSlugPage, { getStaticProps } from '@/pages/news/[slug]';
import { ToastProvider } from '@/components/Toast';
import nsNewsDetail from '@/lib/i18n/locales/fr/newsDetail';

const t = nsNewsDetail.fr;

function ctx(slug: string): GetStaticPropsContext {
  return { params: { slug } } as unknown as GetStaticPropsContext;
}

function seedNews(over: Record<string, unknown> = {}) {
  (store.news ||= []).push({
    id: 'news-1',
    slug: 'annonce',
    title: 'Annonce',
    content: 'Bonjour',
    excerpt: 'Résumé',
    tag: 'general',
    status: 'published',
    published_at: '2026-09-01T18:30:00Z',
    created_at: '2026-09-01T18:00:00Z',
    updated_at: '2026-09-02T08:00:00Z',
    image_url: null,
    teams: null,
    ...over,
  });
}

async function propsFor(slug = 'annonce') {
  const res = await getStaticProps(ctx(slug));
  if (!('props' in res)) throw new Error('attendu : props');
  return res.props;
}

beforeEach(() => {
  resetSupabaseMock();
  h.failNews = false;
});

describe('news/[slug] getStaticProps — statut', () => {
  it('sert un article publié', async () => {
    seedNews();
    expect((await propsFor()).title).toBe('Annonce');
  });

  it('renvoie 404 pour un brouillon, même avec un slug', async () => {
    seedNews({ status: 'draft' });
    const res = await getStaticProps(ctx('annonce'));
    expect(res).toMatchObject({ notFound: true });
  });

  it('renvoie 404 pour un slug inconnu', async () => {
    seedNews();
    const res = await getStaticProps(ctx('inconnu'));
    expect(res).toMatchObject({ notFound: true });
  });
});

describe('news/[slug] getStaticProps — corps rendu au build', () => {
  it('fournit le Markdown déjà rendu en HTML, pas le texte source', async () => {
    seedNews({ content: 'Du **gras**' });
    const props = await propsFor();
    expect(props.contentHtml).toBe(
      '<p class="my-5">Du <strong>gras</strong></p>'
    );
    expect(props).not.toHaveProperty('content');
  });

  it('insère ce HTML tel quel dans la page', async () => {
    seedNews({ content: 'Du **gras**' });
    const props = await propsFor();
    const html = renderToString(
      createElement(ToastProvider, null, createElement(NewsSlugPage, props))
    );
    expect(html).toContain('<p class="my-5">Du <strong>gras</strong></p>');
    expect(html).not.toContain(t.noContent);
  });

  it('affiche « pas de contenu » pour un article vide', async () => {
    seedNews({ content: '' });
    const props = await propsFor();
    expect(props.contentHtml).toBe('');
    const html = renderToString(
      createElement(ToastProvider, null, createElement(NewsSlugPage, props))
    );
    expect(html).toContain(t.noContent);
  });
});

describe('news/[slug] — SEO et dates', () => {
  it('renvoie le SEO de l’article dans props.seo', async () => {
    seedNews();
    const { seo } = await propsFor();
    expect(seo.type).toBe('article');
    expect(seo.title).toBe('Annonce');
    expect(seo.publishedTime).toBe('2026-09-01T18:30:00Z');
    expect((seo.jsonLd as Record<string, unknown>)['@type']).toBe(
      'NewsArticle'
    );
  });

  it('ne pose plus son propre <Head> (doublons og:* / canonical)', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'pages/news/[slug].tsx'),
      'utf8'
    );
    expect(src).not.toMatch(/from 'next\/head'/);
    expect(src).not.toMatch(/<meta\s+property=/);
  });

  it('date l’article dans le fuseau du site, pas celui du serveur', async () => {
    // 22 h 30 UTC le 31 août = 0 h 30 le 1er septembre à Paris.
    seedNews({ published_at: '2026-08-31T22:30:00Z' });
    const props = await propsFor();
    const html = renderToString(
      createElement(ToastProvider, null, createElement(NewsSlugPage, props))
    );
    expect(html).toContain('01/09/2026');
    expect(html).not.toContain('31/08/2026');
  });
});

describe('news/[slug] getStaticProps — erreur Supabase', () => {
  it("lève au lieu de renvoyer une page d'erreur mise en cache", async () => {
    seedNews();
    h.failNews = true;
    await expect(getStaticProps(ctx('annonce'))).rejects.toThrow(/boom/);
  });
});

describe('news/[slug] — commentaires au premier rendu', () => {
  async function renderPage() {
    seedNews();
    const props = await propsFor();
    return renderToString(
      createElement(ToastProvider, null, createElement(NewsSlugPage, props))
    );
  }

  it('annonce un chargement, pas une liste vide', async () => {
    const html = await renderPage();
    expect(html).toContain(t.commentsLoading);
    expect(html).not.toContain(t.emptyComments);
    expect(html).not.toContain(t.errFetchComments);
  });

  it("laisse le bouton Publier actif tant qu'aucun envoi n'est en cours", async () => {
    const html = await renderPage();
    expect(html).toContain(t.publish);
    expect(html).not.toContain(t.submitting);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
});
