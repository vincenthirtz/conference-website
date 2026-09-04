// pages/organisateurs.tsx
//
// « Organisez vos tournois » — la page qui présente la plateforme aux
// ORGANISATEURS, et par où l'on souscrit.
//
// Elle remplace `/developpeurs`, qui parlait d'API à des gens venus organiser
// une compétition : une documentation d'endpoints en page d'accueil, alors que
// la référence complète existe déjà, générée depuis la spec
// (`/developpeurs/reference`). Le public visé n'était pas celui qui arrive.
//
// UN PRINCIPE TIENT TOUTE LA PAGE : la grille tarifaire est CONSTRUITE depuis
// `utils/billing/planFeatures.ts` — le même fichier que le code applique
// vraiment (limites de ligues, bot Discord, quotas d'API, domaine propre).
// Une grille recopiée à la main aurait menti au premier changement de barème,
// et c'est exactement le genre de mensonge qu'on ne découvre qu'en clientèle.
//
// Les développeurs ne sont pas perdus en route : une section leur est
// réservée, avec la référence et l'inscription aux clés d'API.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import {
  PLAN_LABELS,
  PLAN_PRICES_EUR,
  getPlanFeatures,
  planPrice,
  YEARLY_MONTHS_BILLED,
  type PlanTerm,
  type TenantPlan,
} from '@/utils/billing/planFeatures';
import nsOrganisateursPage from '@/lib/i18n/locales/fr/organisateursPage';

type Dict = typeof nsOrganisateursPage.fr;

/**
 * Les offres présentées, dans l'ordre où on les lit. `foundation` n'y est pas :
 * c'est le plan de la Coupe féminine elle-même, offert par mission — l'afficher
 * comme une offre laisserait croire qu'il se vend.
 */
const OFFERS: TenantPlan[] = ['discovery', 'regie', 'circuit', 'editor'];

/** Le palier mis en avant : celui qui répond au besoin le plus courant. */
const HIGHLIGHTED: TenantPlan = 'regie';

/**
 * Ce qu'une offre ouvre, lu depuis les capacités réelles du plan.
 *
 * Chaque ligne est une PHRASE, pas un nom de champ : « 1 ligue » se comprend,
 * `maxLeagues: 1` non. Mais la valeur, elle, vient du code.
 */
function offerLines(plan: TenantPlan, t: Dict): string[] {
  const f = getPlanFeatures(plan);
  const lines: string[] = [];

  lines.push(f.discordBot ? t.featBotYes : t.featBotNo);

  if (f.maxLeagues === Infinity) lines.push(t.featLeaguesUnlimited);
  else if (f.maxLeagues > 0)
    lines.push(format(t.featLeaguesCount, { n: f.maxLeagues }));
  else lines.push(t.featLeaguesNone);

  lines.push(f.broadcastStudio ? t.featObsYes : t.featObsNo);
  lines.push(f.arbitration ? t.featArbitrationYes : t.featArbitrationNo);
  lines.push(f.ratings ? t.featRatingsYes : t.featRatingsNo);
  lines.push(f.whiteLabel ? t.featBrandYes : t.featBrandNo);

  if (f.apiWrite) lines.push(t.featApiWrite);
  else if (f.apiRead) lines.push(t.featApiRead);
  else lines.push(t.featApiNo);

  return lines;
}

function priceLabel(plan: TenantPlan, term: PlanTerm, t: Dict): string {
  const price = planPrice(plan, term);
  // `null` = pas de barème catalogue. Aucune offre présentée n'est dans ce cas
  // depuis le retrait du palier sur-devis ; on garde la branche parce que le
  // type l'autorise, et qu'un prix manquant ne doit jamais s'afficher « 0 € ».
  // `null` = pas de tarif catalogue (Éditeur, sur devis). À distinguer de 0,
  // qui voudrait dire gratuit — afficher « 0 € » pour un devis serait un
  // mensonge par arrondi.
  if (price === null) return t.priceOnRequest;
  if (price === 0) return t.priceFree;
  return term === 'month'
    ? format(t.pricePerMonth, { amount: String(price) })
    : format(t.pricePerYear, { amount: String(price) });
}

