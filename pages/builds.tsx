import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Button from '@/components/Buttons/button';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

type BuildsDict = ReturnType<typeof useT<'buildsPage'>>;

type Build = {
  id: string;
  state: string;
  error: string | null;
  created_at: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  deploy_time: number | null;
  commit_ref: string | null;
  commit_url: string | null;
  commit_message?: string | null;
  title: string | null;
  branch: string | null;
  context: string | null;
  deploy_url?: string | null;
  review_id?: string | null;
  review_url?: string | null;
  user_id?: string | null;
  user_name?: string | null;
};

function computeStatus(build: Build) {
  const s = (build.state || '').toLowerCase();
  const successStates = ['ready', 'done', 'success', 'published'];
  const errorStates = ['error', 'failed', 'timeout', 'canceled', 'cancelled'];

  if (build.error || errorStates.includes(s)) {
    return 'error';
  }

  if (
    successStates.includes(s) ||
    (!s && build.deploy_time !== null && build.error === null)
  ) {
    return 'success';
  }

  return 'pending';
}

function StatusBadge({ build }: { build: Build }) {
  const t = useT('buildsPage');
  const status = computeStatus(build);

  if (status === 'success') {
    return (
      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-500/40 text-[12px]">
        {t.badgeSuccess}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="px-3 py-1 rounded-full bg-red-500/15 text-red-100 border border-red-500/40 text-[12px]">
        {t.badgeFailed}
      </span>
    );
  }

  return (
    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-500/40 text-[12px]">
      {t.badgeSuccess}
    </span>
  );
}

type BuildsPageProps = {
  builds: Build[];
  error: string | null;
};

export const getStaticProps: GetStaticProps<BuildsPageProps> = async () => {
  const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
  const NETLIFY_API_TOKEN = process.env.NETLIFY_API_TOKEN;

  if (!NETLIFY_SITE_ID || !NETLIFY_API_TOKEN) {
    return {
      props: { builds: [], error: 'Service unavailable.' },
      revalidate: 300,
    };
  }

  try {
    const apiRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/builds?per_page=20`,
      { headers: { Authorization: `Bearer ${NETLIFY_API_TOKEN}` } }
    );

    if (!apiRes.ok) {
      return {
        props: { builds: [], error: `Erreur ${apiRes.status}` },
        revalidate: 60,
      };
    }

    const raw = (await apiRes.json()) as any[];
    const builds: Build[] = raw.map((b) => ({
      id: b.id,
      state: b.state,
      error: b.error || null,
      created_at: b.created_at || null,
      updated_at: b.updated_at || null,
      published_at: b.published_at || null,
      deploy_time: b.deploy_time ?? null,
      commit_ref: b.commit_ref || null,
      commit_url: b.commit_url || null,
      commit_message: b.commit_message || null,
      title: b.title || null,
      branch: b.branch || null,
      context: b.context || null,
      deploy_url: b.deploy_url || null,
      review_id: b.review_id || null,
      review_url: b.review_url || null,
      user_id: b.user_id || null,
      user_name: b.user_name || null,
    }));

    return {
      props: { builds, error: null },
      revalidate: 60,
    };
  } catch (err) {
    return {
      props: {
        builds: [],
        error: (err as Error)?.message || 'Impossible de charger les builds',
      },
      revalidate: 60,
    };
  }
};

export default function BuildsPage({ builds, error }: BuildsPageProps) {
  const t = useT('buildsPage');
  const locale = useLocale();
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0b0b14] to-black text-white">
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <main className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Heading typeStyle="heading-md" className="text-gradient mb-1">
              {t.heading}
            </Heading>
            <Paragraph
              typeStyle="body-sm"
              textColor="text-gray-300"
              className="max-w-2xl"
            >
              {t.subtitle}
            </Paragraph>
          </div>
          <div className="flex gap-2">
            <Link href="/">
              <Button type="button" size="compact" className="px-3 py-1.5">
                {t.backHome}
              </Button>
            </Link>
          </div>
        </header>

        <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
          {error && (
            <p className="text-sm text-red-300">
              {format(t.loadError, { error })}
            </p>
          )}

          {!error && builds.length === 0 && (
            <p className="text-sm text-gray-300">{t.noBuilds}</p>
          )}

          {!error && builds.length > 0 && (
            <ul className="divide-y divide-white/5">
              {builds.map((build) => (
                <li
                  key={build.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-[2px] rounded-full bg-white/10 text-white border border-white/30 text-[11px]">
                        {stateLabel(build.state, t)}
                      </span>
                      {build.context && (
                        <span className="text-[11px] text-gray-400">
                          {build.context}
                        </span>
                      )}
                      {build.branch && (
                        <span className="text-[11px] text-gray-400">
                          · {build.branch}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {build.title || build.commit_ref || t.buildFallback}
                    </div>
                    <div className="text-[12px] text-gray-400 flex flex-wrap gap-2">
                      {build.created_at && (
                        <span>
                          {format(t.startedAt, {
                            date: formatDate(build.created_at, locale),
                          })}
                        </span>
                      )}
                      {build.deploy_time !== null && (
                        <span>
                          {format(t.duration, { seconds: build.deploy_time })}
                        </span>
                      )}
                      {build.commit_url && (
                        <a
                          href={build.commit_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-300 hover:text-blue-100"
                        >
                          {t.viewCommit}
                        </a>
                      )}
                    </div>
                    {build.error && (
                      <div className="text-[12px] text-red-300">
                        {format(t.errorLabel, { error: build.error })}
                      </div>
                    )}
                  </div>
                  <StatusBadge build={build} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function stateLabel(state: string, t: BuildsDict) {
  switch (state) {
    case 'done':
    case 'success':
    case 'ready':
      return t.stateSuccess;
    case 'building':
    case 'enqueued':
      return t.stateOngoing;
    case 'error':
      return t.stateError;
    default:
      return state;
  }
}

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
