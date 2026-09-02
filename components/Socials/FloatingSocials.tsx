import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';
import type { SVGTypes } from '@/types/types';
import {
  TikTokIcon,
  InstagramIcon,
  TwitchIcon,
  XIcon,
  YouTubeIcon,
  BlueskyIcon,
  DiscordIcon,
  RssIcon,
  DonationIcon,
} from '@/components/Icons';
import { DISPLAY_SOCIALS, type SocialKey } from '@/config/socials';
import { useT } from '@/lib/i18n/useT';
import nsFloatingSocials from '@/lib/i18n/locales/fr/floatingSocials';

type SocialLink = {
  name: string;
  href: string;
  Icon: (props: Readonly<SVGTypes>) => JSX.Element;
  hoverColor: string;
};

// Icône par réseau. Les URL viennent de `config/socials.ts` — c'est la liste
// qui bouge, pas les tracés SVG.
const SOCIAL_ICONS: Record<
  SocialKey,
  (props: Readonly<SVGTypes>) => JSX.Element
> = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  x: XIcon,
  twitch: TwitchIcon,
  youtube: YouTubeIcon,
  bluesky: BlueskyIcon,
  discord: DiscordIcon,
};

const SOCIALS: SocialLink[] = [
  ...DISPLAY_SOCIALS.map((s) => ({
    name: s.name,
    href: s.href,
    Icon: SOCIAL_ICONS[s.key],
    hoverColor: s.hoverColor,
  })),
  // Le flux RSS n'est pas un compte : il vit ici, pas dans config/socials.ts.
  {
    name: 'RSS',
    href: '/api/news/rss',
    Icon: RssIcon,
    hoverColor: 'group-hover:text-[#F26522]',
  },
];

function FloatingSocials(): JSX.Element {
  const t = useT(nsFloatingSocials);
  return (
    <div className="fixed left-5 top-1/2 -translate-y-1/2 z-40 hidden lg:block print:hidden">
      <div className="relative">
        {/* Gradient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-b from-purple-500/25 via-pink-500/15 to-transparent opacity-70 blur-lg"
        />

        {/* Container */}
        <div className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
          {/* Socials */}
          <div className="flex flex-col gap-1">
            {SOCIALS.map(({ name, href, Icon, hoverColor }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noreferrer"
                title={name}
                aria-label={name}
                className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08]"
              >
                <Icon
                  className={`h-[18px] w-[18px] transition-all duration-200 group-hover:scale-110 ${hoverColor}`}
                  fill="currentColor"
                />
                <span className="pointer-events-none absolute left-full ml-3 -translate-x-2 whitespace-nowrap rounded-lg border border-white/10 bg-neutral-900/95 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur-md transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                  {name}
                  <span
                    aria-hidden="true"
                    className="absolute right-full top-1/2 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-neutral-900/95"
                  />
                </span>
              </a>
            ))}
          </div>

          {/* Divider */}
          <div
            aria-hidden="true"
            className="my-2 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
          />

          {/* Donate */}
          <Link
            href="/don"
            title={t.donateTitle}
            aria-label={t.donateTitle}
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-pink-300 transition-all duration-200 hover:-translate-y-0.5 hover:bg-pink-500/15"
          >
            <DonationIcon
              className="h-[18px] w-[18px] transition-all duration-200 group-hover:scale-110 group-hover:text-pink-400"
              fill="currentColor"
            />

            {/* QR popover on hover */}
            <div className="pointer-events-none absolute bottom-0 left-full ml-3 w-max -translate-x-2 rounded-2xl border border-white/10 bg-neutral-900/95 p-4 opacity-0 shadow-2xl backdrop-blur-md transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
              <p className="mb-2 text-center text-sm font-semibold text-white">
                {t.donateTitle}
              </p>
              <Image
                src="/images/qr.png"
                alt={t.qrAlt}
                width={128}
                height={128}
                className="rounded-lg"
              />
              <p className="mt-2 text-center text-xs text-gray-400">
                {t.scanPhone}
              </p>
              <span
                aria-hidden="true"
                className="absolute right-full top-1/2 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-neutral-900/95"
              />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default FloatingSocials;
