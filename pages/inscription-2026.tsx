import Head from 'next/head';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

const WOMEN_TOURNAMENT_ID_2026 = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
const DISCORD_INVITE = 'https://discord.gg/gERSsjC3Vd';
const REGISTER_HREF = `/team/create?tournament=${WOMEN_TOURNAMENT_ID_2026}`;

type Prerequisite = {
  title: string;
  desc: string;
};

type Step = {
  number: string;
  title: string;
  description: string;
  cta?: { label: string; href: string; external?: boolean };
};

type Faq = {
  question: string;
  answer: string;
};

const prerequisites: Prerequisite[] = [
  {
    title: 'Un compte sur le site',
    desc: 'Inscris-toi avec ton email ou via Discord. Tu utiliseras ce compte pour gérer ton équipe et tes matchs.',
  },
  {
    title: 'Un BattleTag valide',
    desc: 'Format Pseudo#0000. Indispensable pour chaque joueuse du roster — il sert aux invitations en partie personnalisée.',
  },
  {
    title: '5 joueuses minimum',
    desc: 'Composition 5v5 en Role Queue : 1 Tank, 2 DPS, 2 Support. Tu peux ajouter jusqu’à 2 remplaçantes.',
  },
  {
    title: 'Une capitaine',
    desc: 'Une joueuse référente qui valide les feuilles de match, gère le check-in et reçoit les communications du staff.',
  },
];

const steps: Step[] = [
  {
    number: '01',
    title: 'Crée ton compte joueuse',
    description:
      'Inscris-toi gratuitement avec ton email ou ton compte Discord. Pense à renseigner ton BattleTag dès la création.',
    cta: { label: 'Créer mon compte', href: '/register' },
  },
  {
    number: '02',
    title: 'Constitue ton roster',
    description:
      'Réunis 5 joueuses titulaires (1 Tank, 2 DPS, 2 Support). Tu peux préparer leurs emails et BattleTags à l’avance pour aller plus vite au moment de l’inscription.',
  },
  {
    number: '03',
    title: 'Désigne une capitaine',
    description:
      'La capitaine est le point de contact officiel entre l’équipe et le staff. Elle reçoit les notifications de matchs et déclare les résultats.',
  },
  {
    number: '04',
    title: 'Remplis le formulaire d’équipe',
    description:
      'Renseigne le nom, le tag, le pays et le logo de ton équipe, puis ajoute toutes les joueuses en une seule fois. Ton équipe est inscrite automatiquement au tournoi féminin 2026.',
    cta: { label: 'Inscrire mon équipe', href: REGISTER_HREF },
  },
  {
    number: '05',
    title: 'Rejoins le Discord',
    description:
      'Toutes les annonces, plannings et confirmations passent par le Discord officiel. La présence de la capitaine y est obligatoire.',
    cta: {
      label: 'Rejoindre le Discord',
      href: DISCORD_INVITE,
      external: true,
    },
  },
];

const faqs: Faq[] = [
  {
    question: 'Le tournoi est-il réservé aux joueuses ?',
    answer:
      'Oui, l’édition 2026 est 100 % féminine. Toutes les participantes doivent s’identifier comme femmes (cis ou trans) et non-binaires bienvenues, conformément à la charte de l’association.',
  },
  {
    question: 'Quel est le niveau requis ?',
    answer:
      'Aucun rang minimum : le tournoi accueille tous les niveaux. Le format Swiss permet d’affronter des équipes de niveau équivalent au fil des rondes.',
  },
  {
    question: 'Peut-on s’inscrire seule, sans équipe ?',
    answer:
      'L’inscription se fait par équipe. Si tu cherches un roster, passe sur le Discord : un canal dédié au recrutement permet de trouver des coéquipières.',
  },
  {
    question: 'Puis-je modifier mon roster après l’inscription ?',
    answer:
      'Oui, tant que les check-ins ne sont pas verrouillés. Les changements se font depuis la page de ton équipe. Au-delà de la date limite, contacte le staff sur Discord.',
  },
  {
    question: 'L’inscription est-elle payante ?',
    answer:
      'Non, l’inscription au tournoi féminin 2026 est gratuite. L’association vit grâce aux dons et aux partenariats.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

function Inscription2026Page() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </Head>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            <span className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-2 py-[2px] text-[10px] font-semibold text-black">
              Tournoi féminin 2026
            </span>
            <span>Inscriptions</span>
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Comment inscrire ton équipe au tournoi féminin 2026
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Suis ces étapes pour rejoindre l&apos;édition 2026 de la OW
            Women&apos;s Cup. Roster, capitaine, BattleTag : on récapitule tout
            ce qu&apos;il te faut.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={REGISTER_HREF}
              className="rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-pink-500/20 transition hover:brightness-110"
            >
              Inscrire mon équipe <span aria-hidden="true">↗</span>
            </Link>
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Discord <span aria-hidden="true">↗</span>
            </a>
            <a
              href="#faq"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              FAQ
            </a>
            <a
              href="#etapes"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Voir les étapes
            </a>
            <Link
              href="/rules"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Règlement
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-20 sm:px-6">
        {/* Prerequisites */}
        <section>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              Avant de commencer
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              Ce qu&apos;il te faut
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {prerequisites.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20"
              >
                <h3 className="text-lg font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-gray-200">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section id="etapes">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
              Procédure
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
              5 étapes pour t&apos;inscrire
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Compte une dizaine de minutes si toutes les joueuses sont prêtes.
              Tu peux interrompre et reprendre à tout moment depuis ton compte.
            </p>
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
                  {step.cta &&
                    (step.cta.external ? (
                      <a
                        href={step.cta.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline decoration-purple-400/60 underline-offset-4 transition hover:text-white"
                      >
                        {step.cta.label} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <Link
                        href={step.cta.href}
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline decoration-purple-400/60 underline-offset-4 transition hover:text-white"
                      >
                        {step.cta.label} <span aria-hidden="true">↗</span>
                      </Link>
                    ))}
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
                Prête à t&apos;inscrire ?
              </p>
              <h3 className="mt-2 text-2xl font-bold">
                Lance la création de ton équipe
              </h3>
              <p className="mt-2 text-sm text-gray-200">
                Le formulaire prend tout en charge : compte, roster et
                inscription au tournoi féminin 2026.
              </p>
            </div>
            <Link
              href={REGISTER_HREF}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-pink-500/20 transition hover:brightness-110"
            >
              Inscrire mon équipe <span aria-hidden="true">↗</span>
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
              FAQ inscription
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
            On est là pour t&apos;accompagner
          </h3>
          <p className="mt-3 text-sm text-gray-200">
            Une question sur ton roster, un BattleTag qui pose problème, ou
            besoin d&apos;une dérogation ? Le staff répond sur Discord et par
            email.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Discord <span aria-hidden="true">↗</span>
            </a>
            <Link
              href="/contact"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Formulaire de contact
            </Link>
            <Link
              href="/timeline-2026"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Timeline 2026
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const inscriptionSeo: SeoProps = {
  title: 'Inscription au tournoi 2026',
  description:
    "Guide pas à pas pour inscrire ton équipe au tournoi féminin OW Women's Cup 2026 : prérequis, roster, capitaine, BattleTag et accès au formulaire officiel.",
};

Inscription2026Page.seo = inscriptionSeo;

export default Inscription2026Page;
