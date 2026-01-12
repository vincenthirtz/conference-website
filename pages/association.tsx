import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import Speaker from '@/components/Speaker/speaker';
import { supabaseAdmin } from '@/utils/supabase';

type CastMember = {
  id: string;
  name: string;
  title: string | null;
  image_url: string | null;
  twitch_url: string | null;
  city: string | null;
  is_promo: boolean;
};

type Props = {
  castMembers: CastMember[];
};

const pillars = [
  {
    title: 'Inclusion',
    detail:
      'Accompagnement des joueuses débutantes et confirmées, encadrement staff formé et modération active pour des espaces sûrs.',
  },
  {
    title: 'Visibilité',
    detail:
      'Casts 100% féminins, interviews et contenus pédagogiques pour montrer des rôles modèles et inspirer les futures compétitrices.',
  },
  {
    title: 'Terrain',
    detail:
      'Tournois en ligne, ateliers découverte, mentorat et relais avec les communautés locales pour faire émerger de nouvelles équipes.',
  },
];

const commitments = [
  'Respect des règles officielles Overwatch 2 et du code de conduite Blizzard.',
  'Charte anti-harcèlement et procédure de signalement claire (staff dédié).',
  'Priorité aux opportunités pour les talents féminins : joueuses, casters, admins, graphistes.',
  "Transparence budgétaire : rapports d'impact et allocation des dons par poste.",
];

const teamRoles = [
  {
    title: 'Direction & admin',
    desc: 'Organisation générale, partenariats, suivi des budgets.',
  },
  {
    title: 'Tournoi & arbitrage',
    desc: 'Règles, lobby settings, gestion des matchs et litiges.',
  },
  {
    title: 'Production & cast',
    desc: 'Overlay, graphismes, casters et modération live.',
  },
  {
    title: 'Communauté',
    desc: 'Mentorat, ateliers, communication et support joueuses/équipes.',
  },
];

function AssociationPage({ castMembers }: Props) {
  // Transform cast members to speaker format
  const speakers = castMembers.map((member) => ({
    id: member.id,
    name: member.name,
    title: member.title || '',
    img: member.image_url || '/img/mic.jpg',
    link: member.twitch_url || '/contact',
    city: [member.city || ''],
    pub: member.is_promo,
  }));

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            En savoir plus
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            L&apos;association OW Women&apos;s Cup
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Une équipe bénévole qui porte un tournoi Overwatch féminin, avec une
            mission claire : créer des espaces inclusifs et ambitieux pour les
            talents de la scène.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/don"
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Soutenir l&apos;asso
            </Link>
            <Link
              href="/rules"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Voir le règlement
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-purple-200">
                {pillar.title}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {pillar.title}
              </h2>
              <p className="mt-2 text-sm text-gray-200">{pillar.detail}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                Engagements
              </p>
              <h3 className="text-2xl font-bold">Ce qui nous guide</h3>
            </div>
            <p className="text-sm text-gray-200">
              Un cadre sain pour les joueuses, le staff et la communauté autour
              du tournoi.
            </p>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-100">
            {commitments.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span
                  className="mt-[6px] h-2 w-2 rounded-full bg-emerald-400"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              Qui fait quoi
            </p>
            <h3 className="text-2xl font-bold text-white">
              Les pôles de l&apos;équipe
            </h3>
            <p className="text-sm text-gray-300">
              Chacun peut proposer son aide : administration, arbitrage,
              production, communication.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {teamRoles.map((role) => (
              <div
                key={role.title}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-lg shadow-black/15"
              >
                <p className="text-sm font-semibold text-white">{role.title}</p>
                <p className="mt-2 text-sm text-gray-200">{role.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 shadow-2xl">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              Pôle Production & cast
            </p>
            <h3 className="mt-2 text-2xl font-bold text-white">
              Les casteuses de l&apos;asso
            </h3>
            <p className="mt-3 text-sm text-gray-300">
              Joueuses et streameuses qui prêtent leur voix et leur expertise
              pour faire vivre les matchs en direct.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {speakers.map((speaker) => {
              const location = speaker.city[1]
                ? `${speaker.city[0]} & ${speaker.city[1]}`
                : speaker.city[0];
              return (
                <Speaker
                  key={speaker.id}
                  details={speaker as any}
                  location={location}
                  className="mt-4"
                />
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
            Nous contacter
          </p>
          <h4 className="mt-2 text-2xl font-semibold">
            Envie d&apos;aider ou de collaborer ?
          </h4>
          <p className="mt-3 text-sm text-gray-200">
            Écris-nous pour rejoindre l&apos;asso, proposer un partenariat ou
            poser tes questions.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <a
              href="mailto:owwomenscup@gmail.com?subject=Rejoindre%20l%27association%20OW%20Women%27s%20Cup"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              owwomenscup@gmail.com
            </a>
            <Link
              href="/don"
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Faire un don
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  if (!supabaseAdmin) {
    return {
      props: {
        castMembers: [],
      },
    };
  }

  const { data, error } = await supabaseAdmin
    .from('cast_members')
    .select('id, name, title, image_url, twitch_url, city, is_promo')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[association] Error fetching cast members:', error);
    return {
      props: {
        castMembers: [],
      },
    };
  }

  return {
    props: {
      castMembers: data ?? [],
    },
  };
};

const associationSeo: SeoProps = {
  title: "L'association OW Women's Cup",
  description:
    "Découvre l'équipe qui organise le tournoi Overwatch féminin OW Women's Cup : missions, engagements et pôles bénévoles.",
};

AssociationPage.seo = associationSeo;

export default AssociationPage;
