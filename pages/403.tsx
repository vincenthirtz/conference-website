import Head from 'next/head';
import Link from 'next/link';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useT } from '@/lib/i18n/useT';

export default function ForbiddenPage() {
  const t = useT('error403');
  const { value: contactEmail } = useSiteSetting('contact_email');

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl font-bold text-gradient mb-4">403</div>
          <h1 className="text-2xl font-semibold mb-2">{t.heading}</h1>
          <p className="text-gray-400 mb-6">{t.body}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-sm font-semibold transition"
            >
              {t.backHome}
            </Link>
            <Link
              href="/login"
              className="px-5 py-2 rounded-xl border border-white/15 bg-black/50 hover:border-white/30 text-sm font-semibold transition"
            >
              {t.signIn}
            </Link>
          </div>

          <p className="text-xs text-gray-500 mt-8">
            {t.needHelp}{' '}
            <a
              href={`mailto:${contactEmail}`}
              className="text-purple-300 hover:text-purple-200 underline"
            >
              {contactEmail}
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
