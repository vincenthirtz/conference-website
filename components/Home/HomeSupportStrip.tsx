/* eslint-disable @next/next/no-img-element */
// components/Home/HomeSupportStrip.tsx
//
// Bande "soutiens" de la refonte accueil : sponsors + production + presse
// fusionnés en UNE seule bande grise et discrète ("ils soutiennent · ils la
// diffusent · ils en parlent"). Logos en grayscale qui se colorent au survol.
// Rien de bruyant : c'est un bandeau de confiance, pas une section marketing.
//
// L'ordre des groupes suit celui des segments de `supportLead` : changer l'un
// sans l'autre rendrait la phrase fausse.

import type { JSX } from 'react';
import Link from 'next/link';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import {
  POGTV_LOGO,
  POGTV_NAME,
  POGTV_TWITCH,
} from '@/components/Production/pogtv';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';
import nsProductionPartner from '@/lib/i18n/locales/fr/productionPartner';

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
}: HomeSupportStripProps): JSX.Element {
  const t = useT(nsHomeV2);
  const tProd = useT(nsProductionPartner);
  const uniquePartners = Array.from(
    new Map(partners.map((p) => [p.id, p])).values()
  );

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

          {uniquePartners.length > 0 && (
            <li aria-hidden className="h-5 w-px bg-white/15" />
          )}

          {/* Production : logo + nom, la ou les sponsors n'ont qu'un logo.
              La marque POGTV est un pictogramme carre — reduit a 36 px et
              desature comme le reste de la bande, il ne se lit pas seul. */}
          <li className="group">
            <a
              href={POGTV_TWITCH}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${POGTV_NAME} — ${tProd.role}`}
              title={tProd.role}
              className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              <img
                src={POGTV_LOGO}
                alt=""
                loading="lazy"
                className="block h-8 w-8 rounded-md object-cover opacity-60 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0"
              />
              <LogoText label={POGTV_NAME} />
            </a>
          </li>

          {PRESS_LOGOS.length > 0 && (
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

        {/* Deux intentions différentes : consulter la liste, ou s'y ajouter.
            « Devenir partenaire » vise /partenaires/demande — le formulaire —
            et non la page vitrine, qui obligerait à un clic de plus. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          <Link
            href="/partenaires"
            className="inline-flex items-center gap-1.5 text-gray-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded"
          >
            {t.supportPartnersLink}
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/partenaires/demande"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
          >
            {t.supportBecomePartner}
          </Link>
        </div>
      </div>
    </section>
  );
}
