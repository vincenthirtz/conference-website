// pages/organisateurs/circuits-feminins.tsx
//
// L'offre partenaire des circuits féminins et mixtes, dans tous les jeux du
// registre — et le formulaire pour y candidater.
//
// POURQUOI. Notre légitimité est l'esport féminin et mixte ; le multi-jeux est
// déjà en place. Ouvrir la plateforme aux circuits féminins d'autres jeux
// étend la niche là où un hub généraliste ne peut pas nous suivre vite.
//
// RIEN N'EST RECOPIÉ. Les termes (plan, durée) viennent de
// `config/circuitPartnerOffer.ts`, ce que le plan ouvre et son prix catalogue
// de `utils/billing/planFeatures.ts`, les jeux de `config/games` — tous lus
// dans `getStaticProps`, hors du bundle. Une ligne d'offre n'apparaît que si
// le plan accordé ouvre réellement la capacité.

import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { listGames } from '@/config/games';
import {
  PLAN_LABELS,
  PLAN_PRICES_EUR,
  getPlanFeatures,
} from '@/utils/billing/planFeatures';
import { CIRCUIT_PARTNER_OFFER } from '@/config/circuitPartnerOffer';
import CircuitApplicationForm from '@/components/organisateurs/CircuitApplicationForm';
import nsCircuitPartnersPage from '@/lib/i18n/locales/fr/circuitPartnersPage';

type Dict = typeof nsCircuitPartnersPage.fr;

/** Lignes d'offre, chacune conditionnée à une capacité réelle du plan. */
type OfferLineKey =
  | 'offerBot'
  | 'offerLeagues'
  | 'offerArbitration'
  | 'offerRatings'
  | 'offerBrand'
  | 'offerApi';

type Props = {
  planLabel: string;
  months: number;
  /** Prix catalogue annuel du plan offert, `null` s'il n'en a pas. */
  listPrice: number | null;
  offerLines: OfferLineKey[];
  games: Array<{ slug: string; label: string }>;
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  const f = getPlanFeatures(CIRCUIT_PARTNER_OFFER.plan);
  const lines: OfferLineKey[] = [];
  if (f.discordBot) lines.push('offerBot');
  if (f.maxLeagues === Infinity) lines.push('offerLeagues');
  if (f.arbitration && f.priorityArbitration) lines.push('offerArbitration');
  if (f.ratings) lines.push('offerRatings');
  if (f.whiteLabel) lines.push('offerBrand');
  if (f.apiRead && f.apiWrite) lines.push('offerApi');
  return {
    props: {
      planLabel: PLAN_LABELS[CIRCUIT_PARTNER_OFFER.plan],
      months: CIRCUIT_PARTNER_OFFER.months,
      listPrice: PLAN_PRICES_EUR[CIRCUIT_PARTNER_OFFER.plan],
      offerLines: lines,
      games: listGames().map((g) => ({ slug: g.slug, label: g.label })),
    },
  };
};

const CARD = 'rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6';

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm text-gray-300">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="text-pink-300">
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CircuitsFemininsPage({
  planLabel,
  months,
  listPrice,
  offerLines,
  games,
}: Props) {
  const t: Dict = useT(nsCircuitPartnersPage);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 pt-32 pb-14 text-center">
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
            <a
              href="#candidater"
              className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              {t.heroCta}
            </a>
            <Link
              href="/organisateurs/tournoi-feminin-ou-mixte"
              className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:border-white/40"
            >
              {t.heroGuide}
            </Link>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-6 py-12" aria-labelledby="offre">
        <div className="rounded-2xl border border-purple-400/40 bg-purple-500/[0.08] p-6 sm:p-8">
          <h2 id="offre" className="text-2xl font-bold sm:text-3xl">
            {t.offerTitle}
          </h2>
          <p className="mt-3 text-xl font-semibold text-white">
            {format(t.offerPlan, { plan: planLabel, months })}
          </p>
          {listPrice ? (
            <p className="mt-1 text-sm text-gray-300">
              {format(t.offerPlanFootnote, { price: listPrice })}
            </p>
          ) : null}
          <Bullets
            items={[...offerLines.map((key) => t[key]), t.offerSupport]}
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 py-6 md:grid-cols-2">
        <div className={CARD}>
          <h2 className="text-lg font-semibold">{t.eligibleTitle}</h2>
          <Bullets items={[t.eligibleFormat, t.eligibleSeason]} />
          <p className="mt-3 text-sm text-gray-300">{t.eligibleGame}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {games.map((game) => (
              <li
                key={game.slug}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-gray-200"
              >
                {game.label}
              </li>
            ))}
          </ul>
        </div>
        <div className={CARD}>
          <h2 className="text-lg font-semibold">{t.commitmentsTitle}</h2>
          <Bullets
            items={[
              t.commitmentCharter,
              t.commitmentLead,
              t.commitmentDeclarative,
            ]}
          />
        </div>
      </section>

      <section
        className="mx-auto max-w-5xl px-6 py-12"
        aria-labelledby="etapes"
      >
        <h2 id="etapes" className="text-2xl font-bold">
          {t.stepsTitle}
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[t.step1, t.step2, format(t.step3, { months })].map((step, i) => (
            <li key={step} className={`${CARD} flex gap-3`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-200">
                {i + 1}
              </span>
              <p className="text-sm text-gray-200">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Link
            href="/onboard/request"
            className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:border-white/40"
          >
            {t.createSpace}
          </Link>
        </div>
      </section>

      <section
        id="candidater"
        className="mx-auto max-w-3xl scroll-mt-24 px-6 pt-6 pb-24"
        aria-labelledby="candidater-titre"
      >
        <h2 id="candidater-titre" className="text-2xl font-bold">
          {t.formTitle}
        </h2>
        <p className="mt-2 text-sm text-gray-300">{t.formIntro}</p>
        <CircuitApplicationForm games={games} className="mt-6" />
      </section>
    </div>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Offre partenaire des circuits féminins et mixtes',
    en: 'Partner offer for women’s and mixed circuits',
  },
  description: {
    fr: 'Circuits esport féminins et mixtes sur Valorant, League of Legends et d’autres jeux : la plateforme de la OW Women’s Cup offerte pour une saison, sur candidature.',
    en: 'Women’s and mixed esports circuits on Valorant, League of Legends and more: the OW Women’s Cup platform free for a season, on application.',
  },
};

CircuitsFemininsPage.seo = seo;

export default CircuitsFemininsPage;
