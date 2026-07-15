import Head from 'next/head';
import Image from 'next/image';
import { GetStaticPaths, GetStaticProps } from 'next';
import Heading from '@/components/Typography/heading';
import Button from '@/components/Buttons/button';
import Link from 'next/link';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useEffect, useRef, useState, Fragment, type ReactNode } from 'react';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

import { logger } from '../../utils/logger';
const SITE_NAME = "OW Women's Cup";

// Idempotency-Key pour le POST de commentaire (public/anonyme). Stable par
// intention tant que la publication n'a pas réussi : double-submit / retry
// réseau renvoie la même clé.
function genIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
        className="text-[var(--color-violet-light)] underline hover:text-[var(--color-violet)] break-all"
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

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<NewsPageProps> = async (
  context
) => {
  const slug = context.params?.slug;
  if (!slug || Array.isArray(slug) || !supabaseAdmin) {
    return { notFound: true, revalidate: 60 };
  }

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const { data, error } = await supabaseAdmin
    .from('news')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logger.error('[news slug] fetch error', error);
    return {
      props: {
        title: '',
        content: '',
        error: 'Impossible de charger cette news.',
      },
      revalidate: 60,
    };
  }

  if (!data) {
    return { notFound: true, revalidate: 60 };
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
    revalidate: 300,
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
  const t = useT('newsDetail');
  const locale = useLocale();
  const displayDate =
    publishedAt || createdAt
      ? new Date(publishedAt || createdAt || '').toLocaleDateString(locale)
      : null;
  const formattedTag = tag ? formatTagLabel(tag) : null;

  // SEO variables
  const metaTitle = title ? `${title} | ${SITE_NAME}` : `News | ${SITE_NAME}`;
  const metaDescription = excerpt || `Actualité ${SITE_NAME} : ${title}`;
  const canonical = slug && BASE_URL ? `${BASE_URL}/news/${slug}` : undefined;
  const ogImage =
    toAbsoluteUrl(imageUrl) || toAbsoluteUrl('/img/logos/2025-logo.png');
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
          <meta
            property="article:published_time"
            content={articlePublishedTime}
          />
        )}
        {articleModifiedTime && (
          <meta
            property="article:modified_time"
            content={articleModifiedTime}
          />
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
          className="text-sm text-[var(--color-violet-light)] hover:text-[var(--color-violet)]"
        >
          {t.backHome}
        </Link>

        {error ? (
          <div className="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-100">
            {error}
          </div>
        ) : (
          <article>
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-[var(--color-green)]/90">
                {articlePublishedTime ? (
                  <time dateTime={articlePublishedTime}>
                    {displayDate || t.newsLabel}
                  </time>
                ) : (
                  <span>{displayDate || t.newsLabel}</span>
                )}
                {formattedTag && (
                  <span className="px-3 py-1 rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 text-[10px] tracking-[0.14em] text-[var(--color-green-light)]">
                    {formattedTag}
                  </span>
                )}
              </div>
              <Heading
                level="h1"
                typeStyle="heading-md"
                className="text-brand-gradient"
              >
                {title}
              </Heading>
              <span className="brand-rule mt-1" aria-hidden />
              {imageUrl && (
                <Image
                  src={imageUrl}
                  alt=""
                  width={1200}
                  height={630}
                  priority
                  sizes="(max-width:768px) 100vw, 800px"
                  className="mt-4 w-full rounded-2xl border border-white/10 object-cover aspect-[1200/630]"
                />
              )}
            </div>

            <div className="mt-8 space-y-4 text-lg leading-relaxed text-gray-100 whitespace-pre-wrap">
              {content ? linkifyContent(content) : t.noContent}
            </div>

            <div className="mt-10">
              <Link
                href="/api/news/rss"
                target="_blank"
                rel="noreferrer noopener"
              >
                <Button type="button" className="px-6 h-[48px]">
                  {t.rssFeed}
                </Button>
              </Link>
            </div>

            {newsId && <Comments newsId={newsId} />}
          </article>
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
  const t = useT('newsDetail');
  const locale = useLocale();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const { addToast } = useToast();
  const idempotencyKeyRef = useRef<string>(genIdempotencyKey());

  const loadCaptcha = async () => {
    try {
      const res = await fetch('/api/captcha');
      if (res.ok) {
        const json = await res.json();
        setCaptchaToken(json.token);
        setCaptchaQuestion(json.question);
        setCaptchaAnswer('');
      }
    } catch {
      // silent — form still works, server will reject invalid captcha
    }
  };

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news/comments?newsId=${newsId}`);
      if (!res.ok) throw new Error(t.errFetchComments);
      const json = await res.json();
      setComments(json.items || []);
    } catch (err: unknown) {
      setError((err as Error)?.message || t.errLoadComments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
    loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit.
    if (loading) return;
    if (content.trim().length < 3) {
      setError(t.errTooShort);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/news/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          newsId,
          content: content.trim(),
          authorName: author.trim() || null,
          honeypot,
          captchaToken,
          captchaAnswer: captchaAnswer.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || t.errPublish);
      }
      // Publication réussie : nouvelle clé pour un prochain commentaire.
      idempotencyKeyRef.current = genIdempotencyKey();
      setContent('');
      setAuthor('');
      await Promise.all([loadComments(), loadCaptcha()]);
      addToast(t.published, 'success');
    } catch (err: unknown) {
      // Le captcha est à usage unique : on régénère la clé d'idempotence en même
      // temps que le challenge pour que le retry soit une intention propre.
      idempotencyKeyRef.current = genIdempotencyKey();
      const message = (err as Error)?.message || t.errPublishGeneric;
      setError(message);
      addToast(message, 'error');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-12 card-brand rounded-2xl bg-white/5 p-6 space-y-4">
      <Heading typeStyle="heading-sm" className="text-brand-gradient">
        {t.commentsTitle}
      </Heading>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_0.6fr]">
          <div>
            <label htmlFor="comment-content" className="sr-only">
              {t.commentContentSrLabel}
            </label>
            <textarea
              id="comment-content"
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t.commentPlaceholder}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70 focus:border-[var(--color-violet)]/70 transition"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="comment-author" className="sr-only">
              {t.commentAuthorSrLabel}
            </label>
            <input
              id="comment-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t.authorPlaceholder}
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70 focus:border-[var(--color-violet)]/70 transition"
            />
            <label htmlFor="comment-captcha" className="sr-only">
              {captchaQuestion
                ? format(t.captchaSrLabel, { question: captchaQuestion })
                : t.captchaSrLabelFallback}
            </label>
            <input
              id="comment-captcha"
              type="text"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              placeholder={
                captchaQuestion
                  ? format(t.captchaPlaceholder, { question: captchaQuestion })
                  : t.captchaLoading
              }
              className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70 focus:border-[var(--color-violet)]/70 transition"
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
              {loading ? t.submitting : t.publish}
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
          <p className="p-4 text-sm text-gray-400">{t.emptyComments}</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{c.author_name || t.anonymous}</span>
              <span className="text-gray-600">·</span>
              <span>
                {new Date(c.created_at).toLocaleString(locale, {
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
