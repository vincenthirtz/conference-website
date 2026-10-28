import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useT } from '@/lib/i18n/useT';
import nsError404 from '@/lib/i18n/locales/fr/error404';

type Error404Dict = typeof nsError404.fr;

const suggestions = (t: Error404Dict) => [
  { label: t.sHome, href: '/', emoji: '🏠' },
  { label: t.sTournament, href: '/tournoi', emoji: '🏆' },
  { label: t.sAmbassadors, href: '/ambassadors', emoji: '🎥' },
  { label: t.sNews, href: '/actualites', emoji: '📰' },
  { label: t.sSitemap, href: '/plan-du-site', emoji: '🗺️' },
  { label: t.sContact, href: '/contact', emoji: '✉️' },
];

export default function NotFoundPage() {
  const t = useT(nsError404);
  const { value: contactEmail } = useSiteSetting('contact_email');
  const router = useRouter();

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
        <meta name="description" content={t.metaDescription} />
        <meta name="robots" content="noindex" />
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4 py-16">
        {/* Ambient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-purple-600/20 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative text-center max-w-2xl">
          <div className="relative inline-block">
            <div
              aria-hidden="true"
              className="absolute inset-0 text-[8rem] sm:text-[10rem] font-black leading-none blur-2xl opacity-40 text-gradient select-none"
            >
              404
            </div>
            <div className="relative text-[8rem] sm:text-[10rem] font-black leading-none text-gradient select-none">
              404
            </div>
          </div>

          <h1 className="mt-2 text-2xl sm:text-3xl font-semibold">
            {t.heading}
          </h1>
          <p className="mt-3 text-gray-400 max-w-md mx-auto">{t.body}</p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-sm font-semibold transition shadow-lg shadow-purple-500/20"
            >
              {t.backHome}
            </Link>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 rounded-xl border border-white/15 bg-black/50 hover:border-white/30 text-sm font-semibold transition"
            >
              {t.previousPage}
            </button>
          </div>

          <div className="mt-12">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-4">
              {t.explore}
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {suggestions(t).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25 text-sm font-medium transition"
                  >
                    <span aria-hidden="true" className="text-base">
                      {item.emoji}
                    </span>
                    <span className="text-gray-200 group-hover:text-white transition">
                      {item.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {contactEmail && (
            <p className="text-xs text-gray-500 mt-10">
              {t.reportPrefix}{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="text-purple-300 hover:text-purple-200 underline"
              >
                {t.reportLink}
              </a>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
