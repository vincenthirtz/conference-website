import Image from 'next/image';
import { GetStaticPaths, GetStaticProps } from 'next';
import Heading from '@/components/Typography/heading';
import Button from '@/components/Buttons/button';
import Link from 'next/link';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveNewsImage } from '@/utils/news/newsImage';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useEffect, useRef, useState } from 'react';
// Serveur seulement : n'est appelé que dans getStaticProps, que Next retire
// du bundle navigateur avec ses imports (react-markdown + remark-gfm).
import { renderNewsMarkdown } from '@/utils/news/renderNewsMarkdown';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatSiteDate } from '@/utils/timezone';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
// Serveur seulement, comme renderNewsMarkdown (appelé dans getStaticProps).
import { buildNewsArticleSeo } from '@/utils/news/newsArticleSeo';

import { logger } from '../../utils/logger';
import nsNewsDetail from '@/lib/i18n/locales/fr/newsDetail';
import nsNewsTags from '@/lib/i18n/locales/fr/newsTags';
import { newsTagLabel } from '@/utils/news/newsTag';
import ArticleHero from '@/components/News/ArticleHero';
import ShareArticle from '@/components/News/ShareArticle';
import RelatedNews, { type RelatedItem } from '@/components/News/RelatedNews';

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

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';

type NewsPageProps = {
  /** SEO par-article, émis par DefaultSeo (cf. utils/news/newsArticleSeo). */
  seo: SeoProps;
  title: string;
  /**
   * Corps de l'article, Markdown déjà rendu en HTML par getStaticProps (cf.
   * utils/news/renderNewsMarkdown.tsx — texte échappé, pas de HTML brut).
   * Chaîne vide si l'article n'a pas de contenu.
   */
  contentHtml: string;
  slug?: string | null;
  tag?: string | null;
  imageUrl?: string | null;
  /** `imageUrl` est un logo (équipe ou tournoi) → cadrage `contain`. */
  imageFitContain?: boolean;
  publishedAt?: string | null;
  createdAt?: string | null;
  newsId?: string | null;
  related?: RelatedItem[];
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
    // `teams(logo_url)` : l'illustration se dérive de l'équipe liée quand
    // l'article n'a pas d'image propre (cf. utils/news/newsImage.ts).
    .select('*, teams(logo_url)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('slug', slug)
    // Un brouillon a déjà un slug : sans ce filtre, il était public et indexé
    // (JSON-LD compris) dès qu'on devinait ou partageait son adresse. Aucun
    // parcours admin ne prévisualise par cette page — l'éditeur n'y renvoie
    // pas. Un article dépublié tombe en 404 à la revalidation suivante.
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    // On LÈVE plutôt que de rendre une page d'erreur : une page renvoyée ici
    // partait en cache ISR, en 200, et remplaçait la bonne version de
    // l'article jusqu'à la revalidation suivante. Une exception, elle, laisse
    // Next servir la dernière version valide (et un 500 non mis en cache si
    // l'article n'a encore jamais été généré).
    logger.error('[news slug] fetch error', error);
    throw new Error(`[news slug] fetch error: ${error.message}`);
  }

  if (!data) {
    return { notFound: true, revalidate: 60 };
  }

  // « À lire aussi » : la page était un cul-de-sac. Quelqu'un qui arrive d'un
  // partage repartait sans savoir qu'il y a d'autres actualités.
  const { data: relatedRows } = await supabaseAdmin
    .from('news')
    .select('id, slug, title, tag, image_url, published_at, teams(logo_url)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'published')
    .neq('id', data.id)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(3);

  const related: RelatedItem[] = (relatedRows ?? []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    tag: row.tag ?? null,
    imageUrl: resolveNewsImage(row.image_url, row.teams).url,
    publishedAt: row.published_at ?? null,
  }));

  const heroImage = resolveNewsImage(data.image_url, data.teams);

  return {
    props: {
      seo: buildNewsArticleSeo({
        title: data.title || '',
        slug: data.slug || null,
        excerpt: data.excerpt || null,
        imageUrl: heroImage.url || null,
        publishedAt: data.published_at || null,
        createdAt: data.created_at || null,
        updatedAt: data.updated_at || null,
      }),
      title: data.title || '',
      contentHtml: renderNewsMarkdown(data.content),
      slug: data.slug || null,
      tag: data.tag || 'general',
      imageUrl: heroImage.url || '',
      imageFitContain: heroImage.fitContain,
      publishedAt: data.published_at || null,
      createdAt: data.created_at || null,
      newsId: data.id || null,
      related,
    },
    revalidate: 300,
  };
};

