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
} from '@/components/Icons';

type SocialLink = {
  name: string;
  href: string;
  Icon: (props: Readonly<SVGTypes>) => JSX.Element;
};

const SOCIALS: SocialLink[] = [
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@ow_womenscup',
    Icon: TikTokIcon,
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/womenscup_asso',
    Icon: InstagramIcon,
  },
  {
    name: 'Twitch',
    href: 'https://www.twitch.tv/womens_cup',
    Icon: TwitchIcon,
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@owwomenscup',
    Icon: YouTubeIcon,
  },
  { name: 'RSS', href: '/api/news/rss', Icon: RssIcon },
];

function FloatingSocials(): JSX.Element {
  return (
    <div className="fixed left-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-1.5">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] p-2 shadow-xl shadow-black/20">
        {SOCIALS.map(({ name, href, Icon }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={name}
            className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <Icon
              className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110"
              fill="currentColor"
            />
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-xs font-medium text-white whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
              {name}
            </span>
          </a>
        ))}
      </div>
      <div className="group relative mt-1.5 flex flex-col items-center gap-1 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] p-2 shadow-xl shadow-black/20 hover:bg-white/10 transition-all duration-200 cursor-pointer overflow-visible">
        <Link href="/don" title="Faire un don">
          <Image
            src="/images/qr.png"
            alt="QR code pour faire un don"
            width={40}
            height={40}
            className="rounded"
          />
        </Link>
        <span className="text-[9px] font-medium text-gray-400">
          Faire un Don
        </span>
        <div className="pointer-events-none absolute left-full ml-3 bottom-0 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto transition-all duration-200 w-max rounded-2xl bg-neutral-900/95 backdrop-blur-md border border-white/10 p-4 shadow-2xl">
          <Image
            src="/images/qr.png"
            alt="QR code pour faire un don"
            width={128}
            height={128}
            className="rounded-lg"
          />
          <p className="mt-2 text-center text-xs font-medium text-gray-300">
            Scannez ce QR code avec votre téléphone
          </p>
        </div>
      </div>
    </div>
  );
}

export default FloatingSocials;
