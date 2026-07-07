// pages/app.tsx
//
// Page publique qui présente la PWA (web app installable) à la communauté.
// Lien depuis le footer ("Installer l'app"). Objectif : faire installer
// l'app par les joueuses, capitaines, staff et casters — explique ce qu'on
// peut y faire et propose un bouton d'install in-page (via le deferred
// `beforeinstallprompt` event capté localement).
//
// Pas de SSR pour le bouton — la disponibilité dépend de l'état du browser
// (déjà installée ? mode incognito ? PWA criteria pas remplis ?). Le bouton
// se révèle uniquement quand l'event a été capté ; sinon on rend des
// instructions textuelles fallback ("menu Chrome → Installer l'app").

import Link from 'next/link';
import { useEffect, useState, type JSX } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type AppDict = ReturnType<typeof useT<'appPage'>>;

// Type local pour `beforeinstallprompt` (pas dans lib.dom standard).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Feature = {
  title: string;
  description: string;
  icon: (className: string) => JSX.Element;
};

const getFeatures = (t: AppDict): Feature[] => [
  {
    title: t.feature1Title,
    description: t.feature1Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    title: t.feature2Title,
    description: t.feature2Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="14" rx="2" />
        <circle cx="18" cy="6" r="3.5" fill="#b24be0" stroke="none" />
      </svg>
    ),
  },
  {
    title: t.feature3Title,
    description: t.feature3Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14 0" />
        <path d="M8.5 16.05a6 6 0 0 1 7 0" />
        <line x1="3" y1="3" x2="21" y2="21" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
  },
  {
    title: t.feature4Title,
    description: t.feature4Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    title: t.feature5Title,
    description: t.feature5Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    title: t.feature6Title,
    description: t.feature6Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    title: t.feature7Title,
    description: t.feature7Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
      </svg>
    ),
  },
  {
    title: t.feature8Title,
    description: t.feature8Desc,
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
  },
];

type AudienceCard = {
  emoji: string;
  title: string;
  description: string;
  bullets: string[];
  cta: { href: string; label: string };
};

const getAudiences = (t: AppDict): AudienceCard[] => [
  {
    emoji: '\u{1F3AE}',
    title: t.audience1Title,
    description: t.audience1Desc,
    bullets: [
      t.audience1Bullet1,
      t.audience1Bullet2,
      t.audience1Bullet3,
      t.audience1Bullet4,
    ],
    cta: { href: '/player', label: t.audience1Cta },
  },
  {
    emoji: '\u{1F399}\u{FE0F}',
    title: t.audience2Title,
    description: t.audience2Desc,
    bullets: [
      t.audience2Bullet1,
      t.audience2Bullet2,
      t.audience2Bullet3,
      t.audience2Bullet4,
    ],
    cta: { href: '/caster/cockpit', label: t.audience2Cta },
  },
  {
    emoji: '\u{1F6E0}\u{FE0F}',
    title: t.audience3Title,
    description: t.audience3Desc,
    bullets: [
      t.audience3Bullet1,
      t.audience3Bullet2,
      t.audience3Bullet3,
      t.audience3Bullet4,
    ],
    cta: { href: '/admin', label: t.audience3Cta },
  },
];

type FaqItem = { q: string; a: string };

const getFaq = (t: AppDict): FaqItem[] => [
  { q: t.faq1Q, a: t.faq1A },
  { q: t.faq2Q, a: t.faq2A },
  { q: t.faq3Q, a: t.faq3A },
  { q: t.faq4Q, a: t.faq4A },
  { q: t.faq5Q, a: t.faq5A },
  { q: t.faq6Q, a: t.faq6A },
];

