import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSiteSetting } from '@/hooks/useSiteSettings';

const SUGGESTIONS = [
  { label: 'Accueil', href: '/', emoji: '🏠' },
  { label: 'Tournoi', href: '/tournoi', emoji: '🏆' },
  { label: 'Ambassadrices', href: '/live', emoji: '🎥' },
  { label: 'Actualités', href: '/actualites', emoji: '📰' },
  { label: 'Plan du site', href: '/plan-du-site', emoji: '🗺️' },
  { label: 'Contact', href: '/contact', emoji: '✉️' },
];

export default function NotFoundPage() {
  const { value: contactEmail } = useSiteSetting('contact_email');
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Page introuvable | OW Women&apos;s Cup</title>
        <meta
          name="description"
          content="La page que tu cherches n'existe pas ou a été déplacée."
        />
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
            Cette page a quitté la partie
          </h1>
          <p className="mt-3 text-gray-400 max-w-md mx-auto">
            Le lien est peut-être cassé, la page a été déplacée, ou tu as trouvé
            un easter egg. Pas de panique, on t&apos;aide à rentrer au lobby.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-sm font-semibold transition shadow-lg shadow-purple-500/20"
            >
              Retour à l&apos;accueil
            </Link>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 rounded-xl border border-white/15 bg-black/50 hover:border-white/30 text-sm font-semibold transition"
            >
              Page précédente
            </button>
          </div>

          <div className="mt-12">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-4">
              Ou explore par ici
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {SUGGESTIONS.map((item) => (
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
              Tu pensais voir autre chose ?{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="text-purple-300 hover:text-purple-200 underline"
              >
                Signale-le nous
              </a>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
