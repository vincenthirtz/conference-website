/* eslint-disable @next/next/no-img-element */
// components/tournament/landing/SponsorsStrip.tsx
//
// Partenaires : logos monochromes → couleur au survol. Masquée si aucun
// partenaire actif. CTA « Devenir partenaire » vers /partenaires.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal } from './primitives';
import type { LandingPartner } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

export default function SponsorsStrip({
  partners,
}: {
  partners: LandingPartner[];
}) {
  const t = useT(nsTournamentLanding);
  if (partners.length === 0) return null;

  return (
    <Section id="sponsors">
      <SectionHeader
        eyebrow={t.sponsorsEyebrow}
        title={t.sponsorsHeading}
        subtitle={t.sponsorsSubtitle}
      />

      <Reveal className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6 rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-10 sm:gap-x-14">
        {partners.map((p) => {
          const inner = p.logoUrl ? (
            <img
              src={p.logoUrl}
              alt={p.name}
              title={p.name}
              loading="lazy"
              decoding="async"
              className="block max-h-12 w-auto object-contain opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
            />
          ) : (
            <span className="text-lg font-bold uppercase tracking-wider text-white/60 transition-colors hover:text-white">
              {p.name}
            </span>
          );
          return p.websiteUrl ? (
            <a
              key={p.id}
              href={p.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center"
            >
              {inner}
            </a>
          ) : (
            <span key={p.id} className="flex items-center">
              {inner}
            </span>
          );
        })}
      </Reveal>

      <div className="mt-8 flex justify-center">
        <Link href="/partenaires">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[var(--color-violet)]/50 hover:bg-[var(--color-violet)]/10">
            {t.sponsorsCta}
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
      </div>
    </Section>
  );
}
