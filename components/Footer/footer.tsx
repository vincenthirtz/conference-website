import React, { JSX } from 'react';
import Link from 'next/link';
import type { SVGTypes } from '@/types/types';
import { CookieSettingsButton } from '@/components/CookieBanner';
import {
  TikTokIcon,
  InstagramIcon,
  TwitchIcon,
  YouTubeIcon,
  RssIcon,
  RulesIcon,
  MailIcon,
  LegalShieldIcon,
  DonationIcon,
  SitemapIcon,
  NewsIcon,
  LiveIcon,
  SupportIcon,
  AboutIcon,
} from '@/components/Icons';

type FooterLink = {
  label: string;
  href: string;
  Icon: (props: Readonly<SVGTypes>) => JSX.Element;
  external?: boolean;
};

type SocialLink = {
  label: string;
  href: string;
  Icon: (props: Readonly<SVGTypes>) => JSX.Element;
};

const tournoiLinks: FooterLink[] = [
  { label: 'Live', href: '/live', Icon: LiveIcon },
  { label: 'Règlement', href: '/rules', Icon: RulesIcon },
  { label: 'Actualités OW', href: '/actualites', Icon: NewsIcon },
  { label: 'Plan du site', href: '/plan-du-site', Icon: SitemapIcon },
];

const communityLinks: FooterLink[] = [
  { label: 'À propos', href: '/about', Icon: AboutIcon },
  { label: 'Faire un don', href: '/don', Icon: DonationIcon },
  { label: 'Signalement / Support', href: '/support', Icon: SupportIcon },
];

const legalLinks: FooterLink[] = [
  { label: 'Nous contacter', href: '/contact', Icon: MailIcon },
  {
    label: 'Mentions légales',
    href: '/mentions-legales',
    Icon: LegalShieldIcon,
  },
];

const socials: SocialLink[] = [
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@ow_womenscup',
    Icon: TikTokIcon,
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/womenscup_asso',
    Icon: InstagramIcon,
  },
  {
    label: 'Twitch',
    href: 'https://www.twitch.tv/womens_cup',
    Icon: TwitchIcon,
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@owwomenscup',
    Icon: YouTubeIcon,
  },
  { label: 'RSS', href: '/api/news/rss', Icon: RssIcon },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {links.map(({ label, href, Icon, external }) => {
          const linkClass =
            'group flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors';
          const content = (
            <>
              <Icon
                className="w-4 h-4 transition-transform group-hover:scale-110"
                fill="currentColor"
              />
              <span>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                >
                  {content}
                </a>
              ) : (
                <Link href={href} className={linkClass}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Footer(): JSX.Element {
  return (
    <footer
      className="w-full bg-[var(--bg-deep)] border-t border-white/5 pt-12 pb-6 px-4"
      data-test="footer"
    >
      <div className="max-w-6xl mx-auto flex flex-col gap-10">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Col 1 — Brand + socials */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                OW Women&apos;s Cup
              </p>
              <p className="mt-2 text-sm text-gray-400 leading-relaxed max-w-xs">
                Le tournoi Overwatch 100&nbsp;% féminin et francophone.
                Communauté, compétition, bienveillance.
              </p>
            </div>
            <ul className="flex flex-wrap items-center gap-3">
              {socials.map(({ label, href, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-gray-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Icon className="w-4 h-4" fill="currentColor" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2 — Tournoi */}
          <FooterColumn title="Tournoi" links={tournoiLinks} />

          {/* Col 3 — Communauté + légal stacked */}
          <div className="flex flex-col gap-8">
            <FooterColumn title="Communauté" links={communityLinks} />
            <FooterColumn title="Légal & contact" links={legalLinks} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 border-t border-white/5 pt-6 text-xs text-gray-500 md:flex-row md:justify-between">
          <span className="text-center md:text-left">
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
