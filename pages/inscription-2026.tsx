import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { ACTIVE_WOMEN_TOURNAMENT_ID } from '@/utils/activeEdition';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT, format } from '@/lib/i18n/useT';
import { logger } from '../utils/logger';
import nsInscription2026 from '@/lib/i18n/locales/fr/inscription2026';

type InscriptionDict = typeof nsInscription2026.fr;

const DISCORD_INVITE = 'https://discord.gg/gERSsjC3Vd';
const REGISTER_HREF = `/team/create?tournament=${ACTIVE_WOMEN_TOURNAMENT_ID}`;

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

const getPrerequisites = (t: InscriptionDict): Prerequisite[] => [
  { title: t.prereq1Title, desc: t.prereq1Desc },
  { title: t.prereq2Title, desc: t.prereq2Desc },
  { title: t.prereq3Title, desc: t.prereq3Desc },
  { title: t.prereq4Title, desc: t.prereq4Desc },
];

const getSteps = (t: InscriptionDict): Step[] => [
  {
    number: '01',
    title: t.step1Title,
    description: t.step1Desc,
    cta: { label: t.step1Cta, href: '/register' },
  },
  {
    number: '02',
    title: t.step2Title,
    description: t.step2Desc,
  },
  {
    number: '03',
    title: t.step3Title,
    description: t.step3Desc,
  },
  {
    number: '04',
    title: t.step4Title,
    description: t.step4Desc,
    cta: { label: t.step4Cta, href: REGISTER_HREF },
  },
  {
    number: '05',
    title: t.step5Title,
    description: t.step5Desc,
    cta: {
      label: t.step5Cta,
      href: DISCORD_INVITE,
      external: true,
    },
  },
];

const getFaqs = (t: InscriptionDict): Faq[] => [
  { question: t.faq1Q, answer: t.faq1A },
  { question: t.faq2Q, answer: t.faq2A },
  { question: t.faq3Q, answer: t.faq3A },
  { question: t.faq4Q, answer: t.faq4A },
  { question: t.faq5Q, answer: t.faq5A },
  { question: t.faq6Q, answer: t.faq6A },
];

