// pages/organisateurs/tournoi-feminin-ou-mixte.tsx
//
// « Organiser un tournoi féminin ou mixte » — le guide qui assume notre niche.
//
// POURQUOI CETTE PAGE. Les hubs généralistes savent faire un bracket ; ce
// qu'aucun ne peut rattraper vite, c'est l'expérience d'un tournoi féminin :
// qui peut jouer, comment on écrit le règlement, comment on protège les
// joueuses, comment on finance un cash-prize sans sponsor. La page le donne
// librement — reprenable sur la plateforme ou ailleurs — et mène à l'offre
// partenaire des circuits.
//
// ON NE PROMET QUE CE QUE LE CODE FAIT. Les jeux viennent du registre
// (`config/games`), le palier qui ouvre l'arbitrage vient de
// `utils/billing/planFeatures.ts`, lus dans `getStaticProps` pour que le
// registre et le barème n'entrent pas dans le bundle. La cagnotte est décrite
// telle qu'elle est : encaissée par l'association sur son compte HelloAsso, et
// ouverte sur convention pour un tournoi hors de la Coupe.

import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { listGames } from '@/config/games';
import {
  PLAN_LABELS,
  getPlanFeatures,
  type TenantPlan,
} from '@/utils/billing/planFeatures';
import RulebookTemplate from '@/components/organisateurs/RulebookTemplate';
import nsOrganiserFemininPage from '@/lib/i18n/locales/fr/organiserFemininPage';

type GameSummary = {
  slug: string;
  label: string;
  hasMapVeto: boolean;
  hasDraft: boolean;
};

type Props = {
  games: GameSummary[];
  /** Nom du premier palier vendu qui ouvre l'arbitrage des litiges. */
  arbitrationPlan: string;
};

/** Les offres vendues, du moins cher au plus cher (cf. `pages/organisateurs.tsx`). */
const SOLD_PLANS: TenantPlan[] = ['discovery', 'regie', 'circuit', 'editor'];

export const getStaticProps: GetStaticProps<Props> = async () => {
  const firstWithArbitration =
    SOLD_PLANS.find((plan) => getPlanFeatures(plan).arbitration) ?? 'regie';
  return {
    props: {
      games: listGames().map((game) => ({
        slug: game.slug,
        label: game.label,
        hasMapVeto: game.hasMapVeto,
        hasDraft: Boolean(game.hasDraft),
      })),
      arbitrationPlan: PLAN_LABELS[firstWithArbitration],
    },
  };
};

const CARD = 'rounded-2xl border border-white/10 bg-white/[0.03] p-5';

