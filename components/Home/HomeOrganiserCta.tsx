// components/Home/HomeOrganiserCta.tsx
//
// « Et toi, tu organises ? » — la porte d'entrée ORGANISATRICE de l'accueil.
//
// POURQUOI PAS UN BOUTON DE PLUS DANS LE HERO. Le hero s'adresse au public de
// la Cup : on y suit le direct, on inscrit son équipe, on cherche un roster.
// Il porte déjà trois appels à l'action, et le code y note noir sur blanc que
// le quatrième ne se hiérarchise plus — c'est d'ailleurs pour ça que « je joue
// seule » disparaît pendant la compétition. Une organisatrice n'est pas ce
// public : lui répondre dans le hero, c'est faire payer sa question à tous les
// autres visiteurs.
//
// POURQUOI ICI, TOUT EN BAS. L'argument de vente de cette page, c'est la page
// elle-même : le classement vivant, les actus, les réseaux, les partenaires.
// Quelqu'un qui a fait défiler jusqu'ici a vu tourner ce qu'on lui propose de
// monter. La bande arrive donc APRÈS la démonstration, juste avant le bandeau
// de confiance — pas en travers de la route de celles qui viennent pour les
// matchs.
//
// DEUX LIENS, ET DANS CET ORDRE. « Créer mon tournoi » vise /onboard, le
// parcours self-service (espace créé, auto-approuvé) : c'est l'action. « Voir
// l'offre » vise /organisateurs, qui porte les paliers et les tarifs : c'est
// la question qu'on se pose avant de se lancer. Mettre l'offre en premier
// transformerait une invitation en page de prix.

import type { JSX } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

export default function HomeOrganiserCta(): JSX.Element {
  const t = useT(nsHomeV2);

  return (
    <section
      id="organiser"
      className="container mx-auto mt-16 px-4 md:mt-20 md:px-0"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full bg-[var(--color-violet)]/20 blur-3xl" />
        </div>

        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              {t.organiserEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              {t.organiserTitle}
            </h2>
            <p className="mt-3 text-sm text-gray-300 sm:text-base">
              {t.organiserBody}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/onboard"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--color-green)] px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110 sm:text-base"
            >
              <svg
                className="h-4 w-4 sm:h-5 sm:w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t.organiserCtaCreate}
            </Link>
            <Link
              href="/organisateurs"
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/10 sm:text-base"
            >
              {t.organiserCtaOffer}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
