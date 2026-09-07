// components/Home/HomeSocialWall.tsx
//
// Section « Nos réseaux » de l'accueil : les dernières publications de nos
// comptes Bluesky, YouTube, Instagram et TikTok, dans l'ordre chronologique
// inverse, toutes sources mêlées.
//
// RENDU SSR À PARTIR DE LA BASE, pas d'embeds. Les widgets officiels de ces
// quatre réseaux chargent chacun leur script tiers, posent leurs traceurs, et
// ne s'affichent pas de la même façon d'un réseau à l'autre : quatre blocs
// hétérogènes, quatre scripts, un bandeau cookies à rallonge, et une page qui
// bouge sous le lecteur pendant qu'ils se chargent. Ici, tout est déjà dans le
// HTML initial, la mise en page est la nôtre, et le visiteur n'est pas pisté.
//
// CHAQUE CARTE MÈNE À LA PUBLICATION D'ORIGINE, dans un onglet neuf. C'est ce
// que demandent les conditions d'affichage de ces plateformes — on montre un
// extrait et on renvoie chez elles, on ne se substitue pas à elles. C'est aussi
// ce que le lecteur attend : liker et commenter se font là-bas.
//
// SECTION MUETTE QUAND IL N'Y A RIEN. Un mur vide sous un titre « Nos réseaux »
// dit « ce site est à l'abandon » — exactement le contraire de ce qu'on veut
// afficher tant qu'aucun compte n'est branché.

import type { JSX } from 'react';
import Image from 'next/image';
import {
  BlueskyIcon,
  InstagramIcon,
  TikTokIcon,
  YouTubeIcon,
} from '@/components/Icons';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { social, type SocialKey } from '@/config/socials';
import type { SocialFeedItem } from '@/utils/social/socialFeed';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type HomeSocialWallProps = {
  items: SocialFeedItem[];
};

/**
 * Ce qu'il faut savoir pour habiller une carte, par source.
 *
 * La clé `SocialKey` fait le pont avec `config/socials.ts`, source unique des
 * comptes : le lien « voir le compte » et le handle affiché en viennent, on ne
 * les réécrit pas ici.
 */
const SOURCES: Record<
  string,
  {
    key: SocialKey;
    label: string;
    Icon: (props: { className?: string }) => JSX.Element;
    /** Couleur de marque, pour la pastille. */
    tint: string;
  }
> = {
  bluesky: {
    key: 'bluesky',
    label: 'Bluesky',
    Icon: BlueskyIcon,
    tint: 'text-[#0285FF]',
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    Icon: YouTubeIcon,
    tint: 'text-[#FF0000]',
  },
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    Icon: InstagramIcon,
    tint: 'text-[#E1306C]',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    Icon: TikTokIcon,
    tint: 'text-[#FF0050]',
  },
};

/** Date courte : sous une vignette, l'année alourdit sans rien apprendre. */
function formatDate(iso: string, locale: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function SocialCard({ item }: { item: SocialFeedItem }) {
  const t = useT(nsHomeV2);
  const locale = useLocale();
  const meta = SOURCES[item.source];
  const date = formatDate(item.publishedAt, locale);
  const account = meta ? social(meta.key) : null;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card-brand group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] transition-all duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] motion-reduce:transform-none"
    >
      <div className="relative aspect-square w-full overflow-hidden">
        {item.thumbnailUrl ? (
          <Image
            src={item.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transform-none"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/30 to-[var(--color-green)]/20" />
        )}

        {meta && (
          <span
            className="absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/70"
            // Le nom du réseau est déjà donné au lecteur d'écran par le libellé
            // du lien plus bas : ici, l'icône est purement décorative.
            aria-hidden
          >
            <meta.Icon className={`h-3.5 w-3.5 ${meta.tint}`} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xs tracking-wide text-gray-500">
          {[meta?.label, date].filter(Boolean).join(' · ')}
        </span>
        {item.text ? (
          <p className="line-clamp-3 text-sm text-gray-300">{item.text}</p>
        ) : (
          // Une publication sans légende existe (une image seule) : plutôt
          // qu'un blanc, on dit ce que c'est.
          <p className="text-sm italic text-gray-500">
            {account ? account.handle : t.socialNoCaption}
          </p>
        )}
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-semibold text-[var(--color-green-light)] transition group-hover:gap-2">
          {t.socialOpen}
          <span aria-hidden>→</span>
        </span>
      </div>
    </a>
  );
}

export default function HomeSocialWall({
  items,
}: HomeSocialWallProps): JSX.Element | null {
  const t = useT(nsHomeV2);

  // Rien à montrer = pas de section du tout. Cf. l'en-tête.
  if (items.length === 0) return null;

  return (
    <section
      id="reseaux"
      className="container mx-auto mt-16 px-4 md:mt-20 md:px-0"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          {t.socialEyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
          {t.socialTitle}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <SocialCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
