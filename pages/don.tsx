import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';

type DonDict = ReturnType<typeof useT<'donPage'>>;

// Idempotency-Key pour le checkout HelloAsso (POST public/anonyme : pas de
// session Supabase, donc useIdempotentMutation ne s'applique pas). Un
// double-click / retry réseau renvoie la même clé tant que le checkout n'a pas
// abouti — combiné au verrouillage du bouton jusqu'à la redirection.
function genIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

const presetAmounts = [2000, 5000, 10000, 15000] as const;

const COMING_SOON = false;

function DonationPage() {
  const router = useRouter();
  const t = useT('donPage');
  const uses = getUses(t);
  const tiers = getTiers(t);
  const { value: contactEmail } = useSiteSetting('contact_email');

  // Online donation form state
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const { addToast } = useToast();
  const idempotencyKeyRef = useRef<string>(genIdempotencyKey());

  // Payment status from redirect
  const paymentStatus = router.query.status as string | undefined;

  const effectiveAmount = customAmount
    ? Math.round(Number(customAmount) * 100)
    : selectedAmount;

  async function handleDonate(e: React.FormEvent) {
    e.preventDefault();
    // Verrou anti double-checkout : dès le 1er clic, on bloque tant que la
    // requête est en cours OU jusqu'à la redirection vers HelloAsso.
    if (loading) return;
    setFormError('');

    if (effectiveAmount < 100) {
      setFormError(t.minAmountError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/helloasso/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          amount: effectiveAmount,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Échec : on régénère la clé pour que la prochaine tentative soit une
        // nouvelle intention, et on réactive le bouton.
        idempotencyKeyRef.current = genIdempotencyKey();
        const message = data.error || t.genericError;
        setFormError(message);
        addToast(message, 'error');
        setLoading(false);
        return;
      }

      // Succès : on NE réactive PAS le bouton — la redirection part. Garder le
      // bouton verrouillé empêche un second checkout pendant la navigation.
      window.location.href = data.redirectUrl;
    } catch {
      idempotencyKeyRef.current = genIdempotencyKey();
      const message = t.serverError;
      setFormError(message);
      addToast(message, 'error');
      setLoading(false);
    }
  }

  const donationMail = `mailto:${contactEmail}?subject=Don%20pour%20l%27association%20OW%20Women%27s%20Cup&body=Bonjour%20%21%0AJe%20souhaite%20faire%20un%20don.%20Merci%20de%20m%27indiquer%20la%20marche%20%C3%A0%20suivre.%0A`;
  const sponsorMail = `mailto:${contactEmail}?subject=Partenariat%20ou%20m%C3%A9c%C3%A9nat%20OW%20Women%27s%20Cup&body=Bonjour%20%21%0AJe%20souhaite%20discuter%20d%27un%20partenariat%20ou%20m%C3%A9c%C3%A9nat.%0A`;
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            {COMING_SOON ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-gray-300 cursor-default">
                {t.comingSoonBtn}
              </span>
            ) : (
              <a
                href="#don-en-ligne"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById('don-prenom')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
              >
                {t.donateOnline}
              </a>
            )}
            <Link
              href="/tournoi"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
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
                        <div className="mt-1 h-2 w-2 flex-none rounded-full bg-gradient-to-r from-purple-400 to-pink-400" />
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
            <p className="text-lg font-semibold text-red-100">
              {t.errorTitle}
            </p>
            <p className="mt-2 text-sm text-red-50">{t.errorBody}</p>
          </div>
        )}

        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
                {t.chooseAmountLabel}
              </p>
              <h2 className="text-3xl font-bold">{t.chooseAmountTitle}</h2>
            </div>
            <p className="text-sm text-gray-300">{t.chooseAmountHint}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => (
              <div
                key={tier.label}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl transition hover:-translate-y-1 hover:border-purple-300/40 hover:bg-white/[0.07]"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-gray-300">
                  {tier.label}
                </p>
                <p className="mt-3 text-3xl font-bold text-white">
                  {tier.amount}
                </p>
                <p className="mt-4 text-sm text-gray-200">{tier.impact}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Online donation form via HelloAsso */}
        <section>
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
            {COMING_SOON && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-black/70 backdrop-blur-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-purple-300">
                  {t.comingSoonEyebrow}
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {t.comingSoonTitle}
                </p>
                <p className="mt-2 max-w-md text-center text-sm text-gray-300">
                  {t.comingSoonBody}
                </p>
              </div>
            )}
            <div
              className={`grid gap-8 md:grid-cols-3${COMING_SOON ? ' select-none' : ''}`}
            >
              <div className="md:col-span-1">
                <p className="text-sm uppercase tracking-[0.14em] text-gray-200">
                  {t.formEyebrow}
                </p>
                <h3 className="mt-2 text-2xl font-bold">{t.formTitle}</h3>
                <p className="mt-3 text-sm text-gray-100">{t.formDesc}</p>
                <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Image
                    src="/images/qr.png"
                    alt={t.qrAlt}
                    width={128}
                    height={128}
                    className="rounded-lg"
                  />
                  <p className="text-xs font-medium text-gray-300">
                    {t.qrHint}
                  </p>
                </div>
              </div>

              <form onSubmit={handleDonate} className="md:col-span-2 space-y-5">
                {/* Amount selection */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-200">
                    {t.amountLabel}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {presetAmounts.map((cents) => (
                      <button
                        key={cents}
                        type="button"
                        disabled={COMING_SOON}
                        onClick={() => {
                          setSelectedAmount(cents);
                          setCustomAmount('');
                        }}
                        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                          !customAmount && selectedAmount === cents
                            ? 'border-purple-400 bg-purple-500/30 text-white'
                            : 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        {cents / 100} €
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder={t.customAmountPlaceholder}
                      disabled={COMING_SOON}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="w-28 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-purple-400"
                    />
                  </div>
                </div>

                {/* Payer info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="don-prenom"
                      className="mb-1 block text-sm text-gray-200"
                    >
                      {t.firstNameLabel}
                    </label>
                    <input
                      id="don-prenom"
                      type="text"
                      required
                      disabled={COMING_SOON}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="don-nom"
                      className="mb-1 block text-sm text-gray-200"
                    >
                      {t.lastNameLabel}
                    </label>
                    <input
                      id="don-nom"
                      type="text"
                      required
                      disabled={COMING_SOON}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-purple-400"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="don-email"
                    className="mb-1 block text-sm text-gray-200"
                  >
                    {t.emailLabel}
                  </label>
                  <input
                    id="don-email"
                    type="email"
                    required
                    disabled={COMING_SOON}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-purple-400"
                  />
                </div>

                {formError && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="text-sm text-red-400"
                  >
                    {formError}
                  </p>
                )}

                <Button
                  overlay
                  type="submit"
                  disabled={loading || COMING_SOON}
                  className="h-auto w-full justify-center rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {loading
                    ? t.submitRedirecting
                    : format(t.submitDonate, {
                        amount:
                          effectiveAmount >= 100
                            ? `${effectiveAmount / 100} €`
                            : '',
                      })}
                </Button>

                <p className="text-center text-xs text-gray-400">
                  {t.redirectNote}
                </p>
              </form>
            </div>
          </div>
        </section>

        {/* Alternative methods */}
        <section>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 shadow-xl">
            <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
              {t.otherMeansLabel}
            </p>
            <h3 className="mt-2 text-2xl font-bold">{t.otherMeansTitle}</h3>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-lg font-semibold text-white">
                  {t.transferTitle}
                </p>
                <p className="mt-2 text-sm text-gray-200">{t.transferDesc}</p>
                <Button
                  overlay
                  type="button"
                  className="mt-4 h-auto w-full justify-center rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 text-sm font-semibold"
                  onClick={() => window.location.assign(donationMail)}
                >
                  {t.transferBtn}
                </Button>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
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
            <h4 className="mt-2 text-2xl font-semibold">{t.questionTitle}</h4>
            <p className="mt-3 text-sm text-gray-200">{t.questionBody}</p>
            <div className="mt-5 flex justify-center">
              <a
                href={donationMail}
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
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
