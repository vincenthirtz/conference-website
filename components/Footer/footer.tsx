import React, { JSX } from 'react';
import Link from 'next/link';
import type { SVGTypes } from '@/types/types';
import socials, { SocialWithIcon } from '@/config/socials';
import { CookieSettingsButton } from '@/components/CookieBanner';

function RulesIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M14 3.5V8h4.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9 12h6"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9 16h3.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function MailIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2"
        ry="2"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="m4.5 8.5 7.5 4.8 7.5-4.8"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function LegalShieldIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3 6 5v6c0 4.4 3 8.2 6 9.5 3-1.3 6-5.1 6-9.5V5l-6-2Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="m9 12.5 2.2 2.2L15.5 10"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function DonationIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 20s-6.5-3.6-6.5-9A4.5 4.5 0 0 1 12 6.5 4.5 4.5 0 0 1 18.5 11c0 5.4-6.5 9-6.5 9Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="11"
        r="2.4"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M12 9.6v2.8M11.1 11h1.8"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SitemapIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8.5"
        y="3.5"
        width="7"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <rect
        x="3"
        y="16.5"
        width="5.5"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <rect
        x="10"
        y="16.5"
        width="4"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <rect
        x="15.5"
        y="16.5"
        width="5.5"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M12 8v4.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 14.5h-4.5V16"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 14.5h4.5V16"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 14.5v1.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function DeployIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3 7 8.5l3 .5-4 7 5.5-5 .5 3 5.5-5.5L12 3Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M5 19h4M15 19h4"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function OverwatchNewsIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Overwatch-inspired logo with news element */}
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function LoreMediaIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Book/media icon for lore */}
      <path
        d="M4 4.5A2.5 2.5 0 0 1 6.5 2H18a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 19.5v-15Z"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M8 6h8M8 10h5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

type FooterLink = {
  label: string;
  href: string;
  Icon: (props: Readonly<SVGTypes>) => JSX.Element;
  external?: boolean;
};

function LiveIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        fill={stroke}
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M7.5 7.5a6.4 6.4 0 0 0 0 9"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M16.5 7.5a6.4 6.4 0 0 1 0 9"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M4.5 4.5a11 11 0 0 0 0 15"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M19.5 4.5a11 11 0 0 1 0 15"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SupportIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10A1.5 1.5 0 0 1 18.5 17H8l-4 3.5V5.5Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 8.5v3.2"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="14" r="0.9" fill={stroke} />
    </svg>
  );
}

function AboutIcon({ className, fill }: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <line
        x1="12"
        y1="11"
        x2="12"
        y2="17"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.5" r="1" fill={stroke} />
    </svg>
  );
}

const footerLinks: FooterLink[] = [
  { label: 'Live', href: '/live', Icon: LiveIcon },
  { label: 'À propos', href: '/about', Icon: AboutIcon },
  { label: 'Règlement', href: '/rules', Icon: RulesIcon },
  { label: 'Nous contacter', href: '/contact', Icon: MailIcon },
  { label: 'Signalement / Support', href: '/support', Icon: SupportIcon },
  { label: 'Faire un don', href: '/don', Icon: DonationIcon },
  { label: 'Actualités OW', href: '/actualites', Icon: OverwatchNewsIcon },
  // { label: 'Lore & Médias', href: '/lore', Icon: LoreMediaIcon },
  {
    label: 'Mentions légales',
    href: '/mentions-legales',
    Icon: LegalShieldIcon,
  },
  {
    label: 'Plan du site',
    href: '/plan-du-site',
    Icon: SitemapIcon,
  },
];

function Footer(): JSX.Element {
  return (
    <footer
      className="w-full bg-[#130d22] border-t border-white/5 pt-12 pb-6 px-4"
      data-test="footer"
    >
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-8">
        {/* Social links */}
        <div className="flex items-center gap-5 flex-wrap justify-center">
          <a
            href="https://www.tiktok.com/@ow_womenscup"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.51v-3.45a4.85 4.85 0 0 1-1-.08Z" />
            </svg>
            <span className="text-sm">TikTok</span>
          </a>
          <a
            href="https://www.instagram.com/womenscup_asso"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="text-sm">Instagram</span>
          </a>
          <a
            href="https://www.twitch.tv/womens_cup"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3.5 2 2 5.5V20h5v2.5h3L12.5 20H17l4.5-4.5V2H3.5Zm16 12.5L16 18h-4.5L9 20.5V18H5V3.5h14.5v11ZM14 7v5h1.5V7H14Zm-4 0v5h1.5V7H10Z" />
            </svg>
            <span className="text-sm">Twitch</span>
          </a>
          <a
            href="https://www.youtube.com/@owwomenscup"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
            </svg>
            <span className="text-sm">YouTube</span>
          </a>
          <a
            href="/api/news/rss"
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="6.18" cy="17.82" r="2.18" />
              <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56Z" />
              <path d="M4 10.1v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9Z" />
            </svg>
            <span className="text-sm">RSS</span>
          </a>
          {socials.map((social: SocialWithIcon) => {
            const IconComponent = social.icon;
            return (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
              >
                <IconComponent className="w-5 h-5" fill="currentColor" />
                <span className="text-sm">{social.name}</span>
              </a>
            );
          })}
        </div>

        {/* Navigation links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {footerLinks.map(({ label, href, Icon, external }) => {
            const linkClass =
              'flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors';

            const linkContent = (
              <>
                <Icon className="w-4 h-4" fill="currentColor" />
                <span>{label}</span>
              </>
            );

            return external ? (
              <a key={label} href={href} className={linkClass}>
                {linkContent}
              </a>
            ) : (
              <Link key={label} href={href} className={linkClass}>
                {linkContent}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col items-center gap-3 text-xs text-gray-500">
          <span className="text-center">
            Association WOMEN&apos;S CUP &mdash; Tous droits réservés &mdash;
            Fait avec ❤️ par{' '}
            <a
              href="https://www.twitch.tv/arukdo"
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Arukdo
            </a>
          </span>
          <CookieSettingsButton />
        </div>
      </div>
    </footer>
  );
}

export default Footer;
