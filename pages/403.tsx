import Head from 'next/head';
import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <>
      <Head>
        <title>Accès refusé | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl font-bold text-gradient mb-4">403</div>
          <h1 className="text-2xl font-semibold mb-2">Accès refusé</h1>
          <p className="text-gray-400 mb-6">
            Tu n&apos;as pas les permissions nécessaires pour accéder à cette
            page. Si tu penses qu&apos;il s&apos;agit d&apos;une erreur,
            contacte l&apos;équipe.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-sm font-semibold transition"
            >
              Retour à l&apos;accueil
            </Link>
            <Link
              href="/admin/login"
              className="px-5 py-2 rounded-xl border border-white/15 bg-black/50 hover:border-white/30 text-sm font-semibold transition"
            >
              Se connecter
            </Link>
          </div>

          <p className="text-xs text-gray-500 mt-8">
            Besoin d&apos;aide ?{' '}
            <a
              href="mailto:owwomenscup@gmail.com"
              className="text-purple-300 hover:text-purple-200 underline"
            >
              owwomenscup@gmail.com
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
