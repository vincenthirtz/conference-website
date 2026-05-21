import Image from 'next/image';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { POLE_KEYS, type PoleKey } from '@/utils/associationPoles';

const ADHESION_URL =
  'https://www.helloasso.com/associations/women-s-cup/adhesions/adhesion-2026-2027-women-s-cup';

const adhesionPerks = [
  'Soutenir financièrement la scène Overwatch féminine francophone.',
  'Participer aux assemblées générales et voter les orientations.',
  'Accès prioritaire aux ateliers, scrims et événements communautaires.',
  'Reçu fiscal HelloAsso dès la finalisation du paiement.',
];

import { logger } from '../utils/logger';
type CastMember = {
  id: string;
  name: string;
  title: string | null;
  image_url: string | null;
  twitch_url: string | null;
  city: string | null;
  is_promo: boolean;
};

type PoleMember = {
  id: string;
  pole_key: PoleKey;
  name: string;
  title: string | null;
  image_url: string | null;
  link_url: string | null;
};

type Props = {
  castMembers: CastMember[];
  poleMembers: PoleMember[];
};

const pillars = [
  {
    title: 'Inclusion',
    detail:
      'Accompagnement des joueuses d\u00e9butantes et confirm\u00e9es, encadrement staff form\u00e9 et mod\u00e9ration active pour des espaces s\u00fbrs.',
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
        />
      </svg>
    ),
    color: 'from-purple-500/20 to-purple-600/5',
    accent: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  {
    title: 'Visibilit\u00e9',
    detail:
      'Casts 100\u202f% f\u00e9minins, interviews et contenus p\u00e9dagogiques pour montrer des r\u00f4les mod\u00e8les et inspirer les futures comp\u00e9titrices.',
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
        />
      </svg>
    ),
    color: 'from-pink-500/20 to-pink-600/5',
    accent: 'text-pink-400',
    border: 'border-pink-500/20',
  },
  {
    title: 'Terrain',
    detail:
      'Tournois en ligne, ateliers d\u00e9couverte, mentorat et relais avec les communaut\u00e9s locales pour faire \u00e9merger de nouvelles \u00e9quipes.',
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-3.52 1.122 6.023 6.023 0 01-3.52-1.122"
        />
      </svg>
    ),
    color: 'from-cyan-500/20 to-cyan-600/5',
    accent: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
];

const commitments: Array<{ text: React.ReactNode; icon: React.ReactNode }> = [
  {
    text: (
      <>
        Respect des{' '}
        <Link
          href="/rules"
          className="font-medium text-emerald-300 underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-200 hover:decoration-emerald-300"
        >
          r&egrave;gles officielles Overwatch
        </Link>{' '}
        et du code de conduite Blizzard.
      </>
    ),
    icon: (
      <svg
        className="w-5 h-5 text-emerald-400 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
    ),
  },
  {
    text: (
      <>
        Charte anti-harc&egrave;lement et{' '}
        <Link
          href="/support"
          className="font-medium text-emerald-300 underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-200 hover:decoration-emerald-300"
        >
          proc&eacute;dure de signalement
        </Link>{' '}
        claire (staff d&eacute;di&eacute;).
      </>
    ),
    icon: (
      <svg
        className="w-5 h-5 text-emerald-400 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z"
        />
      </svg>
    ),
  },
  {
    text: 'Priorit\u00e9 aux opportunit\u00e9s pour les talents f\u00e9minins : joueuses, casters, admins, graphistes.',
    icon: (
      <svg
        className="w-5 h-5 text-emerald-400 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
    ),
  },
  {
    text: 'Transparence budg\u00e9taire : rapports d\u2019impact et allocation des dons par poste.',
    icon: (
      <svg
        className="w-5 h-5 text-emerald-400 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

const teamRoles: Array<{
  poleKey: PoleKey;
  title: string;
  desc: string;
  accent: string;
  iconColor: string;
  badge: string;
  icon: React.ReactNode;
}> = [
  {
    poleKey: 'direction',
    title: 'Direction & admin',
    desc: 'Organisation g\u00e9n\u00e9rale, partenariats, suivi des budgets.',
    accent: 'from-purple-500/25 to-purple-600/5',
    iconColor: 'text-purple-300',
    badge: 'border-purple-400/30 bg-purple-500/10 text-purple-200',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
        />
      </svg>
    ),
  },
  {
    poleKey: 'tournoi',
    title: 'Tournoi & arbitrage',
    desc: 'R\u00e8gles, lobby settings, gestion des matchs et litiges.',
    accent: 'from-cyan-500/25 to-cyan-600/5',
    iconColor: 'text-cyan-300',
    badge: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"
        />
      </svg>
    ),
  },
  {
    poleKey: 'production',
    title: 'Production & cast',
    desc: 'Overlay, graphismes, casters et mod\u00e9ration live.',
    accent: 'from-pink-500/25 to-pink-600/5',
    iconColor: 'text-pink-300',
    badge: 'border-pink-400/30 bg-pink-500/10 text-pink-200',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
    ),
  },
  {
    poleKey: 'communaute',
    title: 'Communaut\u00e9',
    desc: 'Mentorat, ateliers, communication et support joueuses/\u00e9quipes.',
    accent: 'from-emerald-500/25 to-emerald-600/5',
    iconColor: 'text-emerald-300',
    badge: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    ),
  },
];

