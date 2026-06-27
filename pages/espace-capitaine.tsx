import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { ACTIVE_WOMEN_TOURNAMENT_ID } from '@/utils/activeEdition';

const DISCORD_INVITE = 'https://discord.gg/gERSsjC3Vd';
const REGISTER_TEAM_HREF = `/team/create?tournament=${ACTIVE_WOMEN_TOURNAMENT_ID}`;

type Feature = {
  title: string;
  description: string;
  icon: 'roster' | 'door' | 'inbox' | 'swords' | 'chat' | 'transfer' | 'eye';
};

type Step = {
  number: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
};

type Faq = {
  question: string;
  answer: string;
};

const features: Feature[] = [
  {
    icon: 'roster',
    title: 'Gérer le roster',
    description:
      'Ajoute ou retire des joueuses, change leur rôle (Tank, DPS, Support, remplaçante, coach) et passe le brassard de capitaine en un clic.',
  },
  {
    icon: 'door',
    title: 'Ouvrir ou fermer le recrutement',
    description:
      'Active le mode "ouvert" pour recevoir des candidatures, ou ferme l’équipe le temps des matchs pour stabiliser le roster.',
  },
  {
    icon: 'inbox',
    title: 'Valider les demandes',
    description:
      'Reçois les demandes de joueuses qui veulent rejoindre, lis leur message, accepte ou refuse — tout depuis le même écran.',
  },
  {
    icon: 'swords',
    title: 'Proposer des scrims',
    description:
      'Lance ou accepte des matchs amicaux entre équipes pour t’entraîner avant les rencontres officielles.',
  },
  {
    icon: 'chat',
    title: 'Messagerie capitaines',
    description:
      'Discute en direct avec les autres capitaines pour caler horaires, lobbies ou règles maison sans quitter le site.',
  },
  {
    icon: 'transfer',
    title: 'Gérer les transferts',
    description:
      'Propose un transfert vers une autre équipe ou réceptionne ceux qui te sont adressés, avec validation côté staff.',
  },
  {
    icon: 'eye',
    title: 'Page publique de l’équipe',
    description:
      'Profite d’une page vitrine pour ton équipe (logo, roster, palmarès) à partager sur les réseaux et avec les sponsors.',
  },
];

const steps: Step[] = [
  {
    number: '01',
    title: 'Crée ton compte',
    description:
      'Inscris-toi avec ton email ou via Discord. Renseigne ton BattleTag pour gagner du temps lors de la création d’équipe.',
    cta: { label: 'Créer mon compte', href: '/register' },
  },
  {
    number: '02',
    title: 'Crée ton équipe (ou rejoins-en une)',
    description:
      'Si tu crées l’équipe, tu en deviens automatiquement la capitaine. Si tu rejoins une équipe existante, tu pourras demander le rôle de capitaine ensuite.',
    cta: { label: 'Inscrire mon équipe', href: REGISTER_TEAM_HREF },
  },
  {
    number: '03',
    title: 'Pilote depuis ton espace',
    description:
      'Une fois capitaine, ouvre /player pour accéder au dashboard, à la gestion du roster, à la messagerie et aux scrims.',
    cta: { label: 'Aller à mon espace', href: '/player' },
  },
];

const faqs: Faq[] = [
  {
    question: 'Qui peut devenir capitaine ?',
    answer:
      'Toute joueuse qui crée une équipe via le formulaire d’inscription en devient capitaine. Si tu as rejoint une équipe sans en être la capitaine, tu peux ensuite faire une demande depuis ton espace joueur — la capitaine actuelle ou le staff valide le passage de relais.',
  },
  {
    question: 'Combien de capitaines par équipe ?',
    answer:
      'Une seule capitaine officielle à la fois. C’est elle qui reçoit les check-ins de match, les notifications staff et les messages des autres équipes. La passation se fait à n’importe quel moment via le dashboard.',
  },
  {
    question:
      'Que se passe-t-il si je ne réponds pas à temps à un scrim ou à un check-in ?',
    answer:
      'Les check-ins de match ont une fenêtre stricte (~1h avant le coup d’envoi) — sans validation, l’équipe est déclarée forfait. Les scrims n’ont pas de pénalité, mais un refus rapide aide la communauté à s’organiser.',
  },
  {
    question: 'Puis-je gérer plusieurs équipes ?',
    answer:
      'Non, une joueuse ne peut être capitaine que d’une seule équipe à la fois. C’est un garde-fou pour éviter les conflits d’horaires et garantir la disponibilité de la capitaine pendant les phases de tournoi.',
  },
  {
    question: 'Si je quitte mon équipe, qu’est-ce qui se passe ?',
    answer:
      'Si tu n’es pas capitaine, tu peux partir librement (la capitaine et le staff sont notifiés). Si tu es capitaine, transfère d’abord le brassard à une autre membre, sinon le staff te demandera de le faire avant de valider ta sortie.',
  },
];

