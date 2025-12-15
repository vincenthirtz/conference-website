import Head from 'next/head';
import Link from 'next/link';
import Button from '@/components/Buttons/button';

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
    impact: 'Aide à financer un kit repas + boissons pour une bénévole sur un jour d’événement.',
  },
  {
    label: 'Supporter·rice',
    amount: '50 €',
    impact: 'Couvre la création de visuels dédiés aux joueuses et la modération d’une soirée de stream.',
  },
  {
    label: 'Allié·e',
    amount: '100 €',
    impact: 'Participe au transport ou à l’hébergement d’une équipe qui n’a pas de budget.',
  },
  {
    label: 'Mécène',
    amount: '250 €+',
    impact: 'Permet de lancer un atelier inclusif (matériel + encadrement) ou de sécuriser une captation entière.',
  },
];

const donationMail =
  'mailto:owwomenscup@gmail.com?subject=Don%20pour%20l%27association%20OW%20Women%27s%20Cup&body=Bonjour%20%21%0AJe%20souhaite%20faire%20un%20don.%20Merci%20de%20m%27indiquer%20la%20marche%20%C3%A0%20suivre.%0A';

export default function DonationPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <title>Faire un don | OW Women&apos;s Cup</title>
        <meta
          name="description"
          content="Soutenez l'association OW Women's Cup et aidez-nous à rendre l'esport plus inclusif."
        />
      </Head>

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
            Chaque contribution nous aide à ouvrir plus de places pour les joueuses, sécuriser les
            événements et montrer que la performance féminine mérite un cadre ambitieux.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href={donationMail}
              className="flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Écrire pour faire un don
            </a>
            <Link
              href="/tournoi"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Découvrir le projet
            </Link>
          </div>

          <div className="mx-auto mt-10 max-w-4xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10 backdrop-blur-xl shadow-2xl shadow-black/40">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="col-span-2 space-y-4 text-left">
                <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
                  Ce que votre don rend possible
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {uses.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <p className="text-lg font-semibold text-white">{item.title}</p>
                      <p className="mt-2 text-sm text-gray-200">{item.detail}</p>
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
        <section className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.14em] text-gray-300">Choisir un montant</p>
              <h2 className="text-3xl font-bold">Un geste, un impact concret</h2>
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
                <p className="text-xs uppercase tracking-[0.14em] text-gray-300">{tier.label}</p>
                <p className="mt-3 text-3xl font-bold text-white">{tier.amount}</p>
                <p className="mt-4 text-sm text-gray-200">{tier.impact}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-1">
                <p className="text-sm uppercase tracking-[0.14em] text-gray-200">
                  Comment donner
                </p>
                <h3 className="mt-2 text-2xl font-bold">Choisissez votre manière</h3>
                <p className="mt-3 text-sm text-gray-100">
                  Nous revenons vers vous sous 24h pour partager le RIB, un lien de paiement ou
                  préparer une convention de mécénat.
                </p>
              </div>

              <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                  <p className="text-lg font-semibold text-white">Virement</p>
                  <p className="mt-2 text-sm text-gray-200">
                    Recevez le RIB de l&apos;association et une confirmation dès réception de votre
                    don.
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
                  <p className="text-lg font-semibold text-white">Entreprises</p>
                  <p className="mt-2 text-sm text-gray-200">
                    Vous souhaitez soutenir ou sponsoriser ? Parlons visibilité, ateliers et
                    mécénat.
                  </p>
                  <Button
                    overlay
                    type="button"
                    className="mt-4 h-auto w-full justify-center rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20"
                    onClick={() =>
                      window.location.assign(
                        'mailto:owwomenscup@gmail.com?subject=Partenariat%20ou%20m%C3%A9c%C3%A9nat%20OW%20Women%27s%20Cup&body=Bonjour%20%21%0AJe%20souhaite%20discuter%20d%27un%20partenariat%20ou%20m%C3%A9c%C3%A9nat.%0A'
                      )
                    }
                  >
                    Parler sponsoring
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-5xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 text-center">
            <p className="text-sm uppercase tracking-[0.14em] text-gray-300">Une question ?</p>
            <h4 className="mt-2 text-2xl font-semibold">On reste disponible</h4>
            <p className="mt-3 text-sm text-gray-200">
              Besoin d&apos;un reçu, de comprendre l&apos;affectation des dons ou de connaître les
              prochaines actions ? Écrivez-nous, on vous répond vite.
            </p>
            <div className="mt-5 flex justify-center">
              <a
                href={donationMail}
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                owwomenscup@gmail.com
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
