import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

type SiteSection = {
  title: string;
  description: string;
  links: { label: string; href: string }[];
};

const siteSections: SiteSection[] = [
  {
    title: 'Pages principales',
    description: 'Navigation g\u00e9n\u00e9rale du site public.',
    links: [
      { label: 'Accueil', href: '/' },
      { label: "L'association", href: '/association' },
      { label: '\u00c0 propos', href: '/about' },
      { label: 'Partenaires', href: '/partenaires' },
      { label: 'Tournoi 2025', href: '/tournoi' },
      { label: 'Timeline 2026', href: '/timeline-2026' },
      { label: 'Tous les tournois', href: '/tournaments' },
      { label: 'Jeux supportés', href: '/jeux' },
      { label: "Installer l'app", href: '/app' },
    ],
  },
  {
    title: 'Contenu & m\u00e9dias',
    description: 'Actualit\u00e9s, lore et ressources Overwatch.',
    links: [
      { label: 'Actualit\u00e9s', href: '/actualites' },
      { label: 'Live', href: '/live' },
      { label: 'Lore & m\u00e9dias', href: '/lore' },
      { label: 'Hero Picker', href: '/hero-picker' },
    ],
  },
  {
    title: 'Participer',
    description: 'Inscription, \u00e9quipes et \u00e9changes avec le staff.',
    links: [
      { label: 'Inscription staff / joueur', href: '/register' },
      {
        label: 'Inscription tournoi f\u00e9minin 2026',
        href: '/inscription-2026',
      },
      { label: 'Cr\u00e9er une \u00e9quipe', href: '/team/create' },
      {
        label: 'Guide capitaine \u2014 g\u00e9rer mon \u00e9quipe',
        href: '/guide/gerer-mon-equipe',
      },
      {
        label: 'Espace capitaine \u2014 pr\u00e9sentation',
        href: '/espace-capitaine',
      },
      { label: 'Espace joueur', href: '/player' },
      { label: 'Devenir partenaire', href: '/partenaires/demande' },
      { label: 'Proposer un scrim', href: '/scrim' },
      { label: 'Contact', href: '/contact' },
      { label: 'Signalement / Support', href: '/support' },
      { label: 'Faire un don', href: '/don' },
    ],
  },
  {
    title: 'Infos officielles',
    description: 'Documents et r\u00e9f\u00e9rences cl\u00e9s pour le tournoi.',
    links: [
      { label: 'R\u00e8glement', href: '/rules' },
      { label: 'Mentions l\u00e9gales', href: '/mentions-legales' },
      { label: 'D\u00e9ploiements', href: '/builds' },
    ],
  },
  {
    title: 'Plan & ressources',
    description: 'Plan du site et liens pour les moteurs de recherche.',
    links: [
      { label: 'Plan du site', href: '/plan-du-site' },
      { label: 'Sitemap XML', href: '/sitemap.xml' },
    ],
  },
  {
    title: 'Espace staff',
    description: "Acc\u00e8s r\u00e9serv\u00e9 \u00e0 l'organisation.",
    links: [
      { label: 'Dashboard staff', href: '/admin' },
      { label: 'Connexion staff', href: '/admin/login' },
      { label: 'Mot de passe oubli\u00e9', href: '/admin/forgot-password' },
      {
        label: 'R\u00e9initialiser le mot de passe',
        href: '/admin/reset-password',
      },
    ],
  },
];

function SiteMapPage() {
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
            Plan du site
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            Tous les liens internes, en un coup d&apos;&#339;il
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-200">
            Retrouvez ici l&apos;ensemble des pages publiques et des
            acc&egrave;s staff. Le sitemap XML reste disponible pour les moteurs
            de recherche et les int&eacute;grations externes.
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200">
            <span className="rounded-full bg-purple-500/20 px-2 py-[2px] text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-100">
              Ressource
            </span>
            <Link
              href="/sitemap.xml"
              className="font-semibold text-white underline decoration-purple-300/60 decoration-2 underline-offset-4"
            >
              Ouvrir le sitemap.xml
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
  title: 'Plan du site',
  description:
    "Parcourez l'ensemble des liens internes de l'OW Women's Cup (pages publiques, participation, staff) et acc\u00e9dez au sitemap XML.",
};

SiteMapPage.seo = siteMapSeo;

export default SiteMapPage;
