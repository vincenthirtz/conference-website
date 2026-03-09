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

const footerLinks: FooterLink[] = [
  { label: 'Règlement', href: '/rules', Icon: RulesIcon },
  { label: 'Nous contacter', href: '/contact', Icon: MailIcon },
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
  {
    label: 'Déploiements',
    href: '/builds',
    Icon: DeployIcon,
  },
];

function Footer(): JSX.Element {
  return (
    <div
      className="container relative overflow-hidden"
      data-test="footer"
    >
      <div className="relative z-10">
        <div
          className="w-full flex justify-between items-center p-4 sm:flex-col sm:gap-3"
          data-test="footer-asyncAPI-logo"
        >
          <div className="mt-2 text-[14px] text-gray-100 ">
            <div className="flex items-center gap-6">
              {footerLinks.map(({ label, href, Icon, external }) => {
                const linkContent = (
                  <>
                    <span>{label}</span>
                    <Icon className="w-4 h-4 ml-2" fill="white" />
                  </>
                );

                const linkClass =
                  'hover:underline text-white duration-200 ease-in-out flex items-center';

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
            </div>
          </div>
          <div></div>
          <div className="flex items-center justify-between sm:flex-col sm:items-center">
            <div className="text-white text-center flex items-center gap-2 flex-wrap justify-center">
              <span>
                Association WOMEN&apos;S CUP - Tous droits réservés - Fait avec
                ❤️ par{' '}
                <a
                  href="https://www.twitch.tv/arukdo"
                  target="_blank"
                  rel="noreferrer"
                >
                  Arukdo
                </a>
                .
              </span>
              <span className="hidden sm:inline">|</span>
              <CookieSettingsButton />
            </div>
            <div className="w-[0.9px] h-4 bg-white ml-4 sm:hidden" />
            <div className="ml-4 flex justify-between items-center gap-2 sm:mt-4">
              {socials.map((social: SocialWithIcon) => {
                const IconComponent = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg flex items-center justify-center hover:border-[#AD20E2] duration-150 ease-in-out"
                    data-test={`footer-${social.name}`}
                  >
                    <IconComponent className="w-[20px] h-[20px]" fill="white" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Footer;
