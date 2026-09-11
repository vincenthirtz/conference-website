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
