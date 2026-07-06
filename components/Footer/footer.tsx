import React, { JSX } from 'react';
import Link from 'next/link';
import type { SVGTypes } from '@/types/types';
import { CookieSettingsButton } from '@/components/CookieBanner';
import { useT } from '@/lib/i18n/useT';
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
  AppIcon,
  CodeIcon,
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

type FooterDict = ReturnType<typeof useT<'footer'>>;

const tournoiLinks = (t: FooterDict): FooterLink[] => [
  { label: t.ambassadors, href: '/live', Icon: LiveIcon },
  { label: t.rules, href: '/rules', Icon: RulesIcon },
  { label: t.news, href: '/actualites', Icon: NewsIcon },
  { label: t.sitemap, href: '/plan-du-site', Icon: SitemapIcon },
];

const communityLinks = (t: FooterDict): FooterLink[] => [
  { label: t.about, href: '/about', Icon: AboutIcon },
  { label: t.installApp, href: '/app', Icon: AppIcon },
  { label: t.donate, href: '/don', Icon: DonationIcon },
  { label: t.support, href: '/support', Icon: SupportIcon },
  { label: t.developers, href: '/developpeurs', Icon: CodeIcon },
];

const legalLinks = (t: FooterDict): FooterLink[] => [
  { label: t.contact, href: '/contact', Icon: MailIcon },
  {
    label: t.legal,
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
  const t = useT('footer');
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
                {t.tagline}
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
          <FooterColumn title={t.colTournament} links={tournoiLinks(t)} />

          {/* Col 3 — Communauté + légal stacked */}
          <div className="flex flex-col gap-8">
            <FooterColumn title={t.colCommunity} links={communityLinks(t)} />
            <FooterColumn title={t.colLegal} links={legalLinks(t)} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 border-t border-white/5 pt-6 text-xs text-gray-400 md:flex-row md:justify-between">
          <span className="text-center md:text-left">
            {t.copyright}{' '}
            <a
              href="https://www.twitch.tv/arukdo"
              target="_blank"
              rel="noreferrer"
              className="text-gray-300 underline underline-offset-2 hover:text-white transition-colors"
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