function TournoiFemininOuMixtePage({ games, arbitrationPlan }: Props) {
  const t = useT(nsOrganiserFemininPage);

  const platformItems = [
    t.platformReport,
    t.platformBlacklist,
    format(t.platformArbitration, { plan: arbitrationPlan }),
    t.platformBattlenet,
    t.platformDiscovery,
    t.platformGdpr,
  ];
  const yoursItems = [
    t.yoursReferent,
    t.yoursPublish,
    t.yoursChat,
    t.yoursBriefing,
    t.yoursRaid,
    t.yoursDebrief,
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* En-tête */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-pink-500/25 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-purple-600/25 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 pt-header-xl pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-4 text-balance text-4xl font-bold leading-tight sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/onboard/request"
              className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              {t.heroCtaCreate}
            </Link>
            <Link
              href="/organisateurs/circuits-feminins"
              className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              {t.heroCtaCircuits}
            </Link>
          </div>
        </div>
      </div>

      {/* Qui peut jouer */}
      <section
        className="mx-auto max-w-5xl px-6 py-14"
        aria-labelledby="eligibilite"
      >
        <h2 id="eligibilite" className="text-2xl font-bold sm:text-3xl">
          {t.eligibilityTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-gray-300">{t.eligibilityIntro}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className={CARD}>
            <h3 className="font-semibold text-white">{t.formatFemTitle}</h3>
            <p className="mt-2 text-sm text-gray-300">{t.formatFemBody}</p>
          </div>
          <div className={CARD}>
            <h3 className="font-semibold text-white">{t.formatMixTitle}</h3>
            <p className="mt-2 text-sm text-gray-300">{t.formatMixBody}</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-pink-400/40 bg-pink-500/[0.07] p-5">
          <h3 className="font-semibold text-pink-100">
            {t.eligibilityRuleTitle}
          </h3>
          <p className="mt-2 text-sm text-pink-50/90">
            {t.eligibilityRuleBody}
          </p>
        </div>
      </section>

      {/* Règlement type */}
      <section
        className="mx-auto max-w-5xl px-6 py-14"
        aria-labelledby="reglement-type"
      >
        <h2 id="reglement-type" className="text-2xl font-bold sm:text-3xl">
          {t.templateTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-gray-300">{t.templateIntro}</p>
        <RulebookTemplate className="mt-8" />
      </section>

      {/* Modération et sécurité */}
      <section
        className="mx-auto max-w-5xl px-6 py-14"
        aria-labelledby="securite"
      >
        <h2 id="securite" className="text-2xl font-bold sm:text-3xl">
          {t.safetyTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-gray-300">{t.safetyIntro}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[
            { title: t.platformTitle, items: platformItems },
            { title: t.yoursTitle, items: yoursItems },
          ].map((column) => (
            <div key={column.title} className={CARD}>
              <h3 className="font-semibold text-white">{column.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {column.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="text-pink-300">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Cagnotte solidaire */}
      <section
        className="mx-auto max-w-5xl px-6 py-14"
        aria-labelledby="cagnotte"
      >
        <h2 id="cagnotte" className="text-2xl font-bold sm:text-3xl">
          {t.prizeTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-gray-300">{t.prizeIntro}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            [t.prizeGaugeTitle, t.prizeGaugeBody],
            [t.prizeHelloassoTitle, t.prizeHelloassoBody],
            [t.prizeAgreementTitle, t.prizeAgreementBody],
          ].map(([title, body]) => (
            <div key={title} className={CARD}>
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-gray-300">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-xs text-gray-400">{t.prizeLegal}</p>
          <Link
            href="/contact"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:border-white/40"
          >
            {t.prizeContact}
          </Link>
        </div>
      </section>

      {/* Jeux */}
      <section className="mx-auto max-w-5xl px-6 py-14" aria-labelledby="jeux">
        <h2 id="jeux" className="text-2xl font-bold sm:text-3xl">
          {t.gamesTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-gray-300">{t.gamesIntro}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => (
            <li key={game.slug} className={CARD}>
              <p className="font-semibold text-white">{game.label}</p>
              <p className="mt-1 text-xs text-gray-400">
                {[
                  game.hasMapVeto ? t.gameMapVeto : null,
                  game.hasDraft ? t.gameDraft : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Suite */}
      <section className="mx-auto max-w-4xl px-6 pt-6 pb-24">
        <div className="rounded-2xl border border-purple-400/40 bg-purple-500/[0.08] p-6 text-center sm:p-8">
          <h2 className="text-balance text-2xl font-bold text-white">
            {t.ctaTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-200">
            {t.ctaBody}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/organisateurs/circuits-feminins"
              className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400"
            >
              {t.ctaCircuits}
            </Link>
            <Link
              href="/onboard/request"
              className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:border-white/40"
            >
              {t.ctaCreate}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Organiser un tournoi féminin ou mixte',
    en: 'Running a women’s or mixed tournament',
  },
  description: {
    fr: 'Règlement type, modération, sécurité des joueuses et cagnotte solidaire : le guide de la OW Women’s Cup pour organiser un tournoi esport féminin ou mixte.',
    en: 'Template rulebook, moderation, player safety and a community prize pool: the OW Women’s Cup guide to running a women’s or mixed esports tournament.',
  },
};

TournoiFemininOuMixtePage.seo = seo;

export default TournoiFemininOuMixtePage;
