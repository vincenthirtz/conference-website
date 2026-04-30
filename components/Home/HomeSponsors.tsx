/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

export type HomePartner = {
  id: string;
  name: string;
  category: 'super' | 'major' | 'cultural';
  logoUrl: string | null;
  websiteUrl: string | null;
};

type HomeSponsorsProps = {
  partners: HomePartner[];
};

function PartnerLogo({ partner }: { partner: HomePartner }) {
  const inner = partner.logoUrl ? (
    <img
      src={partner.logoUrl}
      alt={partner.name}
      title={partner.name}
      className="block max-h-14 md:max-h-16 w-auto object-contain transition-all duration-300 grayscale hover:grayscale-0 opacity-70 hover:opacity-100"
      loading="lazy"
    />
  ) : (
    <span className="text-base md:text-lg font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors">
      {partner.name}
    </span>
  );

  if (!partner.websiteUrl) {
    return (
      <div className="flex h-16 md:h-20 items-center justify-center px-6 md:px-10">
        {inner}
      </div>
    );
  }
  return (
    <a
      href={partner.websiteUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={partner.name}
      className="flex h-16 md:h-20 items-center justify-center px-6 md:px-10 outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-md"
    >
      {inner}
    </a>
  );
}

export default function HomeSponsors({
  partners,
}: HomeSponsorsProps): JSX.Element | null {
  // De-duplicate by id (defensive: DB or merge could surface dupes)
  const unique = Array.from(
    new Map(partners.map((p) => [p.id, p])).values()
  );

  if (!unique.length) return null;

  // Duplicate the list once for a seamless infinite loop. Each "lap"
  // translates the track by 50 %, swapping the visible half.
  const looped = [...unique, ...unique];
  const duration = Math.max(28, unique.length * 5);

  return (
    <section
      id="sponsors"
      className="container mt-20 flex flex-col gap-8 px-4 md:px-0"
    >
      <div className="flex flex-col items-center text-center">
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          Partenaires
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          Ils soutiennent l&apos;OW Women&apos;s Cup
        </Heading>
        <Paragraph
          typeStyle="body-lg"
          className="mt-3 max-w-2xl"
          textColor="text-gray-200"
        >
          Une production possible grâce à nos partenaires officiels.
        </Paragraph>
      </div>

      <div
        className="sponsor-marquee relative overflow-hidden py-6"
        aria-label="Liste des partenaires"
      >
        <div
          className="sponsor-marquee-track flex w-max items-center"
          style={{ animationDuration: `${duration}s` }}
          role="list"
        >
          {looped.map((partner, idx) => (
            <div
              key={`${partner.id}-${idx}`}
              role="listitem"
              aria-hidden={idx >= unique.length}
              className="shrink-0"
            >
              <PartnerLogo partner={partner} />
            </div>
          ))}
        </div>
      </div>

      <div className="text-center">
        <Link
          href="/partenaires"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Voir tous les partenaires
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