// JSON-LD FAQ pour le SEO : reste en français (langue de référence du site,
// cf. Phase E de la roadmap i18n pour le SEO multilingue).
const faqsForSchema: Faq[] = [
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
      'Oui. Signale-toi sur la page « Rejoindre une équipe » (/rejoindre) : pseudo, postes joués et disponibilités, sans créer de compte. Les capitaines qui recrutent voient ta fiche et te contactent. Le canal dédié sur le Discord reste une seconde porte d’entrée.',
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
  {
    question: 'Je manage une équipe sans y jouer : puis-je inscrire l’équipe ?',
    answer:
      'Oui. Crée ton compte en tant que « manager » — aucun BattleTag n’est demandé — puis, dans le formulaire d’équipe, choisis « je gère l’équipe sans y jouer ». Un même manager peut encadrer plusieurs équipes.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqsForSchema.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

type Inscription2026Props = {
  /** Le tournoi a rempli ses places : on cesse d'inviter a le rejoindre. */
  tournamentFull: boolean;
  /** Nombre de places, pour le dire au lieu de le sous-entendre. */
  maxTeams: number | null;
};

/**
 * Cette page invitait sans condition. Elle pointe vers l'inscription du tournoi
 * actif : quand il est complet, elle envoyait les gens dans un tunnel qui ne
 * pouvait plus aboutir — le serveur refuse deja (`tournament_full`), mais rien
 * ne le disait avant d'y arriver.
 *
 * Comme sur la home, l'etat se DEDUIT des donnees (places vs inscrites) plutot
 * que d'un drapeau a lever : le jour ou une place se libere, la page reinvite
 * d'elle-meme.
 */
export const getStaticProps: GetStaticProps<
  Inscription2026Props
> = async () => {
  let tournamentFull = false;
  let maxTeams: number | null = null;

  if (supabaseAdmin) {
    try {
      const { data: tournament } = await supabaseAdmin
        .from('tournaments')
        .select('max_teams')
        .eq('id', ACTIVE_WOMEN_TOURNAMENT_ID)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .maybeSingle();

      maxTeams = (tournament?.max_teams as number | null) ?? null;

      if (maxTeams) {
        const { count } = await supabaseAdmin
          .from('tournament_teams')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('tournament_id', ACTIVE_WOMEN_TOURNAMENT_ID);
        tournamentFull = (count ?? 0) >= maxTeams;
      }
    } catch (err) {
      // Une lecture ratee ne doit pas casser une page de contenu : on retombe
      // sur « ouvert », l'etat qui a toujours ete celui de cette page, et le
      // serveur refusera de toute facon une inscription de trop.
      logger.error('[inscription-2026] tournament state error', err);
    }
  }

  return { props: { tournamentFull, maxTeams }, revalidate: 300 };
};

function Inscription2026Page({
  tournamentFull,
  maxTeams,
}: Inscription2026Props) {
  const t = useT(nsInscription2026);
  const prerequisites = getPrerequisites(t);
  const steps = getSteps(t);
  // Étape « Inscris ton équipe » : sans place disponible, la marche n'a plus
  // d'objet. On garde le texte (il explique le parcours) mais on retire le
  // bouton, qui mènerait à un refus.
  const visibleSteps = tournamentFull
    ? steps.map((step) =>
        step.cta?.href === REGISTER_HREF ? { ...step, cta: undefined } : step
      )
    : steps;
  const faqs = getFaqs(t);
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
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[var(--color-violet)]/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-[var(--color-green)]/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            <span className="rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-2 py-[2px] text-[10px] font-semibold text-white">
              {t.heroBadgeTournament}
            </span>
            <span>{t.heroBadgeAction}</span>
          </p>
          <h1 className="text-brand-gradient mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
          {tournamentFull && (
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[var(--color-yellow)]/90">
              {format(t.tournamentFullHint, { count: String(maxTeams ?? '') })}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {tournamentFull ? (
              // Un etat, pas une porte : il n'y a plus de place a prendre.
              <span className="rounded-full border border-[var(--color-yellow)]/40 bg-[var(--color-yellow)]/10 px-6 py-3 text-sm font-bold text-[var(--color-yellow)]">
                {t.tournamentFull}
              </span>
            ) : (
              <Link
                href={REGISTER_HREF}
                className="rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-violet)]/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
              >
                {t.ctaRegister} <span aria-hidden="true">↗</span>
              </Link>
            )}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.ctaDiscord} <span aria-hidden="true">↗</span>
            </a>
            <a
              href="#faq"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.ctaFaq}
            </a>
            <a
              href="#etapes"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.ctaSteps}
            </a>
            <Link
              href="/rules"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.ctaRules}
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-20 sm:px-6">
        {/* Prerequisites */}
        <section>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-violet-light)]">
              {t.prereqEyebrow}
            </p>
            <h2 className="text-brand-gradient mt-2 text-3xl font-extrabold tracking-tight">
              {t.prereqTitle}
            </h2>
            <span className="brand-rule mt-3 block" aria-hidden />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {prerequisites.map((item) => (
              <div
                key={item.title}
                className="card-brand rounded-2xl bg-white/[0.05] p-5"
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
        <section id="etapes" className="section-brand-bg">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-green)]">
              {t.stepsEyebrow}
            </p>
            <h2 className="text-brand-gradient mt-2 text-3xl font-extrabold tracking-tight">
              {t.stepsTitle}
            </h2>
            <span className="brand-rule mt-3 block" aria-hidden />
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              {t.stepsIntro}
            </p>
          </div>
          <ol className="space-y-4">
            {visibleSteps.map((step) => (
              <li
                key={step.number}
                className="card-brand flex flex-col gap-4 rounded-2xl bg-white/[0.05] p-5 sm:flex-row sm:items-start"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-violet)] to-[var(--color-green)] font-mono text-lg font-bold text-white ring-1 ring-white/15">
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
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-violet-light)] underline decoration-[var(--color-violet)]/60 underline-offset-4 transition hover:text-white"
                      >
                        {step.cta.label} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <Link
                        href={step.cta.href}
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-violet-light)] underline decoration-[var(--color-violet)]/60 underline-offset-4 transition hover:text-white"
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
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                {t.finalEyebrow}
              </p>
              <h3 className="mt-2 text-2xl font-bold">{t.finalTitle}</h3>
              <p className="mt-2 text-sm text-gray-200">{t.finalBody}</p>
            </div>
            <Link
              href={tournamentFull ? '/team/create' : REGISTER_HREF}
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-violet)]/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
            >
              {tournamentFull ? t.ctaCreateTeam : t.ctaRegister}{' '}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-yellow)]">
              {t.faqEyebrow}
            </p>
            <h2 className="text-brand-gradient mt-2 text-3xl font-extrabold tracking-tight">
              {t.faqTitle}
            </h2>
            <span className="brand-rule mt-3 block" aria-hidden />
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group card-brand rounded-2xl bg-white/[0.05] p-5 open:border-[var(--color-violet)]/60"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white">
                  {faq.question}
                  <span
                    aria-hidden
                    className="text-[var(--color-violet-light)] transition group-open:rotate-45"
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
            {t.helpEyebrow}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-white">{t.helpTitle}</h3>
          <p className="mt-3 text-sm text-gray-200">{t.helpBody}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.ctaDiscord} <span aria-hidden="true">↗</span>
            </a>
            <Link
              href="/contact"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.helpContact}
            </Link>
            <Link
              href="/timeline-2026"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              {t.helpTimeline}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const inscriptionSeo: SeoProps = {
  title: {
    fr: 'Inscription au tournoi 2026',
    en: '2026 tournament registration',
  },
  description: {
    fr: "Guide pas à pas pour inscrire ton équipe au tournoi féminin OW Women's Cup 2026 : prérequis, roster, capitaine, BattleTag et accès au formulaire officiel.",
    en: "Step-by-step guide to register your team for the OW Women's Cup 2026 women's tournament: requirements, roster, captain, BattleTag and access to the official form.",
  },
};

Inscription2026Page.seo = inscriptionSeo;

export default Inscription2026Page;