function OrganisateursPage() {
  const t = useT(nsOrganisateursPage);
  const router = useRouter();

  // Le formulaire de souscription. Il ne poste PAS lui-même : il emmène sur
  // `/onboard/request` avec ce qui est déjà saisi.
  //
  // Pourquoi ne pas soumettre ici : la création d'espace exige un compte
  // Discord lié et un captcha, tous deux déjà en place là-bas. Dupliquer ce
  // parcours, c'était entretenir deux chemins vers la même table — et laisser
  // l'un des deux prendre du retard sur l'autre. On demande donc ce qu'on peut
  // demander sans compte, et on passe le relais.
  const [orgName, setOrgName] = useState('');
  const [plan, setPlan] = useState<TenantPlan>('regie');

  // Mensuel par défaut : c'est le montant qu'on peut décider seul, sans passer
  // par une délibération de bureau. L'annuel se choisit ensuite, pour ce qu'il
  // fait gagner.
  const [term, setTerm] = useState<PlanTerm>('month');

  const startSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ plan, term });
    if (orgName.trim()) params.set('name', orgName.trim());
    void router.push(`/onboard/request?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/onboard/request"
              className="rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              data-test="organisateurs-primary-cta"
            >
              {t.heroCta}
            </Link>
            <a
              href="#offres"
              className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:border-white/40"
            >
              {t.heroSecondaryCta}
            </a>
          </div>
          <p className="mt-3 text-xs text-gray-400">{t.heroFinePrint}</p>
        </div>
      </div>

      {/* Ce que la plateforme fait */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          {t.whatTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-300">
          {t.whatIntro}
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [t.what1Title, t.what1Body],
            [t.what2Title, t.what2Body],
            [t.what3Title, t.what3Body],
            [t.what4Title, t.what4Body],
            [t.what5Title, t.what5Body],
            [t.what6Title, t.what6Body],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-gray-300">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Offres */}
      <section id="offres" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          {t.offersTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-300">
          {t.offersIntro}
        </p>

        <div className="mt-6 flex justify-center">
          <div
            className="inline-flex rounded-xl border border-white/15 bg-white/5 p-1"
            role="group"
            aria-label={t.termSwitchLabel}
          >
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTerm(value)}
                aria-pressed={term === value}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  term === value
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
                data-test={`term-${value}`}
              >
                {value === 'month' ? t.termMonthly : t.termYearly}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          {format(t.termYearlySaving, {
            months: String(12 - YEARLY_MONTHS_BILLED),
          })}
        </p>

        {/* Trois colonnes qui se lisent EN LIGNES.
            Chaque carte était une pile indépendante : le badge « le plus
            courant » décalait la colonne du milieu d'une hauteur de pastille,
            un texte d'accroche plus long décalait tout ce qui le suivait, et une
            prestation qui passait sur deux lignes désalignait les cinq
            suivantes. On comparait donc des offres dont les prix et les lignes
            ne se faisaient pas face.
            `subgrid` fait porter les rangées par la grille du dessus : badge,
            titre, accroche, prix, équivalent annuel, les six prestations une à
            une, puis le bouton. Chaque rangée prend la hauteur de la plus haute
            des trois, et les trois cartes s'y accrochent.
            Repli : un navigateur sans `subgrid` ignore la déclaration et
            retrouve la pile en `flex` — décalée, mais lisible. */}
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-y-0 lg:grid-rows-[repeat(13,auto)]">
          {OFFERS.map((plan) => {
            const highlighted = plan === HIGHLIGHTED;
            return (
              <div
                key={plan}
                className={`flex flex-col rounded-2xl border p-6 lg:grid lg:row-span-13 lg:grid-rows-subgrid ${
                  highlighted
                    ? 'border-purple-400/50 bg-purple-500/[0.08]'
                    : 'border-white/10 bg-white/[0.03]'
                }`}
                data-test={`offer-${plan}`}
              >
                {/* Le badge occupe sa rangée dans les trois cartes : réservé et
                    invisible ailleurs, plutôt qu'absent. Sinon la colonne mise
                    en avant démarre une pastille plus bas que ses voisines. */}
                <span
                  aria-hidden={!highlighted}
                  className={`mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                    highlighted
                      ? 'bg-purple-500/20 text-purple-200'
                      : 'invisible'
                  }`}
                >
                  {t.offerHighlighted}
                </span>
                <h3 className="text-xl font-bold text-white">
                  {PLAN_LABELS[plan]}
                </h3>
                <p className="mt-1 text-sm text-gray-300">
                  {plan === 'discovery'
                    ? t.offerDiscoveryPitch
                    : plan === 'regie'
                      ? t.offerRegiePitch
                      : plan === 'circuit'
                        ? t.offerCircuitPitch
                        : t.offerEditorPitch}
                </p>
                <p className="mt-4 text-2xl font-bold text-white">
                  {priceLabel(plan, term, t)}
                </p>
                {/* Sous un prix mensuel, la ligne annonçait « soit 290 € à
                    l'année » : c'est le prix du TERME ANNUEL, pas ce que coûte
                    douze mois payés au mois (29 × 12 = 348 €). Elle disait donc
                    que les deux périodicités coûtent pareil — le contraire de
                    la phrase « deux mois offerts » affichée juste au-dessus. */}
                {/* La rangée existe dans les QUATRE cartes dès qu'on est au
                    mois, même vide : Éditeur est sur devis et n'a rien à y
                    mettre, mais l'omettre décalerait toutes ses prestations
                    d'une rangée par rapport aux trois autres — la sous-grille
                    range les enfants dans l'ordre, pas par intention. */}
                {term === 'month' ? (
                  <p className="mt-1 text-xs text-gray-400">
                    {PLAN_PRICES_EUR[plan]
                      ? format(t.priceYearlyAlternative, {
                          twelve: String((planPrice(plan, 'month') ?? 0) * 12),
                          yearly: String(PLAN_PRICES_EUR[plan]),
                        })
                      : '\u00A0'}
                  </p>
                ) : null}

                {/* La liste est elle-même une sous-grille de sept rangées : les
                    sept prestations sont toujours les mêmes, dans le même ordre
                    (bot, ligues, régie vidéo, arbitrage, classement, marque,
                    API), donc la
                    ligne « arbitrage » d'une offre doit faire face à celle des
                    deux autres — y compris quand l'une d'elles passe sur deux
                    lignes. C'est la comparaison ligne à ligne qui rend la
                    grille lisible ; sans elle on compare des positions, pas des
                    prestations. */}
                <ul className="mt-5 flex-1 space-y-2 text-sm text-gray-200 lg:row-span-7 lg:grid lg:grid-rows-subgrid lg:space-y-0 lg:content-start lg:gap-y-2">
                  {offerLines(plan, t).map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden className="text-purple-300">
                        ·
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                {/* Sur devis : la porte n'est pas le tunnel de souscription
                    mais une conversation. Un bouton « commencer » qui mène à un
                    formulaire de paiement pour une offre sans prix affiché
                    promettrait une chose que la page suivante ne tient pas. */}
                <Link
                  href={
                    PLAN_PRICES_EUR[plan] === null
                      ? '/contact'
                      : `/onboard/request?plan=${plan}&term=${term}`
                  }
                  className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                    highlighted
                      ? 'bg-purple-500 text-white hover:bg-purple-400'
                      : 'border border-white/20 text-gray-100 hover:border-white/40'
                  }`}
                  data-test={`offer-cta-${plan}`}
                >
                  {PLAN_PRICES_EUR[plan] === null
                    ? t.offerCtaContact
                    : t.offerCtaStart}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Ambassadeur·rices : la Découverte leur est offerte. Le dire ICI,
            sous les prix, plutôt que sur la seule page du programme — c'est
            devant le tarif qu'on se demande s'il existe une exception. */}
        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] p-5">
          <div>
            <p className="font-semibold text-amber-100">
              {t.ambassadorBannerTitle}
            </p>
            <p className="mt-1 text-sm text-amber-100/80">
              {t.ambassadorBannerBody}
            </p>
          </div>
          <Link
            href="/ambassadors"
            className="rounded-lg border border-amber-300/50 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200"
            data-test="ambassador-banner-cta"
          >
            {t.ambassadorBannerCta}
          </Link>
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-gray-400">
          {t.offersFootnote}{' '}
          <Link href="/contact" className="underline hover:text-gray-200">
            {t.offersCustomNeed}
          </Link>
        </p>
      </section>

      {/* Comment on démarre */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          {t.stepsTitle}
        </h2>
        <ol className="mt-8 space-y-4">
          {[
            [t.step1Title, t.step1Body],
            [t.step2Title, t.step2Body],
            [t.step3Title, t.step3Body],
            [t.step4Title, t.step4Body],
          ].map(([title, body], i) => (
            <li
              key={title}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-200">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-gray-300">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link
            href="/onboard/request"
            className="inline-flex rounded-lg bg-purple-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-400"
            data-test="organisateurs-steps-cta"
          >
            {t.stepsCta}
          </Link>
        </div>
      </section>

      {/* Souscrire */}
      <section id="souscrire" className="mx-auto max-w-3xl px-6 pb-16">
        <div className="rounded-2xl border border-purple-400/40 bg-purple-500/[0.08] p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-white">{t.formTitle}</h2>
          <p className="mt-2 text-sm text-gray-200">{t.formIntro}</p>

          <form onSubmit={startSubscription} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="org-name"
                className="block text-sm font-medium text-gray-200"
              >
                {t.formOrgLabel}
              </label>
              <input
                id="org-name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                maxLength={100}
                placeholder={t.formOrgPlaceholder}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-400 focus:outline-none"
                data-test="subscribe-org-name"
              />
            </div>

            <div>
              <label
                htmlFor="org-plan"
                className="block text-sm font-medium text-gray-200"
              >
                {t.formPlanLabel}
              </label>
              <select
                id="org-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as TenantPlan)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white focus:border-purple-400 focus:outline-none"
                data-test="subscribe-plan"
              >
                {OFFERS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]} — {priceLabel(p, term, t)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
              data-test="subscribe-submit"
            >
              {t.formSubmit}
            </button>
            <p className="text-xs text-gray-400">{t.formFinePrint}</p>
          </form>
        </div>
      </section>

      {/* Développeurs — on ne les perd pas en route */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <h2 className="text-xl font-bold text-white">{t.devTitle}</h2>
          <p className="mt-2 text-sm text-gray-300">{t.devBody}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/developpeurs/reference"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:border-white/40"
            >
              {t.devReferenceLink}
            </Link>
            <Link
              href="/developpeurs/inscription"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-gray-100 transition hover:border-white/40"
            >
              {t.devSignupLink}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const organisateursSeo: SeoProps = {
  title: {
    fr: 'Organisez vos tournois',
    en: 'Run your tournaments',
  },
  description: {
    fr: 'La plateforme qui fait tourner la Coupe, ouverte aux organisateurs : inscriptions, brackets, check-in, arbitrage, régie et bot Discord. Un palier gratuit, puis des offres à partir de 290 € par an.',
    en: 'The platform behind the Cup, open to organisers: sign-ups, brackets, check-in, dispute handling, production and a Discord bot. A free tier, then plans from €290 a year.',
  },
};

OrganisateursPage.seo = organisateursSeo;

export default OrganisateursPage;
