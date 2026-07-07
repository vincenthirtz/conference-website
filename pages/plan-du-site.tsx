import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type PlanDict = ReturnType<typeof useT<'planDuSite'>>;

type SiteSection = {
  title: string;
  description: string;
  links: { label: string; href: string }[];
};

const getSiteSections = (t: PlanDict): SiteSection[] => [
  {
    title: t.section1Title,
    description: t.section1Desc,
    links: [
      { label: t.linkHome, href: '/' },
      { label: t.linkAssociation, href: '/association' },
      { label: t.linkAbout, href: '/about' },
      { label: t.linkPartners, href: '/partenaires' },
      { label: t.linkTournament2025, href: '/tournoi' },
      { label: t.linkTimeline2026, href: '/timeline-2026' },
      { label: t.linkAllTournaments, href: '/tournaments' },
      { label: t.linkGames, href: '/jeux' },
      { label: t.linkInstallApp, href: '/app' },
    ],
  },
  {
    title: t.section2Title,
    description: t.section2Desc,
    links: [
      { label: t.linkNews, href: '/actualites' },
      { label: t.linkAmbassadors, href: '/live' },
      { label: t.linkLore, href: '/lore' },
      { label: t.linkHeroPicker, href: '/hero-picker' },
    ],
  },
  {
    title: t.section3Title,
    description: t.section3Desc,
    links: [
      { label: t.linkRegister, href: '/register' },
      { label: t.linkRegister2026, href: '/inscription-2026' },
      { label: t.linkCreateTeam, href: '/team/create' },
      { label: t.linkCaptainGuide, href: '/guide/gerer-mon-equipe' },
      { label: t.linkCaptainSpace, href: '/espace-capitaine' },
      { label: t.linkPlayerSpace, href: '/player' },
      { label: t.linkBecomePartner, href: '/partenaires/demande' },
      { label: t.linkProposeScrim, href: '/scrim' },
      { label: t.linkContact, href: '/contact' },
      { label: t.linkSupport, href: '/support' },
      { label: t.linkDonate, href: '/don' },
    ],
  },
  {
    title: t.section4Title,
    description: t.section4Desc,
    links: [
      { label: t.linkRules, href: '/rules' },
      { label: t.linkLegal, href: '/mentions-legales' },
      { label: t.linkBuilds, href: '/builds' },
    ],
  },
  {
    title: t.section5Title,
    description: t.section5Desc,
    links: [
      { label: t.linkSitemap, href: '/plan-du-site' },
      { label: t.linkSitemapXml, href: '/sitemap.xml' },
    ],
  },
  {
    title: t.section6Title,
    description: t.section6Desc,
    links: [
      { label: t.linkStaffDashboard, href: '/admin' },
      { label: t.linkStaffLogin, href: '/admin/login' },
      { label: t.linkForgotPassword, href: '/admin/forgot-password' },
      { label: t.linkResetPassword, href: '/admin/reset-password' },
    ],
  },
];

function SiteMapPage() {
  const t = useT('planDuSite');
  const siteSections = getSiteSections(t);
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 -top-20 h-64 w-64 rounded-full bg-purple-500/25 blur-3xl" />
          <div className="absolute right-0 top-10 h-56 w-56 rounded-full bg-pink-500/20 blur-3xl" />
          <div className="absolute left-10 bottom-0 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-12 sm:pt-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200">
            <span className="rounded-full bg-purple-500/20 px-2 py-[2px] text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-100">
              {t.resourceBadge}
            </span>
            <Link
              href="/sitemap.xml"
              className="font-semibold text-white underline decoration-purple-300/60 decoration-2 underline-offset-4"
            >
              {t.openSitemap}
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-8 px-4 pb-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {siteSections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/25"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-300">
                    {section.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white transition hover:border-white/30 hover:bg-white/10"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-xs text-purple-100 transition group-hover:bg-purple-500/40">
                        &gt;
                      </span>
                      {link.label}
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      {link.href}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const siteMapSeo: SeoProps = {
  title: {
    fr: 'Plan du site',
    en: 'Site map',
  },
  description: {
    fr: "Parcourez l'ensemble des liens internes de l'OW Women's Cup (pages publiques, participation, staff) et accédez au sitemap XML.",
    en: "Browse every internal link on OW Women's Cup (public pages, participation, staff) and access the XML sitemap.",
  },
};

SiteMapPage.seo = siteMapSeo;

export default SiteMapPage;
