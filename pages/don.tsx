import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';

const uses = [
  {
    title: 'Inclusion & accompagnement',
    detail:
      'Frais de déplacement, hébergement solidaire et matériel prêté pour que chaque joueuse puisse participer dans de bonnes conditions.',
  },
  {
    title: 'Production & diffusion',
    detail:
      'Locations studio, captation, graphismes live et modération pour proposer un show accessible et sûr.',
  },
  {
    title: 'Actions locales',
    detail:
      'Ateliers découverte, interventions scolaires et mentorat avec des rôles modèles issues de l’esport féminin.',
  },
];

const tiers = [
  {
    label: 'Coup de pouce',
    amount: '25 €',
    impact:
      'Aide à payer le site web (nom de domaine, serveur) ou des frais bancaires.',
  },
  {
    label: 'Supporter·rice',
    amount: '50 €',
    impact:
      'Couvre la création de visuels dédiés aux live et la modération d’une soirée de stream.',
  },
  {
    label: 'Allié·e',
    amount: '100 €',
    impact:
      'Participe au cashprize du futur tournoi et offir des goodies à toutes les joueuses.',
  },
  {
    label: 'Mécène',
    amount: '250 €+',
    impact:
      'Permet de lancer un live (matériel + encadrement) dans une salle ou de sécuriser une captation entière.',
  },
];

const presetAmounts = [2500, 5000, 10000, 25000] as const;

// Set to false once HelloAsso credentials are configured and the integration is live
const COMING_SOON = true;

