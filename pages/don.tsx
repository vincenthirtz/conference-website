import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useT } from '@/lib/i18n/useT';
import nsDonPage from '@/lib/i18n/locales/fr/donPage';

type DonDict = typeof nsDonPage.fr;

// Le don en ligne se fait sur la page de paiement de notre banque (Monetico) :
// une page hébergée, sans API — un lien, plus de formulaire. La même adresse
// que le QR `public/images/qr.png`.
const DONATION_URL =
  'https://www.monetico-online-asso.com/association-womens-cup/don';

const getUses = (t: DonDict) => [
  { title: t.use1Title, detail: t.use1Detail },
  { title: t.use2Title, detail: t.use2Detail },
  { title: t.use3Title, detail: t.use3Detail },
];

const getTiers = (t: DonDict) => [
  { label: t.tier1Label, amount: '20 €', impact: t.tier1Impact },
  { label: t.tier2Label, amount: '50 €', impact: t.tier2Impact },
  { label: t.tier3Label, amount: '100 €', impact: t.tier3Impact },
  { label: t.tier4Label, amount: '150 €', impact: t.tier4Impact },
];

function DonationPage() {
  const router = useRouter();
  const t = useT(nsDonPage);
  const uses = getUses(t);
  const tiers = getTiers(t);
  const { value: contactEmail } = useSiteSetting('contact_email');

  // Retour de paiement `?status=success|error`. Plus aucun don n'y revient
  // depuis le site, mais le paiement d'un plan d'espace (conference-api,
  // `features/admin/tenants/service/settings.ts`) renvoie toujours ici.
  const paymentStatus = router.query.status as string | undefined;

  const donationMail = `mailto:${contactEmail}?subject=Don%20pour%20l%27association%20OW%20Women%27s%20Cup&body=Bonjour%20%21%0AJe%20souhaite%20faire%20un%20don.%20Merci%20de%20m%27indiquer%20la%20marche%20%C3%A0%20suivre.%0A`;
  const sponsorMail = `mailto:${contactEmail}?subject=Partenariat%20ou%20m%C3%A9c%C3%A9nat%20OW%20Women%27s%20Cup&body=Bonjour%20%21%0AJe%20souhaite%20discuter%20d%27un%20partenariat%20ou%20m%C3%A9c%C3%A9nat.%0A`;
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 pt-header-xl pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-brand-gradient sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <span className="brand-rule mx-auto mt-4" aria-hidden />
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#don-en-ligne"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById('don-en-ligne')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="flex items-center justify-center rounded-full bg-[var(--color-violet-cta)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.donateOnline}
            </a>
            <Link
              href="/tournoi"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-[var(--color-yellow)]/60 hover:bg-[var(--color-yellow)]/10 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {t.discoverProject}
            </Link>
          </div>

          <div className="mx-auto mt-10 max-w-4xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 backdrop-blur-xl shadow-2xl shadow-black/40">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-3">
              <div className="space-y-4 text-left sm:col-span-2">
                <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
                  {t.usesTitle}
                </p>
                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4">
                  {uses.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="brand-dot mt-1 h-2 w-2 flex-none rounded-full" />
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {item.title}
                          </p>
                          <p className="mt-2 text-sm text-gray-200">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-left">
                <p className="text-sm uppercase tracking-[0.14em] text-emerald-100">
                  {t.transparencyLabel}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {t.transparencyTitle}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-emerald-50">
                  <li>• {t.transparency1}</li>
                  <li>• {t.transparency2}</li>
                  <li>• {t.transparency3}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-16 px-4 pb-20 sm:px-6">
        {/* Payment status feedback */}
        {paymentStatus === 'success' && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-emerald-100">
              {t.thanksTitle}
            </p>
            <p className="mt-2 text-sm text-emerald-50">{t.thanksBody}</p>
          </div>
        )}
        {paymentStatus === 'error' && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-red-100">{t.errorTitle}</p>
            <p className="mt-2 text-sm text-red-50">{t.errorBody}</p>
          </div>
        )}

        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
                {t.chooseAmountLabel}
              </p>
              <h2 className="text-3xl font-bold text-brand-gradient">
                {t.chooseAmountTitle}
              </h2>
              <span className="brand-rule mt-3" aria-hidden />
            </div>
            <p className="text-sm text-gray-300">{t.chooseAmountHint}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => (
              <div
                key={tier.label}
                className="group card-brand rounded-2xl bg-white/[0.04] p-5 shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.07]"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-gray-300">
                  {tier.label}
                </p>
                <p className="mt-3 text-3xl font-bold text-[var(--color-yellow)]">
                  {tier.amount}
                </p>
                <p className="mt-4 text-sm text-gray-200">{tier.impact}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Don en ligne : la page de paiement de notre banque, par le bouton ou
            le QR. `id="don-en-ligne"` est l'ancre du bouton du haut de page ET
            du panneau Discord du bot (`/don#don-en-ligne`) : ne pas la
            renommer. */}
        <section
          id="don-en-ligne"
          className="section-brand-bg scroll-mt-header"
        >
          <div className="relative card-brand rounded-3xl bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
            {/* Colonne du QR à largeur FIXE : centré dans une colonne
                fractionnaire (1/3 de la carte), il tombait entre deux pixels et
                l'écran le flouait une seconde fois. */}
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
              <div>
                <p className="text-sm uppercase tracking-[0.14em] text-gray-200">
                  {t.formEyebrow}
                </p>
                <h3 className="mt-2 text-2xl font-bold text-brand-gradient">
                  {t.formTitle}
                </h3>
                <span className="brand-rule mt-3" aria-hidden />
                <p className="mt-3 text-sm text-gray-100">{t.formDesc}</p>
                <a
                  href={DONATION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-violet)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] sm:w-auto"
                >
                  {t.donateCta}
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
              </div>

              <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Image
                  src="/images/qr.png"
                  alt={t.qrAlt}
                  width={128}
                  height={128}
                  className="rounded-lg"
                />
                <p className="text-center text-xs font-medium text-gray-300">
                  {t.qrHint}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Alternative methods */}
        <section>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 shadow-xl">
            <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
              {t.otherMeansLabel}
            </p>
            <h3 className="mt-2 text-2xl font-bold text-brand-gradient">
              {t.otherMeansTitle}
            </h3>
            <span className="brand-rule mt-3" aria-hidden />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="card-brand rounded-2xl bg-white/5 p-4">
                <p className="text-lg font-semibold text-white">
                  {t.transferTitle}
                </p>
                <p className="mt-2 text-sm text-gray-200">{t.transferDesc}</p>
                <Button
                  overlay
                  type="button"
                  className="mt-4 h-auto w-full justify-center rounded-lg bg-[var(--color-violet)] px-4 py-3 text-sm font-semibold transition hover:bg-[var(--color-violet-deep)]"
                  onClick={() => window.location.assign(donationMail)}
                >
                  {t.transferBtn}
                </Button>
              </div>

              <div className="card-brand rounded-2xl bg-white/5 p-4">
                <p className="text-lg font-semibold text-white">
                  {t.companiesTitle}
                </p>
                <p className="mt-2 text-sm text-gray-200">
                  {t.companiesDescBefore}{' '}
                  <Link
                    href="/partenaires"
                    className="font-medium text-purple-300 underline decoration-purple-400/40 underline-offset-2 hover:text-purple-200 hover:decoration-purple-300"
                  >
                    {t.companiesLink}
                  </Link>
                  {t.companiesDescAfter}
                </p>
                <Button
                  overlay
                  type="button"
                  className="mt-4 h-auto w-full justify-center rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20"
                  onClick={() => window.location.assign(sponsorMail)}
                >
                  {t.sponsorBtn}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-5xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 text-center">
            <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
              {t.questionLabel}
            </p>
            <h4 className="mt-2 text-2xl font-semibold text-brand-gradient">
              {t.questionTitle}
            </h4>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
            <p className="mt-3 text-sm text-gray-200">{t.questionBody}</p>
            <div className="mt-5 flex justify-center">
              <a
                href={donationMail}
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-[var(--color-yellow)]/60 hover:bg-[var(--color-yellow)]/10 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
              >
                {contactEmail}
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const donationSeo: SeoProps = {
  title: {
    fr: "Faire un don — soutenir l'esport féminin",
    en: "Donate — support women's esport",
  },
  description: {
    fr: "Soutenez l'association Women's Cup : financez les déplacements des équipes, la production et les actions inclusives autour de l'esport féminin.",
    en: "Support the Women's Cup association: help fund team travel, broadcast production and inclusive initiatives for women's esport.",
  },
};

DonationPage.seo = donationSeo;

export default DonationPage;