export default function NewsSlugPage({
  title,
  contentHtml,
  slug,
  tag,
  imageUrl,
  imageFitContain,
  publishedAt,
  createdAt,
  newsId,
  related = [],
}: NewsPageProps) {
  const t = useT(nsNewsDetail);
  const tagLabels = useT(nsNewsTags);
  const locale = useLocale();
  const { lang } = useLang();
  // Pas de <Head> ici : titre, og:*, canonical et JSON-LD viennent de
  // `props.seo`, émis une seule fois par DefaultSeo. La page posait les siens
  // en plus, et next/head ne dédoublonne pas les balises `property`.
  const articlePublishedTime = publishedAt || createdAt || undefined;
  // Fuseau du site, pas celui du serveur : rendu en UTC sur Netlify, un
  // article publié à 0 h 30 heure de Paris affichait la veille, puis
  // l'hydratation corrigeait (mismatch React).
  const displayDate =
    formatSiteDate(articlePublishedTime, lang, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) || null;
  const formattedTag = newsTagLabel(tag, tagLabels);
  const canonical = slug && BASE_URL ? `${BASE_URL}/news/${slug}` : undefined;

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20">
      {/* Colonne de lecture. L'article s'affichait sur 1 200 px, soit près de
          145 caractères par ligne — bien au-delà des ~75 où l'œil retrouve
          encore le début de la ligne suivante sans effort.

          PAS de classe `container` ici : `styles/globals.css` lui impose
          `max-width: 1200px`, qui l'emporte sur tout `max-w-*` de Tailwind
          posé à côté. Le `max-w-4xl` qui figurait sur cette page n'a donc
          jamais rien fait. On compose la colonne à la main. */}
      <div className="mx-auto w-full max-w-[46rem] px-4 pt-24">
        <Link
          href="/"
          className="text-sm text-[var(--color-violet-light)] hover:text-[var(--color-violet)]"
        >
          {t.backHome}
        </Link>

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
              <ArticleHero
                src={imageUrl}
                alt=""
                forceContain={imageFitContain}
              />
            )}
          </div>

          {contentHtml ? (
            <div
              className="mt-8 text-[1.0625rem] leading-[1.75] text-gray-200 sm:text-lg"
              // HTML produit au build par renderNewsMarkdown : même rendu
              // React qu'avant (texte échappé, URLs dangereuses neutralisées),
              // exécuté côté serveur au lieu du navigateur.
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          ) : (
            <div className="mt-8 text-[1.0625rem] leading-[1.75] text-gray-200 sm:text-lg">
              {t.noContent}
            </div>
          )}

          <ShareArticle
            url={canonical ?? null}
            title={title}
            labels={{
              title: t.shareTitle,
              onBluesky: t.shareBluesky,
              onX: t.shareX,
              onFacebook: t.shareFacebook,
              copyLink: t.shareCopy,
              copied: t.shareCopied,
              allNews: t.allNews,
              rss: t.rssFeed,
            }}
          />

          <RelatedNews items={related} title={t.relatedTitle} locale={locale} />

          {newsId && <Comments newsId={newsId} />}
        </article>
      </div>
    </div>
  );
}

// Repli statique (pré-rendu dégradé, avant que `_app.tsx` ait
// `pageProps.seo`). En pratique l'ISR fournit toujours le SEO de l'article.
NewsSlugPage.seo = {
  title: { fr: 'Actualité', en: 'News' },
  type: 'article',
} satisfies SeoProps;