function DonationPage() {
  const router = useRouter();
  const { value: contactEmail } = useSiteSetting('contact_email');

  // Online donation form state
  const [selectedAmount, setSelectedAmount] = useState<number>(2500);
  const [customAmount, setCustomAmount] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Payment status from redirect
  const paymentStatus = router.query.status as string | undefined;

  const effectiveAmount = customAmount
    ? Math.round(Number(customAmount) * 100)
    : selectedAmount;

  async function handleDonate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (effectiveAmount < 100) {
      setFormError('Le montant minimum est 1 €.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/helloasso/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: effectiveAmount,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Une erreur est survenue.');
        return;
      }

      // Redirect to HelloAsso payment page
      window.location.href = data.redirectUrl;
    } catch {
      setFormError('Impossible de contacter le serveur. Réessayez plus tard.');
    } finally {
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
            Soutenir l&apos;association
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Faites un don pour faire grandir l&apos;esport féminin
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Chaque contribution nous aide à ouvrir plus de places pour les
            joueuses, sécuriser les événements et montrer que la performance
            féminine mérite un cadre ambitieux.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            {COMING_SOON ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-gray-300 cursor-default">
                Paiement en ligne bientôt disponible
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
                Faire un don en ligne
              </a>
            )}
            <Link
              href="/tournoi"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Découvrir le projet
            </Link>
          </div>

          <div className="mx-auto mt-10 max-w-4xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 backdrop-blur-xl shadow-2xl shadow-black/40">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-3">
              <div className="space-y-4 text-left sm:col-span-2">
                <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
                  Ce que votre don rend possible
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
                  Transparence
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Chaque euro est fléché et documenté.
                </p>
                <ul className="mt-3 space-y-2 text-sm text-emerald-50">
                  <li>• Rapports d&apos;impact envoyés aux donateur·rices</li>
                  <li>• Budget suivi par l&apos;équipe staff</li>
                  <li>• Priorité donnée aux actions inclusives</li>
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
              Merci pour votre don !
            </p>
            <p className="mt-2 text-sm text-emerald-50">
              Votre paiement a bien été pris en compte. Vous recevrez un email
              de confirmation de la part de HelloAsso.
            </p>
          </div>
        )}
        {paymentStatus === 'error' && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-red-100">
              Le paiement n&apos;a pas abouti.
            </p>
            <p className="mt-2 text-sm text-red-50">
              Vous pouvez réessayer ci-dessous ou nous contacter si le problème
              persiste.
            </p>
          </div>
        )}

        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
                Choisir un montant
              </p>
              <h2 className="text-3xl font-bold">
                Un geste, un impact concret
              </h2>
            </div>
            <p className="text-sm text-gray-300">
              Les montants ci-dessous sont indicatifs : chaque don compte.
            </p>
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
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
            {COMING_SOON && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-black/70 backdrop-blur-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-purple-300">
                  Coming soon
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  Paiement en ligne bientôt disponible
                </p>
                <p className="mt-2 max-w-md text-center text-sm text-gray-300">
                  Le don par carte bancaire via HelloAsso sera disponible très
                  prochainement. En attendant, vous pouvez nous contacter pour
                  faire un don par virement.
                </p>
              </div>
            )}
            <div className={`grid gap-8 md:grid-cols-3${COMING_SOON ? ' select-none' : ''}`}>
              <div className="md:col-span-1">
                <p className="text-sm uppercase tracking-[0.14em] text-gray-200">
                  Faire un don en ligne
                </p>
                <h3 className="mt-2 text-2xl font-bold">
                  Paiement sécurisé
                </h3>
                <p className="mt-3 text-sm text-gray-100">
                  Réglez par carte bancaire via HelloAsso, la plateforme de
                  référence des associations françaises. Aucune commission n&apos;est
                  prélevée sur votre don.
                </p>
              </div>

              <form
                onSubmit={handleDonate}
                className="md:col-span-2 space-y-5"
                aria-disabled={COMING_SOON}
              >
                {/* Amount selection */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-200">
                    Montant du don
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
                      placeholder="Autre (€)"
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
                      Prénom
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
                      Nom
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
                    Email
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
                  <p className="text-sm text-red-400">{formError}</p>
                )}

                <Button
                  overlay
                  type="submit"
                  disabled={loading || COMING_SOON}
                  className="h-auto w-full justify-center rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {loading
                    ? 'Redirection...'
                    : `Donner ${effectiveAmount >= 100 ? `${effectiveAmount / 100} €` : ''} via HelloAsso`}
                </Button>

                <p className="text-center text-xs text-gray-400">
                  Vous serez redirigé vers HelloAsso pour finaliser le paiement
                  de façon sécurisée.
                </p>
              </form>
            </div>
          </div>
        </section>

        {/* Alternative methods */}
        <section>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 shadow-xl">
            <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
              Autres moyens
            </p>
            <h3 className="mt-2 text-2xl font-bold">
              Virement ou mécénat
            </h3>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-lg font-semibold text-white">Virement</p>
                <p className="mt-2 text-sm text-gray-200">
                  Recevez le RIB de l&apos;association et une confirmation dès
                  réception de votre don.
                </p>
                <Button
                  overlay
                  type="button"
                  className="mt-4 h-auto w-full justify-center rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 text-sm font-semibold"
                  onClick={() => window.location.assign(donationMail)}
                >
                  Demander le RIB
                </Button>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-lg font-semibold text-white">
                  Entreprises
                </p>
                <p className="mt-2 text-sm text-gray-200">
                  Vous souhaitez soutenir ou sponsoriser ? Parlons visibilité,
                  ateliers et mécénat.
                </p>
                <Button
                  overlay
                  type="button"
                  className="mt-4 h-auto w-full justify-center rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20"
                  onClick={() => window.location.assign(sponsorMail)}
                >
                  Parler sponsoring
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-5xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 text-center">
            <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
              Une question ?
            </p>
            <h4 className="mt-2 text-2xl font-semibold">On reste disponible</h4>
            <p className="mt-3 text-sm text-gray-200">
              Besoin d&apos;un reçu, de comprendre l&apos;affectation des dons
              ou de connaître les prochaines actions ? Écrivez-nous, on vous
              répond vite.
            </p>
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
  title: 'Faire un don',
  description:
    "Soutenez l'association OW Women's Cup : financez les déplacements des équipes, la production et les actions inclusives autour de l'esport féminin.",
};

DonationPage.seo = donationSeo;

export default DonationPage;