function AppPage() {
  const t = useT('appPage');
  const features = getFeatures(t);
  const audiences = getAudiences(t);
  const faq = getFaq(t);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBefore = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    // Détecte une PWA déjà installée et lancée en mode standalone — pas la
    // peine de re-proposer l’install.
    if (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari only
      window.navigator.standalone === true
    ) {
      setInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canInstall = !!installPrompt && !installed;

  const handleInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      // Race / navigation pendant le prompt — ignored.
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-cyan-500/25 blur-3xl" />
          <div className="absolute right-0 top-20 h-[360px] w-[360px] rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute left-1/3 bottom-0 h-[300px] w-[300px] rounded-full bg-violet-600/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-20 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            <span className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-2 py-[2px] text-[10px] font-semibold text-black">
              PWA
            </span>
            <span>{t.heroBadge}</span>
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            <span className="bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
              {t.heroTitleGradient}
            </span>
            <br />
            {t.heroTitleRest}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {installed ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-medium text-cyan-200">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t.installedLabel}
              </div>
            ) : canInstall ? (
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-fuchsia-500/30 transition hover:scale-105"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t.installBtn}
              </button>
            ) : (
              <a
                href="#install"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                {t.howToInstall}
              </a>
            )}
            <a
              href="#fonctionnalites"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.seeFeatures}
            </a>
          </div>

          {!canInstall && !installed && (
            <p className="mx-auto mt-5 max-w-lg text-xs text-gray-400">
              {t.noPromptHint}
            </p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-20 px-4 pb-24 sm:px-6">
        {/* ─── FEATURES ─── */}
        <section id="fonctionnalites">
          <h2 className="text-3xl font-bold mb-3">{t.featuresTitle}</h2>
          <p className="mb-10 text-gray-400">{t.featuresSubtitle}</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5 transition hover:border-fuchsia-400/40 hover:bg-white/[0.07]"
              >
                <div className="mb-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/20 p-2.5 text-cyan-300">
                  {f.icon('w-6 h-6')}
                </div>
                <h3 className="mb-1 text-base font-semibold">{f.title}</h3>
                <p className="text-sm leading-snug text-gray-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── AUDIENCES ─── */}
        <section id="audiences">
          <h2 className="text-3xl font-bold mb-3">{t.audiencesTitle}</h2>
          <p className="mb-10 text-gray-400">{t.audiencesSubtitle}</p>
          <div className="grid gap-6 md:grid-cols-3">
            {audiences.map((a) => (
              <article
                key={a.title}
                className="flex flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-[#140a24]/60 via-[#1c0f33]/60 to-[#2a0d3d]/60 p-6 shadow-xl"
              >
                <div className="text-3xl mb-3" aria-hidden="true">
                  {a.emoji}
                </div>
                <h3 className="text-xl font-bold mb-2">{a.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{a.description}</p>
                <ul className="space-y-2 text-sm text-gray-200 mb-6 flex-1">
                  {a.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={a.cta.href}
                  className="mt-auto inline-flex items-center justify-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10"
                >
                  {a.cta.label} <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* ─── INSTALL ─── */}
        <section id="install" className="rounded-3xl border border-white/10 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/10 to-violet-500/10 p-8 sm:p-12">
          <h2 className="text-3xl font-bold mb-6">{t.installTitle}</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: t.installStep1Label, body: t.installStep1Body },
              { label: t.installStep2Label, body: t.installStep2Body },
              { label: t.installStep3Label, body: t.installStep3Body },
              { label: t.installStep4Label, body: t.installStep4Body },
            ].map((s) => (
              <div key={s.label}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-300 mb-2">
                  {s.label}
                </h3>
                <p className="text-sm text-gray-200 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
          {canInstall && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-fuchsia-500/30 transition hover:scale-105"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t.installNowBtn}
              </button>
            </div>
          )}
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq">
          <h2 className="text-3xl font-bold mb-3">{t.faqTitle}</h2>
          <p className="mb-8 text-gray-400">{t.faqSubtitle}</p>
          <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-white">
                  <span>{item.q}</span>
                  <svg
                    className="w-4 h-4 flex-shrink-0 transition-transform group-open:rotate-180 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-300">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const appSeo: SeoProps = {
  title: {
    fr: "Installer l'app — OW Women's Cup",
    en: "Install the app — OW Women's Cup",
  },
  description: {
    fr: "Installe la PWA OW Women's Cup pour recevoir tes notifs match, scrim et check-in en temps réel, même hors-ligne. Compatible Windows, macOS, Android et iOS.",
    en: "Install the OW Women's Cup PWA for real-time match, scrim and check-in alerts, even offline. Works on Windows, macOS, Android and iOS.",
  },
};

AppPage.seo = appSeo;

export default AppPage;
