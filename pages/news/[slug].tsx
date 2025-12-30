import Head from 'next/head';
import { GetServerSideProps } from 'next';
import Paragraph from '@/components/Typography/paragraph';
import Heading from '@/components/Typography/heading';
import Button from '@/components/Buttons/button';
import Link from 'next/link';
import { supabaseAdmin } from '@/utils/supabase';

type NewsPageProps = {
  title: string;
  content: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  error?: string | null;
};

export const getServerSideProps: GetServerSideProps<NewsPageProps> = async (
  context
) => {
  const slug = context.params?.slug;
  if (!slug || Array.isArray(slug)) {
    return { notFound: true, props: { title: '', content: '' } };
  }

  if (!supabaseAdmin) {
    return {
      props: {
        title: '',
        content: '',
        error: 'Service indisponible, réessaie plus tard.',
      },
    };
  }

  const { data, error } = await supabaseAdmin
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
              {excerpt && (
                <Paragraph textColor="text-gray-200" className="text-lg">
                  {excerpt}
                </Paragraph>
              )}
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
          </>
        )}
      </div>
    </div>
  );
}
