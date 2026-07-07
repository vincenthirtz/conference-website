// /onboard
//
// Self-service onboarding landing page. Promotes the Conference Discord bot
// and routes the visitor to the request form (gated by Discord OAuth).

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useAuthSession } from '@/hooks/useAuthSession';
import DiscordSignInCta from '@/components/onboard/DiscordSignInCta';
import { useT, format } from '@/lib/i18n/useT';

type OnboardIndexDict = ReturnType<typeof useT<'onboardIndex'>>;

const getFeatures = (
  t: OnboardIndexDict
): { title: string; desc: string }[] => [
  { title: t.feature1Title, desc: t.feature1Desc },
  { title: t.feature2Title, desc: t.feature2Desc },
  { title: t.feature3Title, desc: t.feature3Desc },
  { title: t.feature4Title, desc: t.feature4Desc },
  { title: t.feature5Title, desc: t.feature5Desc },
  { title: t.feature6Title, desc: t.feature6Desc },
];

function OnboardLandingPage() {
  const t = useT('onboardIndex');
  const features = getFeatures(t);
  const { user, loading } = useAuthSession();
  const isSignedIn = !!user;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                {t.badge}
              </span>
              <span>{t.badgeSub}</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-gradient mt-4 max-w-3xl">
              {t.title}
            </h1>
            <p className="text-base md:text-lg text-gray-300 mt-4 max-w-2xl">
              {t.subtitle}
            </p>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            {features.map((f) => (
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
              {t.ctaTitle}
            </h2>
            <p className="text-sm text-gray-300 mb-5">{t.ctaDesc}</p>

            {loading ? (
              <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
            ) : isSignedIn ? (
              <div className="space-y-3">
                <Link
                  href="/onboard/request"
                  className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow hover:opacity-90 transition"
                  data-test="onboard-cta-start"
                >
                  {t.requestBot}
                  <span aria-hidden>→</span>
                </Link>
                <p className="text-xs text-gray-400">
                  {format(t.signedInAs, {
                    name:
                      user?.user_metadata?.full_name ||
                      user?.user_metadata?.user_name ||
                      user?.email ||
                      t.discordUserFallback,
                  })}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-300">{t.signInPrompt}</p>
                <DiscordSignInCta next="/onboard/request" />
                <p className="text-xs text-gray-500">{t.noPassword}</p>
              </div>
            )}
          </div>

          <div className="mt-10 text-center text-xs text-gray-500">
            <p>
              {t.questionPrefix}{' '}
              <a
                href="https://discord.gg/gERSsjC3Vd"
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-300 hover:text-purple-200"
              >
                {t.communityDiscord}
              </a>{' '}
              {t.questionMiddle}{' '}
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
