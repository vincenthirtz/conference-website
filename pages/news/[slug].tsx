import Head from 'next/head';
import { GetServerSideProps } from 'next';
import Paragraph from '@/components/Typography/paragraph';
import Heading from '@/components/Typography/heading';
import Button from '@/components/Buttons/button';
import Link from 'next/link';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { useEffect, useState } from 'react';

type NewsPageProps = {
  title: string;
  content: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  newsId?: string | null;
  error?: string | null;
};

export const getServerSideProps: GetServerSideProps<NewsPageProps> = async (
  context
) => {
  const slug = context.params?.slug;
  if (!slug || Array.isArray(slug)) {
    return { notFound: true, props: { title: '', content: '' } };
  }

  const client = supabaseAdmin ?? getServerClient(context.req, context.res);

  const { data, error } = await client
    .from('news')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('[news slug] fetch error', error);
    return {
      props: {
        title: '',
        content: '',
        error: 'Impossible de charger cette news.',
      },
    };
  }

  if (!data) {
    return { notFound: true, props: { title: '', content: '' } };
  }

  return {
    props: {
      title: data.title || '',
      content: data.content || '',
      excerpt: data.excerpt || '',
      imageUrl: data.image_url || '',
      publishedAt: data.published_at || null,
      createdAt: data.created_at || null,
      newsId: data.id || null,
    },
  };
};

export default function NewsSlugPage({
  title,
  content,
  excerpt,
  imageUrl,
  publishedAt,
  createdAt,
  newsId,
  error,
}: NewsPageProps) {
  const displayDate =
    publishedAt || createdAt
      ? new Date(publishedAt || createdAt || '').toLocaleDateString('fr-FR')
      : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20">
      <Head>
        <title>{title ? `${title} | OW Women's Cup` : 'News'}</title>
        {excerpt && <meta name="description" content={excerpt} />}
      </Head>
      <div className="container max-w-4xl px-4 pt-24">
        <Link
          href="/"
          className="text-sm text-purple-200 hover:text-purple-100"
        >
          ← Retour à l&apos;accueil
        </Link>

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-100">
            {error}
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-3">
              <div className="text-xs uppercase tracking-[0.16em] text-blue-200/80">
                {displayDate || 'News'}
              </div>
              <Heading typeStyle="heading-md" className="text-gradient">
                {title}
              </Heading>
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={title}
                  className="mt-4 w-full rounded-2xl border border-white/10 object-cover"
                />
              )}
            </div>

            <div className="mt-8 space-y-4 text-lg leading-relaxed text-gray-100 whitespace-pre-wrap">
              {content || 'Pas de contenu pour cette news.'}
            </div>

            <div className="mt-10">
              <Link
                href="/api/news/rss"
                target="_blank"
                rel="noreferrer noopener"
              >
                <Button type="button" className="px-6 h-[48px]">
                  Flux RSS
                </Button>
              </Link>
            </div>

            {newsId && <Comments newsId={newsId} />}
          </>
        )}
      </div>
    </div>
  );
}

type Comment = {
  id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

function Comments({ newsId }: { newsId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news/comments?newsId=${newsId}`);
      if (!res.ok) throw new Error('Impossible de récupérer les commentaires');
      const json = await res.json();
      setComments(json.items || []);
    } catch (err: any) {
      setError(err?.message || 'Erreur chargement commentaires');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 3) {
      setError('Le commentaire doit contenir au moins 3 caractères.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/news/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsId,
          content: content.trim(),
          authorName: author.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Impossible de publier le commentaire');
      }
      setContent('');
      setAuthor('');
      await loadComments();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la publication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
      <Heading typeStyle="heading-sm" className="text-white">
        Commentaires
      </Heading>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_0.6fr]">
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Partage ton avis..."
            className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:border-purple-400/70 transition"
          />
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Nom (optionnel)"
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:border-purple-400/70 transition"
            />
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-[40px] justify-center text-sm px-3"
            >
              {loading ? 'Envoi...' : 'Publier'}
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-300 border border-red-500/40 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </form>

      <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/40">
        {comments.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            Aucun commentaire pour le moment.
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{c.author_name || 'Anonyme'}</span>
              <span className="text-gray-600">·</span>
              <span>
                {new Date(c.created_at).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <p className="text-sm text-gray-100 whitespace-pre-wrap">
              {c.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
