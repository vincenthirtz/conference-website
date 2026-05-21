// /onboard
//
// Self-service onboarding landing page. Promotes the Conference Discord bot
// and routes the visitor to the request form (gated by Discord OAuth).

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useAuthSession } from '@/hooks/useAuthSession';
import DiscordSignInCta from '@/components/onboard/DiscordSignInCta';

const FEATURES: { title: string; desc: string }[] = [
  {
    title: 'Gestion complète des tournois',
    desc: 'Brackets, groupes, seeding, vetos, draft de cartes — directement orchestrés depuis Discord et synchronisés avec le site.',
  },
  {
    title: 'Scrims & matchs amicaux',
    desc: 'Vos équipes proposent et acceptent des scrims via le bot. Les casters récupèrent automatiquement leurs assignations.',
  },
  {
    title: 'Casts et streams suivis',
    desc: 'Synchronisation des casters, statuts en direct et notifications discord pour ne rater aucun match.',
  },
  {
    title: 'Rôles & permissions auto',
    desc: 'Les rôles staff et joueuses sont synchronisés avec les équipes inscrites, sans gestion manuelle.',
  },
  {
    title: 'Espace public dédié',
    desc: 'Vous récupérez votre propre espace public sur le site (URL `/<votre-slug>/...`) pour annoncer vos tournois.',
  },
  {
    title: 'Self-hébergé, sans dépendance',
    desc: 'Vous gardez la main : les secrets vous sont remis une seule fois, vous tournez le bot sur votre infra.',
  },
];

function OnboardLandingPage() {
  const { user, loading } = useAuthSession();
  const isSignedIn = !!user;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                Self-service
              </span>
              <span>Onboarding bot Discord</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-gradient mt-4 max-w-3xl">
              Ajoutez le bot Conférence sur votre serveur Discord
            </h1>
            <p className="text-base md:text-lg text-gray-300 mt-4 max-w-2xl">
              En quelques minutes, déployez la même stack que la Conférence des
              équipes féminines Overwatch : gestion de tournois, scrims, casts,
              role-sync — le tout piloté depuis votre serveur Discord.
            </p>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
              >
                <h2 className="text-sm font-semibold text-white mb-1">
                  {f.title}
                </h2>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {f.desc}
                </p>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
            <h2 className="text-lg md:text-xl font-semibold text-white mb-2">
              Prêt·e à démarrer ?
            </h2>
            <p className="text-sm text-gray-300 mb-5">
              La demande est gratuite et prend moins de deux minutes. Vous
              recevez ensuite un email de confirmation, puis un bouton
              d&apos;invitation du bot sur votre serveur.
            </p>

            {loading ? (
              <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
            ) : isSignedIn ? (
              <div className="space-y-3">
                <Link
                  href="/onboard/request"
                  className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow hover:opacity-90 transition"
                  data-test="onboard-cta-start"
                >
                  Demander le bot
                  <span aria-hidden>→</span>
                </Link>
                <p className="text-xs text-gray-400">
                  Vous êtes connecté·e en tant que{' '}
                  <span className="text-white">
                    {user?.user_metadata?.full_name ||
                      user?.user_metadata?.user_name ||
                      user?.email ||
                      'utilisateur Discord'}
                  </span>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-300">
                  Connectez-vous via Discord pour démarrer — nous avons besoin
                  de votre identifiant Discord pour associer le bot à votre
                  serveur.
                </p>
                <DiscordSignInCta next="/onboard/request" />
                <p className="text-xs text-gray-500">
                  Pas de mot de passe à créer. Votre compte Discord suffit.
                </p>
              </div>
            )}
          </div>

          <div className="mt-10 text-center text-xs text-gray-500">
            <p>
              Une question ? Rejoignez le{' '}
              <a
                href="https://discord.gg/gERSsjC3Vd"
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-300 hover:text-purple-200"
              >
                Discord communautaire
              </a>{' '}
              ou écrivez-nous à{' '}
              <a
                href="mailto:owwomenscup@gmail.com"
                className="text-purple-300 hover:text-purple-200"
              >
                owwomenscup@gmail.com
              </a>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

const onboardLandingSeo: SeoProps = {
  title: 'Ajoutez le bot Conférence sur votre serveur Discord',
  description:
    'Self-service onboarding : déployez en quelques minutes le bot Discord de la Conférence (tournois, scrims, casts, role-sync) sur votre propre serveur.',
};

OnboardLandingPage.seo = onboardLandingSeo;

export default OnboardLandingPage;
