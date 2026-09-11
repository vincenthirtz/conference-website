// La page d'une actualité (`pages/news/[slug].tsx`), côté getStaticProps.
//
// Ce qui se teste ici :
//
//   - seul un article PUBLIÉ est servi : un brouillon a déjà un slug, et une
//     page ISR le rendait public et indexable à qui devinait son adresse.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GetStaticPropsContext } from 'next';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { getStaticProps } from '@/pages/news/[slug]';

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

beforeEach(() => {
  resetSupabaseMock();
});

describe('news/[slug] getStaticProps — statut', () => {
  it('sert un article publié', async () => {
    seedNews();
    const res = await getStaticProps(ctx('annonce'));
    expect('props' in res && res.props.title).toBe('Annonce');
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
