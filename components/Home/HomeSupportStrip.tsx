/* eslint-disable @next/next/no-img-element */
// components/Home/HomeSupportStrip.tsx
//
// Bande "soutiens" de la refonte accueil : sponsors + presse fusionnés en UNE
// seule bande grise et discrète ("ils soutiennent · ils en parlent"). Logos en
// grayscale qui se colorent au survol. Rien de bruyant : c'est un bandeau de
// confiance, pas une section marketing.

import type { JSX } from 'react';
import Link from 'next/link';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { useT } from '@/lib/i18n/useT';

type PressLogo = {
  source: string;
  url: string;
  logo?: string;
};

// Aligné sur components/Press/PressSection (source unique de la presse).
const PRESS_LOGOS: PressLogo[] = [
  {
    source: 'Ranked Actu',
    url: 'https://rankedactu.fr/article/e-sport/cmmucnmqd000401jv59636io8',
    logo: 'https://rankedactu.fr/_next/image?url=%2Flogo_white.webp&w=256&q=75',
  },
];

type HomeSupportStripProps = {
  partners: HomePartner[];
};

function LogoText({ label }: { label: string }) {
  return (
    <span className="text-base font-extrabold uppercase tracking-wide text-white/60 transition-colors group-hover:text-white">
      {label}
    </span>
  );
}

export default function HomeSupportStrip({
  partners,
}: HomeSupportStripProps): JSX.Element | null {
  const t = useT('homeV2');
  const uniquePartners = Array.from(
    new Map(partners.map((p) => [p.id, p])).values()
  );

  if (!uniquePartners.length && !PRESS_LOGOS.length) return null;

  return (
    <section className="mt-16 border-y border-white/10 bg-[var(--bg-base)] md:mt-20">
      <div className="container mx-auto px-4 py-10 md:py-12">
        <p className="mb-6 text-center text-[13px] uppercase tracking-[0.14em] text-gray-400">
          {t.supportLead}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {uniquePartners.map((partner) => (
            <li key={`partner-${partner.id}`} className="group">
              {partner.websiteUrl ? (
                <a
                  href={partner.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  aria-label={partner.name}
                  className="flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
                >
                  {partner.logoUrl ? (
                    <img
                      src={partner.logoUrl}
                      alt={partner.name}
                      title={partner.name}
                      loading="lazy"
                      className="block max-h-9 w-auto object-contain opacity-60 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                    />
                  ) : (
                    <LogoText label={partner.name} />
                  )}
                </a>
              ) : partner.logoUrl ? (
                <img
                  src={partner.logoUrl}
                  alt={partner.name}
                  title={partner.name}
                  loading="lazy"
                  className="block max-h-9 w-auto object-contain opacity-60 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                />
              ) : (
                <LogoText label={partner.name} />
              )}
            </li>
          ))}

          {uniquePartners.length > 0 && PRESS_LOGOS.length > 0 && (
            <li aria-hidden className="h-5 w-px bg-white/15" />
          )}

          {PRESS_LOGOS.map((item) => (
            <li key={`press-${item.url}`} className="group">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.source}
                className="flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
              >
                {item.logo ? (
                  <img
                    src={item.logo}
                    alt={item.source}
                    loading="lazy"
                    className="block max-h-8 w-auto object-contain opacity-60 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                  />
                ) : (
                  <LogoText label={item.source} />
                )}
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex justify-center gap-4 text-sm">
          <Link
            href="/partenaires"
            className="inline-flex items-center gap-1.5 text-gray-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
          >
            {t.supportPartnersLink}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
