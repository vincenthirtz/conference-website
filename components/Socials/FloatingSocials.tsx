import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';
import type { SVGTypes } from '@/types/types';
import {
  TikTokIcon,
  InstagramIcon,
  TwitchIcon,
  YouTubeIcon,
  RssIcon,
  DonationIcon,
} from '@/components/Icons';

type SocialLink = {
  name: string;
  href: string;
  Icon: (props: Readonly<SVGTypes>) => JSX.Element;
  hoverColor: string;
};

const SOCIALS: SocialLink[] = [
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@ow_womenscup',
    Icon: TikTokIcon,
    hoverColor: 'group-hover:text-[#FF0050]',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/womenscup_asso',
    Icon: InstagramIcon,
    hoverColor: 'group-hover:text-[#E1306C]',
  },
  {
    name: 'Twitch',
    href: 'https://www.twitch.tv/womens_cup',
    Icon: TwitchIcon,
    hoverColor: 'group-hover:text-[#9146FF]',
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@owwomenscup',
    Icon: YouTubeIcon,
    hoverColor: 'group-hover:text-[#FF0000]',
  },
  {
    name: 'RSS',
    href: '/api/news/rss',
    Icon: RssIcon,
    hoverColor: 'group-hover:text-[#F26522]',
  },
];

function FloatingSocials(): JSX.Element {
  return (
    <div className="fixed left-5 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
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
            title="Faire un don"
            aria-label="Faire un don"
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-pink-300 transition-all duration-200 hover:-translate-y-0.5 hover:bg-pink-500/15"
          >
            <DonationIcon
              className="h-[18px] w-[18px] transition-all duration-200 group-hover:scale-110 group-hover:text-pink-400"
              fill="currentColor"
            />

            {/* QR popover on hover */}
            <div className="pointer-events-none absolute bottom-0 left-full ml-3 w-max -translate-x-2 rounded-2xl border border-white/10 bg-neutral-900/95 p-4 opacity-0 shadow-2xl backdrop-blur-md transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
              <p className="mb-2 text-center text-sm font-semibold text-white">
                Faire un don
              </p>
              <Image
                src="/images/qr.png"
                alt="QR code pour faire un don"
                width={128}
                height={128}
                className="rounded-lg"
              />
              <p className="mt-2 text-center text-xs text-gray-400">
                Scanne avec ton téléphone
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
