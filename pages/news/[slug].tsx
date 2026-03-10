import Head from 'next/head';
import { GetServerSideProps } from 'next';
import Heading from '@/components/Typography/heading';
import Button from '@/components/Buttons/button';
import Link from 'next/link';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { useEffect, useState, Fragment, type ReactNode } from 'react';

const SITE_NAME = "OW Women's Cup";

/** Turn plain-text URLs into clickable <a> links, preserving surrounding text. */
function linkifyContent(text: string): ReactNode {
  const urlPattern = /(https?:\/\/[^\s<>"')\]]+)/g;
  const parts = text.split(urlPattern);
  if (parts.length === 1) return text;
  // split with a capturing group alternates: text, match, text, match, …
  // odd-index parts are the captured URLs
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-300 underline hover:text-purple-200 break-all"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';

function toAbsoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  if (!BASE_URL) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

const formatTagLabel = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value.replace(/-/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

type NewsPageProps = {
  title: string;
  content: string;
  slug?: string | null;
  tag?: string | null;
  excerpt?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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
      slug: data.slug || null,
      tag: data.tag || 'general',
      excerpt: data.excerpt || '',
      imageUrl: data.image_url || '',
      publishedAt: data.published_at || null,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null,
      newsId: data.id || null,
    },
  };
};

export default function NewsSlugPage({
  title,
  content,
  slug,
  tag,
  excerpt,
  imageUrl,
  publishedAt,
  createdAt,
  updatedAt,
  newsId,
  error,
}: NewsPageProps) {
  const displayDate =
    publishedAt || createdAt
      ? new Date(publishedAt || createdAt || '').toLocaleDateString('fr-FR')
      : null;
  const formattedTag = tag ? formatTagLabel(tag) : null;

  // SEO variables
  const metaTitle = title ? `${title} | ${SITE_NAME}` : `News | ${SITE_NAME}`;
  const metaDescription = excerpt || `Actualité ${SITE_NAME} : ${title}`;
  const canonical = slug && BASE_URL ? `${BASE_URL}/news/${slug}` : undefined;
  const ogImage = toAbsoluteUrl(imageUrl) || toAbsoluteUrl('/img/logos/2025-logo.png');
  const articlePublishedTime = publishedAt || createdAt || undefined;
  const articleModifiedTime = updatedAt || undefined;

  // JSON-LD Article Schema
  const articleSchema = title
    ? {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: title,
        description: metaDescription,
        image: ogImage,
        datePublished: articlePublishedTime,
        dateModified: articleModifiedTime || articlePublishedTime,
        author: {
          '@type': 'Organization',
          name: SITE_NAME,
          url: BASE_URL || 'https://owwomenscup.fr',
        },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          logo: {
            '@type': 'ImageObject',
            url: `${BASE_URL || 'https://owwomenscup.fr'}/img/logos/2025-logo.png`,
          },
        },
        mainEntityOfPage: canonical,
        inLanguage: 'fr-FR',
      }
    : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20">
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        {canonical && <link rel="canonical" href={canonical} />}

        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:locale" content="fr_FR" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        {canonical && <meta property="og:url" content={canonical} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:alt" content={title || 'News'} />}
        {articlePublishedTime && (
          <meta property="article:published_time" content={articlePublishedTime} />
        )}
        {articleModifiedTime && (
          <meta property="article:modified_time" content={articleModifiedTime} />
        )}
        <meta property="article:author" content={SITE_NAME} />
        {tag && <meta property="article:tag" content={tag} />}

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@OWWomensCup" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}

        {/* JSON-LD Structured Data */}
        {articleSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(articleSchema),
            }}
          />
        )}
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
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-blue-200/80">
                <span>{displayDate || 'News'}</span>
                {formattedTag && (
                  <span className="px-3 py-1 rounded-full border border-blue-300/40 bg-blue-500/10 text-[10px] tracking-[0.14em] text-blue-100">
                    {formattedTag}
                  </span>
                )}
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
              {content ? linkifyContent(content) : 'Pas de contenu pour cette news.'}
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
  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState('');

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
          honeypot,
          captcha,
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
            <input
              type="text"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
              placeholder="Tapez OWC (anti-robot)"
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:border-purple-400/70 transition"
            />
            {/* Honeypot anti-bot */}
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
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