function FeatureIcon({ name }: { name: Feature['icon'] }) {
  const common = {
    className: 'w-6 h-6 text-pink-300',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'roster':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'door':
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" />
          <circle cx="13" cy="13" r="0.8" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        </svg>
      );
    case 'swords':
      return (
        <svg {...common}>
          <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
          <path d="m13 19 6-6" />
          <path d="m16 16 4 4" />
          <path d="m19 21 2-2" />
          <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" />
          <path d="m11 5-6 6" />
          <path d="m8 8-4-4" />
          <path d="M5 3 3 5" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'transfer':
      return (
        <svg {...common}>
          <path d="M16 3h5v5" />
          <path d="M21 3 14 10" />
          <path d="M8 21H3v-5" />
          <path d="m3 21 7-7" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

function EspaceCapitainePage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            <span className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-2 py-[2px] text-[10px] font-semibold text-black">
              Espace capitaine
            </span>
            <span>Gestion d&apos;équipe</span>
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Pilote ton équipe depuis un seul tableau de bord
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Roster, recrutement, scrims, messagerie, transferts : tout ce
            qu&apos;il te faut pour mener ton équipe sans courir entre Discord,
            Excel et les DM.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/player"
              className="rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-pink-500/20 transition hover:brightness-110"
            >
              Accéder à mon espace ↗
            </Link>
            <Link
              href={REGISTER_TEAM_HREF}
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Inscrire mon équipe
            </Link>
            <a
              href="#fonctionnalites"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Voir les fonctionnalités
            </a>
            <a
              href="#faq"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              FAQ
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-20 sm:px-6">
        {/* Pour qui */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
            Pour qui ?
          </p>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
            Pensé pour les capitaines d&apos;équipe
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-gray-200 sm:text-base">
            L&apos;espace capitaine est ouvert dès que tu deviens capitaine
            d&apos;une équipe inscrite à un tournoi. Si tu n&apos;as pas encore
            d&apos;équipe, commence par en créer une — la capitaine, c&apos;est
            celle qui inscrit le roster.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              'Tu as créé ton compte sur le site (email ou Discord).',
              'Tu as inscrit une équipe au tournoi en cours.',
              'Tu es désignée capitaine du roster (par défaut, la créatrice).',
              'Tu es présente sur le Discord officiel pour recevoir les pings.',
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-gray-100"
              >
                <span
                  className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                  aria-hidden
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Features */}
        <section id="fonctionnalites" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              Fonctionnalités
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              Tout ce que tu peux faire
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Chaque outil est accessible en un clic depuis le dashboard
              capitaine, sans quitter la plateforme.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 ring-1 ring-white/10">
                    <FeatureIcon name={feature.icon} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-200">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section id="etapes" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              Démarrer
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              3 étapes pour devenir capitaine
            </h2>
          </div>
          <ol className="space-y-4">
            {steps.map((step) => (
              <li
                key={step.number}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20 sm:flex-row sm:items-start"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/40 to-pink-500/40 font-mono text-lg font-bold text-white ring-1 ring-white/15">
                  {step.number}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-200">
                    {step.description}
                  </p>
                  {step.cta && (
                    <Link
                      href={step.cta.href}
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline decoration-purple-400/60 underline-offset-4 transition hover:text-white"
                    >
                      {step.cta.label} ↗
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                Prête à prendre les commandes ?
              </p>
              <h3 className="mt-2 text-2xl font-bold">
                Ouvre ton dashboard capitaine
              </h3>
              <p className="mt-2 text-sm text-gray-200">
                Si tu as déjà une équipe, l&apos;espace est accessible
                immédiatement après connexion.
              </p>
            </div>
            <Link
              href="/player"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-pink-500/20 transition hover:brightness-110"
            >
              Accéder à mon espace ↗
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              Questions fréquentes
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              FAQ capitaine
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20 open:border-purple-400/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white">
                  {faq.question}
                  <span
                    aria-hidden
                    className="text-purple-200 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-gray-200">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Help */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
            Besoin d&apos;aide ?
          </p>
          <h3 className="mt-2 text-2xl font-bold text-white">
            Le staff répond sur Discord
          </h3>
          <p className="mt-3 text-sm text-gray-200">
            Question sur la passation de capitanat, BattleTag à corriger,
            transfert bloqué ? Le staff t&apos;accompagne sur Discord et par
            email.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Discord ↗
            </a>
            <Link
              href="/contact"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Formulaire de contact
            </Link>
            <Link
              href="/inscription-2026"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Guide d&apos;inscription
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const espaceCapitaineSeo: SeoProps = {
  title: 'Espace capitaine — gérer ton équipe',
  description:
    "Présentation de l'espace capitaine OW Women's Cup : roster, recrutement, scrims, messagerie et transferts pour gérer ton équipe en tournoi.",
};

EspaceCapitainePage.seo = espaceCapitaineSeo;

export default EspaceCapitainePage;
