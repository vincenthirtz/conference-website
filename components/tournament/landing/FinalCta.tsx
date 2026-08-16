// components/tournament/landing/FinalCta.tsx
//
// Section de clôture / conversion. Deux visages selon l'état des inscriptions :
// ouvertes → « Inscris ton équipe » ; fermées → « Suis le tournoi + Discord ».

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { Reveal, Spotlight } from './primitives';
import { COMMUNITY_LINKS } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

export default function FinalCta({
  registrationOpen,
  registerHref,
}: {
  registrationOpen: boolean;
  registerHref: string;
}) {
  const t = useT(nsTournamentLanding);

  return (
    <section id="join" className="relative overflow-hidden py-20 md:py-28">
      <Spotlight
        color="violet"
        className="left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 opacity-80"
      />
      <div className="tl-grain absolute inset-0" aria-hidden="true" />
      <div className="relative z-[1] mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal>
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-green-light)]">
            <span className="brand-dot" aria-hidden />
            {registrationOpen ? t.finalEyebrow : t.finalClosedHeading}
          </span>
          <h2 className="text-brand-gradient mt-4 text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
            {registrationOpen ? t.finalHeading : t.finalClosedHeading}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-gray-300">
            {registrationOpen ? t.finalSubtitle : t.finalClosedSubtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {registrationOpen && (
              <Link href={registerHref}>
                <span className="tl-cta-glow inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-green)] to-[var(--color-yellow)] px-8 py-3.5 text-sm font-bold text-black transition-transform hover:scale-[1.03]">
                  {t.finalCtaRegister}
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </span>
              </Link>
            )}
            <a href={COMMUNITY_LINKS.discord} target="_blank" rel="noreferrer">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/10">
                {t.finalCtaDiscord}
              </span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
