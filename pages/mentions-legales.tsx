import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { CookieSettingsButton } from '@/components/CookieBanner';

const dataUses = [
  'Gestion des inscriptions et des comptes (joueuses, staff, bénévoles).',
  'Réponse aux demandes envoyées via le formulaire de contact ou par email.',
  'Organisation des tournois (planning, arbitrage, communications opérationnelles).',
  'Envoi ponctuel d’informations liées aux événements OW Women’s Cup (pas de prospection commerciale).',
];

const rights = [
  'Droit d’accès, de rectification et de suppression de vos données personnelles.',
  'Droit d’opposition et de limitation du traitement lorsque c’est applicable.',
  'Droit à la portabilité des données fournies, sur demande.',
  'Droit d’introduire une réclamation auprès de la CNIL si nécessaire.',
];

function MentionsLegalesPage() {
  const { value: contactEmail } = useSiteSetting('contact_email');

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            Mentions légales
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Mentions légales & confidentialité
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Informations légales de l’association OW Women&apos;s Cup, cadre
            d’utilisation du site et rappel des droits des utilisatrices et
            partenaires.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href={`mailto:${contactEmail}?subject=Question%20mentions%20l%C3%A9gales`}
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Nous écrire
            </a>
            <a
              href="#donnees"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Vos données
            </a>
            <a
              href="#cookies"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Cookies
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-12 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
              Éditeur du site
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Association OW Women&apos;s Cup
            </h2>
            <p className="mt-2 text-sm text-gray-200">
              Site édité par l’association OW Women&apos;s Cup, organisation à
              but non lucratif (loi 1901) animée par une équipe bénévole pour
              promouvoir l’esport féminin.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-gray-200">
              <li>
                Responsable de la publication : cellule communication OW
                Women&apos;s Cup.
              </li>
              <li>
                Contact principal :{' '}
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-purple-200 underline decoration-purple-400/60 underline-offset-4 hover:text-white"
                >
                  {contactEmail}
                </a>
                .
              </li>
              <li>
                Correspondance postale : transmise sur demande pour éviter la
                diffusion publique d’adresses personnelles.
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
            <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
              Hébergement
            </p>
            <h2 className="mt-2 text-xl font-semibold">Netlify</h2>
            <p className="mt-2 text-sm text-gray-200">
              Le site est hébergé par Netlify, Inc. – www.netlify.com
              (hébergement statique et CDN).
            </p>
            <p className="mt-2 text-xs text-gray-300">
              Services techniques utilisés : Supabase (authentification et base
              de données), Formspree (formulaire de contact) et outils internes
              pour la gestion des tournois.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                Responsabilités
              </p>
              <h3 className="text-2xl font-bold">Utilisation du site</h3>
            </div>
            <p className="text-sm text-gray-200">
              Informations fournies à titre indicatif. Les règles de tournoi
              publiées font foi pour les participantes.
            </p>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-100">
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                L’association met tout en œuvre pour publier des informations
                exactes mais ne peut garantir l’absence totale d’erreurs ou
                d’omissions.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                Les liens externes présents sur le site sont fournis pour
                faciliter l’accès à des ressources. L’association n’est pas
                responsable de leur contenu.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                Toute signalisation d’un contenu problématique ou d’un
                dysfonctionnement peut être adressée à{' '}
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                .
              </span>
            </li>
          </ul>
        </section>

        <section
          id="donnees"
          className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              Données personnelles
            </p>
            <h3 className="text-2xl font-bold text-white">
              Protection des données
            </h3>
            <p className="text-sm text-gray-300">
              Les données collectées sont limitées au strict nécessaire pour
              faire vivre le tournoi et la communauté.
            </p>
          </div>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white">Finalités</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {dataUses.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-[6px] h-2 w-2 rounded-full bg-emerald-400"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white">Vos droits</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {rights.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-[6px] h-2 w-2 rounded-full bg-emerald-400"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-300">
                Exercez vos droits en écrivant à{' '}
                <a
                  href={`mailto:${contactEmail}`}
                  className="underline decoration-purple-400/60 underline-offset-4 hover:text-white"
                >
                  {contactEmail}
                </a>
                . Les données sont conservées le temps strictement nécessaire à
                l'organisation des événements.
              </p>
            </div>
          </div>
          <div
            id="cookies"
            className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-200"
          >
            <p className="font-semibold text-white text-base">
              Cookies & traceurs
            </p>
            <p className="mt-2">
              Conformément au RGPD et à la directive ePrivacy, nous vous
              informons des cookies utilisés sur ce site et vous permettons de
              gérer vos préférences.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  Cookies essentiels
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-purple-500/30 text-purple-200">
                    Requis
                  </span>
                </p>
                <p className="mt-1 text-gray-300 text-xs">
                  Nécessaires au fonctionnement du site : authentification
                  Supabase, gestion de session pour l&apos;espace
                  administration, sécurité. Ces cookies ne peuvent pas être
                  désactivés.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                  Cookies fonctionnels
                </p>
                <p className="mt-1 text-gray-300 text-xs">
                  Améliorent votre expérience utilisateur en mémorisant vos
                  préférences (thème, langue, etc.). Soumis à votre
                  consentement.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Cookies analytiques
                </p>
                <p className="mt-1 text-gray-300 text-xs">
                  Nous aident à comprendre comment vous utilisez le site pour
                  l&apos;améliorer (pages visitées, durée de visite). Soumis à
                  votre consentement. Actuellement non utilisés.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="font-medium text-white flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-pink-400" />
                  Cookies marketing
                </p>
                <p className="mt-1 text-gray-300 text-xs">
                  Utilisés pour afficher des publicités pertinentes. Soumis à
                  votre consentement.{' '}
                  <strong>Aucun cookie marketing n&apos;est utilisé</strong> sur
                  ce site.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-white/10">
              <p className="text-xs text-gray-400">
                Vos préférences sont enregistrées localement sur votre
                navigateur et peuvent être modifiées à tout moment.
              </p>
              <CookieSettingsButton />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              Propriété intellectuelle
            </p>
            <h3 className="text-2xl font-bold text-white">
              Contenus & crédits
            </h3>
            <p className="text-sm text-gray-300">
              Textes, visuels, identité graphique et logo OW Women&apos;s Cup
              sont la propriété de l’association ou utilisés avec l’autorisation
              de leurs propriétaires.
            </p>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-gray-200">
            <li>
              Toute reproduction ou diffusion des contenus est autorisée
              uniquement pour un usage non commercial avec mention de la source.
            </li>
            <li>
              Les marques ou ressources d’Overwatch et Blizzard restent la
              propriété exclusive de leurs titulaires respectifs.
            </li>
            <li>
              Pour toute demande d’utilisation de contenus (partenariat, presse,
              médias), écrivez à{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="underline decoration-purple-400/60 underline-offset-4 hover:text-white"
              >
                {contactEmail}
              </a>
              .
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

const mentionsSeo: SeoProps = {
  title: 'Mentions légales',
  description:
    "Mentions légales de l'association OW Women's Cup : éditeur du site, hébergement, données personnelles et droits des utilisatrices.",
};

MentionsLegalesPage.seo = mentionsSeo;

export default MentionsLegalesPage;