const stats = [
  { value: '100%', label: 'F\u00e9minin' },
  { value: '3', label: '\u00c9ditions' },
  { value: '10+', label: 'B\u00e9n\u00e9voles' },
  { value: '50+', label: 'Joueuses' },
];

const timeline = [
  {
    year: '2025',
    title: 'La naissance',
    desc: 'Premi\u00e8re \u00e9dition de l\u2019OW Women\u2019s Cup. Un pari fou : un tournoi Overwatch 100\u202f% f\u00e9minin et francophone, port\u00e9 par une poign\u00e9e de passionn\u00e9es.',
  },
  {
    year: '2026',
    title: 'La croissance',
    desc: 'Deuxi\u00e8me \u00e9dition avec plus d\u2019\u00e9quipes, des partenariats, un cast professionnel en direct sur Twitch et la cr\u00e9ation de l\u2019association.',
  },
  {
    year: '2027',
    title: 'L\u2019ambition',
    desc: 'Troisi\u00e8me \u00e9dition en pr\u00e9paration avec un format \u00e9largi, un tournoi mixte, et l\u2019objectif de devenir une r\u00e9f\u00e9rence de l\u2019esport f\u00e9minin francophone.',
  },
];

function AssociationPage({ castMembers, poleMembers }: Props) {
  const { value: contactEmail } = useSiteSetting('contact_email');

  const membersByPole = POLE_KEYS.reduce<Record<PoleKey, PoleMember[]>>(
    (acc, key) => {
      acc[key] = poleMembers.filter((m) => m.pole_key === key);
      return acc;
    },
    { direction: [], tournoi: [], production: [], communaute: [] }
  );

  // Le pôle "Production & cast" inclut aussi les casteuses actives (hors carte promo).
  const castAsPoleMembers: PoleMember[] = castMembers
    .filter((m) => !m.is_promo)
    .map((m) => ({
      id: `cast-${m.id}`,
      pole_key: 'production',
      name: m.name,
      title: m.title,
      image_url: m.image_url,
      link_url: m.twitch_url,
    }));
  membersByPole.production = [...membersByPole.production, ...castAsPoleMembers];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-purple-600/25 blur-[120px]" />
          <div className="absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-pink-500/15 blur-[100px]" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[300px] w-[600px] rounded-full bg-cyan-500/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-36 pb-20 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Association loi 1901
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="block">Faire briller</span>
            <span className="block text-gradient">
              l&apos;esport f&eacute;minin
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            La Women&apos;s Cup est une association b&eacute;n&eacute;vole qui
            organise le premier tournoi Overwatch 100&nbsp;% f&eacute;minin et
            francophone. Notre mission&nbsp;: cr&eacute;er des espaces inclusifs
            et ambitieux pour les talents de la sc&egrave;ne comp&eacute;titive.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href={ADHESION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5"
            >
              Adh&eacute;rer 2026&nbsp;-&nbsp;2027
            </a>
            <Link
              href="/don"
              className="rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
            >
              Faire un don
            </Link>
            <Link
              href="#adhesion"
              className="rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
            >
              Voir les avantages
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-5"
              >
                <p className="text-3xl font-bold text-gradient sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-20 px-4 pb-24 sm:px-6">
        {/* ── Notre histoire ──────────────────────────────── */}
        <section>
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.18em] text-purple-300">
              Notre parcours
            </p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              Une aventure qui grandit
            </h2>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/50 via-pink-500/50 to-cyan-500/50 hidden sm:block" />

            <div className="space-y-8 sm:space-y-12">
              {timeline.map((item, idx) => (
                <div key={item.year} className="relative sm:pl-16">
                  {/* Dot */}
                  <div className="absolute left-4 top-1 hidden sm:flex h-5 w-5 items-center justify-center">
                    <div className="h-3 w-3 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 ring-4 ring-neutral-950" />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:bg-white/[0.06] hover:border-white/15">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 px-3 py-1 text-xs font-bold text-purple-300">
                        {item.year}
                      </span>
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-300">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Piliers ─────────────────────────────────────── */}
        <section>
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.18em] text-pink-300">
              Nos valeurs
            </p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              Trois piliers fondateurs
            </h2>
            <p className="mt-3 mx-auto max-w-xl text-sm text-gray-400">
              Chaque action de l&apos;association s&apos;inscrit dans une de ces
              missions.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {pillars.map((pillar) => (
              <div
                key={pillar.title}
                className={`group rounded-2xl border ${pillar.border} bg-gradient-to-b ${pillar.color} p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20`}
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-white/[0.08] flex items-center justify-center ${pillar.accent} mb-4`}
                >
                  {pillar.icon}
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  {pillar.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Engagements ─────────────────────────────────── */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-8 sm:p-12 shadow-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                Engagements
              </p>
              <h3 className="mt-1 text-2xl font-bold sm:text-3xl">
                Ce qui nous guide
              </h3>
            </div>
            <p className="text-sm text-gray-400 max-w-xs">
              Un cadre sain pour les joueuses, le staff et toute la
              communaut&eacute;.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {commitments.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
              >
                {item.icon}
                <p className="text-sm leading-relaxed text-gray-200">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Adh&eacute;sion 2026-2027 ────────────────────────── */}
        <section
          id="adhesion"
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-900/30 via-pink-900/20 to-cyan-900/20 shadow-2xl"
        >
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute -left-32 -top-24 h-72 w-72 rounded-full bg-purple-500/20 blur-[100px]" />
            <div className="absolute right-0 bottom-0 h-72 w-72 rounded-full bg-pink-500/20 blur-[110px]" />
          </div>

          <div className="relative grid gap-10 p-8 sm:p-12 md:grid-cols-[1fr_auto] md:gap-12 md:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-purple-200">
                <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-pulse" />
                Campagne ouverte
              </p>
              <h3 className="mt-4 text-3xl font-bold sm:text-4xl">
                <span className="block">Devenir adh&eacute;rent&middot;e</span>
                <span className="block text-gradient">saison 2026 - 2027</span>
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-300">
                Rejoindre l&apos;association, c&apos;est faire vivre la
                comp&eacute;tition Overwatch f&eacute;minine francophone et
                soutenir directement nos actions toute la saison. L&apos;adh&eacute;sion
                est valable jusqu&apos;au 31 ao&ucirc;t 2027.
              </p>

              <ul className="mt-6 space-y-3">
                {adhesionPerks.map((perk) => (
                  <li key={perk} className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-pink-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                      />
                    </svg>
                    <span className="text-sm leading-relaxed text-gray-200">
                      {perk}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <a
                  href={ADHESION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5"
                >
                  Adh&eacute;rer sur HelloAsso
                  <svg
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </a>
                <span className="text-xs text-gray-400">
                  Paiement s&eacute;curis&eacute; &middot; Re&ccedil;u fiscal
                  automatique
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/95 p-4 shadow-xl shadow-purple-900/30">
                <Image
                  src="/images/qradhesion2026.png"
                  alt="QR code vers la campagne d'adh&eacute;sion 2026-2027"
                  width={180}
                  height={180}
                  className="rounded-lg"
                  unoptimized
                />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
                  Scanner pour adh&eacute;rer
                </p>
              </div>
              <p className="mt-3 max-w-[200px] text-center text-[11px] leading-relaxed text-gray-400 md:text-right">
                Pointe ton t&eacute;l&eacute;phone vers ce QR code pour acc&eacute;der
                directement au formulaire HelloAsso.
              </p>
            </div>
          </div>
        </section>

        {/* ── P&ocirc;les ─────────────────────────────────────────── */}
        <section>
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
              Qui fait quoi
            </p>
            <h3 className="mt-2 text-2xl font-bold sm:text-3xl">
              Les p&ocirc;les de l&apos;&eacute;quipe
            </h3>
            <p className="mt-3 mx-auto max-w-xl text-sm text-gray-400">
              Chacun peut proposer son aide. L&apos;asso fonctionne par
              p&ocirc;les th&eacute;matiques anim&eacute;s par des
              b&eacute;n&eacute;voles motiv&eacute;es.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {teamRoles.map((role) => {
              const members = membersByPole[role.poleKey] ?? [];
              return (
              <div
                key={role.title}
                className={`group flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-br ${role.accent} p-5 transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg hover:shadow-black/20`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center ${role.iconColor} flex-shrink-0 group-hover:text-white transition-colors`}
                  >
                    {role.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{role.title}</p>
                    <p className="mt-1 text-sm text-gray-400">{role.desc}</p>
                  </div>
                </div>

                {members.length > 0 && (
                  <div className="border-t border-white/5 pt-3">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                      Membres
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((member) => {
                        const content = (
                          <span className="inline-flex items-center gap-2">
                            {member.image_url ? (
                              <Image
                                src={member.image_url}
                                alt=""
                                width={18}
                                height={18}
                                className="h-4.5 w-4.5 rounded-full object-cover"
                                unoptimized
                              />
                            ) : null}
                            <span className="font-medium">{member.name}</span>
                            {member.title ? (
                              <span className="opacity-70">— {member.title}</span>
                            ) : null}
                          </span>
                        );
                        const className = `inline-flex items-center rounded-full border ${role.badge} px-2.5 py-1 text-xs font-medium ${
                          member.link_url ? 'transition hover:bg-white/10' : ''
                        }`;
                        return member.link_url ? (
                          <a
                            key={member.id}
                            href={member.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={className}
                          >
                            {content}
                          </a>
                        ) : (
                          <span key={member.id} className={className}>
                            {content}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </section>

        {/* ── CTA Contact ─────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-pink-600/10 to-cyan-600/10 pointer-events-none" />
          <div className="relative p-8 sm:p-12 text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/10 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h4 className="text-2xl font-bold sm:text-3xl">
              Envie d&apos;aider ou de collaborer&nbsp;?
            </h4>
            <p className="mt-3 mx-auto max-w-md text-sm text-gray-300">
              Rejoins l&apos;asso en tant que b&eacute;n&eacute;vole, propose un
              partenariat ou pose tes questions. On r&eacute;pond vite.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              <a
                href={`mailto:${contactEmail}?subject=Rejoindre%20l%27association%20OW%20Women%27s%20Cup`}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
                {contactEmail}
              </a>
              <a
                href={ADHESION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:shadow-xl hover:shadow-purple-900/50 hover:-translate-y-0.5"
              >
                Adh&eacute;rer
              </a>
              <Link
                href="/don"
                className="rounded-full border border-white/20 bg-white/5 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 hover:border-white/30"
              >
                Faire un don
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  if (!supabaseAdmin) {
    return {
      props: {
        castMembers: [],
        poleMembers: [],
      },
      revalidate: 60,
    };
  }

  // S5d:
  //  - `cast_members` est tenant-scopée → DEFAULT_TENANT_ID (getStaticProps).
  //    TODO(S7) — basculer en SSR/ISR per tenant.
  //  - `association_pole_members` est globale (pas de tenant_id) → pas de
  //    filtre tenant.
  const [castRes, poleRes] = await Promise.all([
    supabaseAdmin
      .from('cast_members')
      .select('id, name, title, image_url, twitch_url, city, is_promo')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('association_pole_members')
      .select('id, pole_key, name, title, image_url, link_url')
      .eq('is_active', true)
      .order('pole_key', { ascending: true })
      .order('sort_order', { ascending: true }),
  ]);

  if (castRes.error) {
    logger.error('[association] Error fetching cast members:', castRes.error);
  }
  if (poleRes.error) {
    logger.error('[association] Error fetching pole members:', poleRes.error);
  }

  return {
    props: {
      castMembers: castRes.data ?? [],
      poleMembers: (poleRes.data ?? []) as PoleMember[],
    },
    revalidate: 3600,
  };
};

const associationSeo: SeoProps = {
  title: "L'association — staff bénévole de l'esport féminin",
  description:
    "D\u00e9couvre l'\u00e9quipe qui organise le tournoi Overwatch f\u00e9minin OW Women's Cup : missions, engagements et p\u00f4les b\u00e9n\u00e9voles.",
};

AssociationPage.seo = associationSeo;

export default AssociationPage;
