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

const CATEGORY_ORDER: HomePartner['category'][] = [
  'super',
  'major',
  'cultural',
];

const CATEGORY_META: Record<
  HomePartner['category'],
  { label: string; tone: string }
> = {
  super: {
    label: 'Super partenaire',
    tone: 'border-amber-300/40 bg-amber-300/5 text-amber-100',
  },
  major: {
    label: 'Partenaire majeur',
    tone: 'border-fuchsia-300/40 bg-fuchsia-300/5 text-fuchsia-100',
  },
  cultural: {
    label: 'Partenaire culturel',
    tone: 'border-cyan-300/40 bg-cyan-300/5 text-cyan-100',
  },
};

function PartnerTile({ partner }: { partner: HomePartner }) {
  const inner = (
    <div className="group relative flex h-24 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 transition-all hover:border-white/20 hover:bg-white/[0.08]">
      {partner.logoUrl ? (
        <img
          src={partner.logoUrl}
          alt={partner.name}
          className="max-h-12 w-auto object-contain opacity-80 transition-opacity group-hover:opacity-100"
          loading="lazy"
        />
      ) : (
        <span className="text-sm font-medium text-gray-200">
          {partner.name}
        </span>
      )}
    </div>
  );
  if (!partner.websiteUrl) return inner;
  return (
    <a
      href={partner.websiteUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      title={partner.name}
      aria-label={partner.name}
    >
      {inner}
    </a>
  );
}

export default function HomeSponsors({
  partners,
}: HomeSponsorsProps): JSX.Element | null {
  if (!partners?.length) return null;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: partners.filter((p) => p.category === cat),
  })).filter((g) => g.items.length > 0);

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

      <div className="flex flex-col gap-6">
        {grouped.map(({ cat, items }) => (
          <div key={cat} className="flex flex-col gap-3">
            <div
              className={`mx-auto inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${CATEGORY_META[cat].tone}`}
            >
              {CATEGORY_META[cat].label}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((partner) => (
                <PartnerTile key={partner.id} partner={partner} />
              ))}
            </div>
          </div>
        ))}
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
