import type { JSX } from 'react';

type SocialLink = {
  name: string;
  href: string;
  icon: JSX.Element;
};

const SOCIALS: SocialLink[] = [
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@ow_womenscup',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.51v-3.45a4.85 4.85 0 0 1-1-.08Z" />
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/ow_womenscup',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'Twitch',
    href: 'https://www.twitch.tv/womens_cup',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M3.5 2 2 5.5V20h5v2.5h3L12.5 20H17l4.5-4.5V2H3.5Zm16 12.5L16 18h-4.5L9 20.5V18H5V3.5h14.5v11ZM14 7v5h1.5V7H14Zm-4 0v5h1.5V7H10Z" />
      </svg>
    ),
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@owwomenscup',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
      </svg>
    ),
  },
  {
    name: 'RSS',
    href: '/api/news/rss',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6.18" cy="17.82" r="2.18" />
        <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56Z" />
        <path d="M4 10.1v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9Z" />
      </svg>
    ),
  },
];

function FloatingSocials(): JSX.Element {
  return (
    <div className="fixed left-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-1.5">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] p-2 shadow-xl shadow-black/20">
        {SOCIALS.map((social) => (
          <a
            key={social.name}
            href={social.href}
            target="_blank"
            rel="noreferrer"
            title={social.name}
            className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-all duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110"
          >
            {social.icon}
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-xs font-medium text-white whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
              {social.name}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default FloatingSocials;
