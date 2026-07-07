import Head from 'next/head';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { ACTIVE_WOMEN_TOURNAMENT_ID } from '@/utils/activeEdition';
import { useT } from '@/lib/i18n/useT';
import LanguageToggle from '@/components/Navbar/LanguageToggle';

const DISCORD_INVITE = 'https://discord.gg/gERSsjC3Vd';
const REGISTER_TEAM_HREF = `/team/create?tournament=${ACTIVE_WOMEN_TOURNAMENT_ID}`;

type IconName =
  | 'roster'
  | 'door'
  | 'inbox'
  | 'swords'
  | 'chat'
  | 'transfer'
  | 'eye';

function FeatureIcon({ name }: { name: IconName }) {
  const common = {
    className: 'w-6 h-6 text-pink-300',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'roster':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'door':
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" />
          <circle cx="13" cy="13" r="0.8" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        </svg>
      );
    case 'swords':
      return (
        <svg {...common}>
          <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
          <path d="m13 19 6-6" />
          <path d="m16 16 4 4" />
          <path d="m19 21 2-2" />
          <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" />
          <path d="m11 5-6 6" />
          <path d="m8 8-4-4" />
          <path d="M5 3 3 5" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'transfer':
      return (
        <svg {...common}>
          <path d="M16 3h5v5" />
          <path d="M21 3 14 10" />
          <path d="M8 21H3v-5" />
          <path d="m3 21 7-7" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

function EspaceCapitainePage() {
  const t = useT('espaceCapitaine');

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <title>{t.seoTitle}</title>
        <meta name="description" content={t.seoDescription} />
      </Head>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-5xl justify-end px-6 pt-24">
          <LanguageToggle />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-6 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            <span className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-2 py-[2px] text-[10px] font-semibold text-black">
              {t.heroBadge}
            </span>
            <span>{t.heroKicker}</span>
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroDescription}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/player"
              className="rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-pink-500/20 transition hover:brightness-110"
            >
              {t.heroCtaSpace}
            </Link>
            <Link
              href={REGISTER_TEAM_HREF}
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.heroCtaRegister}
            </Link>
            <a
              href="#fonctionnalites"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.heroCtaFeatures}
            </a>
            <a
              href="#faq"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.heroCtaFaq}
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-20 sm:px-6">
        {/* Pour qui */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.forWhoKicker}
          </p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
            {t.forWhoTitle}
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-gray-200 sm:text-base">
            {t.forWhoDescription}
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {t.forWhoItems.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-gray-100"
              >
                <span
                  className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Features */}
        <section id="fonctionnalites" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              {t.featuresKicker}
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              {t.featuresTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              {t.featuresDescription}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {t.features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 ring-1 ring-white/10">
                    <FeatureIcon name={feature.icon as IconName} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-200">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section id="etapes" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              {t.stepsKicker}
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              {t.stepsTitle}
            </h2>
          </div>
          <ol className="space-y-4">
            {t.steps.map((step) => (
              <li
                key={step.number}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20 sm:flex-row sm:items-start"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/40 to-pink-500/40 font-mono text-lg font-bold text-white ring-1 ring-white/15">
                  {step.number}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-200">
                    {step.description}
                  </p>
                  {step.ctaLabel && step.ctaHref && (
                    <Link
                      href={
                        step.ctaHref === 'REGISTER_TEAM_HREF'
                          ? REGISTER_TEAM_HREF
                          : step.ctaHref
                      }
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline decoration-purple-400/60 underline-offset-4 transition hover:text-white"
                    >
                      {step.ctaLabel} ↗
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                {t.ctaKicker}
              </p>
              <h3 className="mt-2 text-2xl font-bold">{t.ctaTitle}</h3>
              <p className="mt-2 text-sm text-gray-200">{t.ctaDescription}</p>
            </div>
            <Link
              href="/player"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-pink-500/20 transition hover:brightness-110"
            >
              {t.ctaButton}
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              {t.faqKicker}
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              {t.faqTitle}
            </h2>
          </div>
          <div className="space-y-3">
            {t.faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20 open:border-purple-400/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white">
                  {faq.question}
                  <span
                    aria-hidden
                    className="text-purple-200 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-gray-200">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Help */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
            {t.helpKicker}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-white">{t.helpTitle}</h3>
          <p className="mt-3 text-sm text-gray-200">{t.helpDescription}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.helpDiscord}
            </a>
            <Link
              href="/contact"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.helpContact}
            </Link>
            <Link
              href="/inscription-2026"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.helpGuide}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

// Titre & description SEO sont rendus dans le corps via `<Head>` (traduits
// selon la langue active) — ils ne vivent plus ici pour eviter deux <title>
// concurrents avec le DefaultSeo global d'_app.tsx. On conserve l'objet `seo`
// (sans title/description) pour rester une page publique indexable (pas de
// noindex applique par _app.tsx).
const espaceCapitaineSeo: SeoProps = {};

EspaceCapitainePage.seo = espaceCapitaineSeo;

export default EspaceCapitainePage;