type Comment = {
  id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

function Comments({ newsId }: { newsId: string }) {
  const t = useT(nsNewsDetail);
  const { lang } = useLang();
  const [comments, setComments] = useState<Comment[]>([]);
  // La LISTE et l'ENVOI ont chacun leur état. Un seul `loading` partagé
  // affichait « Aucun commentaire » pendant le chargement comme après un
  // échec, et désactivait le bouton Publier (« Envoi… ») dès le montage.
  // `listLoading` part à `true` : le premier rendu (SSR compris) est un
  // chargement, pas une liste vide.
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const { addToast } = useToast();
  const idempotencyKeyRef = useRef<string>(genIdempotencyKey());
  const captchaRequestedRef = useRef(false);

  const loadCaptcha = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/captcha');
      if (!res.ok) return false;
      const json = await res.json();
      setCaptchaToken(json.token);
      setCaptchaQuestion(json.question);
      setCaptchaAnswer('');
      return true;
    } catch {
      // silent — form still works, server will reject invalid captcha
      return false;
    }
  };

  // Captcha demandé au premier focus du formulaire, pas au montage : chaque
  // lecture de l'article coûtait une invocation /api/captcha (no-store) pour
  // un formulaire que presque personne n'utilise. Même modèle que
  // components/NewsletterSignup.tsx. En cas d'échec, le focus suivant retente.
  const ensureCaptcha = () => {
    if (captchaRequestedRef.current) return;
    captchaRequestedRef.current = true;
    void loadCaptcha().then((ok) => {
      if (!ok) captchaRequestedRef.current = false;
    });
  };

  const loadComments = async () => {
    setListLoading(true);
    setListError(false);
    try {
      const res = await fetch(
        `/api/news/comments?newsId=${encodeURIComponent(newsId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setComments(json.items || []);
    } catch {
      // Message traduit côté rendu : celui de l'exception (« Failed to
      // fetch »…) n'est ni localisé ni utile au lecteur.
      setListError(true);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit.
    if (submitting) return;
    if (content.trim().length < 3) {
      setFormError(t.errTooShort);
      return;
    }
    setSubmitting(true);
    setFormError(null);
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
        // On traduit le CODE, jamais le message du serveur : celui-ci est
        // technique (et l'était en français), donc illisible ou hors langue
        // pour la lectrice. Code inconnu ⇒ message générique traduit.
        const byCode: Record<string, string> = {
          BOT_DETECTED: t.errPublish,
          CAPTCHA_INVALID: t.errCaptcha,
          CONTENT_TOO_SHORT: t.errTooShort,
          CONTENT_TOO_LONG: t.errTooLong,
          AUTHOR_TOO_LONG: t.errAuthorTooLong,
          NEWS_NOT_FOUND: t.errArticleNotFound,
          COMMENTS_CLOSED: t.errCommentsClosed,
        };
        throw new Error(byCode[json?.code as string] || t.errPublish);
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
      setFormError(message);
      addToast(message, 'error');
      await loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-12 card-brand rounded-2xl bg-white/5 p-6 space-y-4">
      <Heading typeStyle="heading-sm" className="text-brand-gradient">
        {t.commentsTitle}
      </Heading>

      {/* `onFocus` remonte depuis les champs (React l'écoute en focusin). */}
      <form
        onSubmit={handleSubmit}
        onFocus={ensureCaptcha}
        className="space-y-3"
      >
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
              disabled={submitting}
              className="w-full h-[40px] justify-center text-sm px-3"
            >
              {submitting ? t.submitting : t.publish}
            </Button>
          </div>
        </div>
        {formError && (
          <p
            role="alert"
            className="text-sm text-red-300 border border-red-500/40 bg-red-500/10 rounded-lg px-3 py-2"
          >
            {formError}
          </p>
        )}
      </form>

      <div
        aria-busy={listLoading}
        className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/40"
      >
        {/* « Aucun commentaire » seulement quand la liste est CHARGÉE sans
            erreur. Pendant un rechargement (après publication), la liste
            déjà affichée reste en place au lieu de clignoter. */}
        {listLoading && comments.length === 0 && (
          <p role="status" className="p-4 text-sm text-gray-400">
            {t.commentsLoading}
          </p>
        )}
        {!listLoading && listError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-red-200"
          >
            <span>{t.errFetchComments}</span>
            <button
              type="button"
              onClick={() => void loadComments()}
              className="rounded-lg border border-white/20 px-3 py-1 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]/70"
            >
              {t.retryComments}
            </button>
          </div>
        )}
        {!listLoading && !listError && comments.length === 0 && (
          <p className="p-4 text-sm text-gray-400">{t.emptyComments}</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{c.author_name || t.anonymous}</span>
              <span className="text-gray-600">·</span>
              <span>
                {formatSiteDate(c.created_at, lang, {
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
