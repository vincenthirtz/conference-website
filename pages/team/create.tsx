// pages/team/create.tsx — création d'équipe PUBLIQUE (sans compte) : wizard
// 3 étapes + aperçu live, pont magic-link vers /player/manage-team.
//
// Coquille (lot P11) : l'état et l'envoi vivent dans
// components/TeamCreate/useTeamCreateWizard.ts, le rendu dans
// components/TeamCreate/* — découpés à l'identique (mêmes classes, mêmes
// textes). Hors surface Ruban : c'est le site public.

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useTeamCreateWizard } from '@/components/TeamCreate/useTeamCreateWizard';
import SuccessView from '@/components/TeamCreate/SuccessView';
import WizardForm from '@/components/TeamCreate/WizardForm';

export default function PublicCreateTeamPage() {
  const w = useTeamCreateWizard();
  const { t } = w;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black via-[#0b0b12] to-black px-4 pb-16 pt-header text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-16 h-[420px] w-[420px] rounded-full bg-[var(--color-violet)]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-40 h-[360px] w-[360px] rounded-full bg-[var(--color-green)]/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl">
        <header className="mb-10 space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-gray-300">
            <span className="rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-2 py-[2px] font-semibold text-white">
              {t.badgePublic}
            </span>
            <span>{t.badgeTeam}</span>
          </div>
          <h1 className="text-3xl font-bold md:text-4xl">{t.title}</h1>
          <p className="mx-auto max-w-2xl text-sm text-gray-300">
            {t.subtitle}
          </p>
        </header>

        {/* Bandeau « ton équipe sera automatiquement inscrite au tournoi »
            retiré : c'était une promesse que le serveur ne tient plus une fois
            le tournoi complet (`create-with-member` n'inscrit ni ne candidate
            au-delà de `max_teams`). Mieux vaut ne rien annoncer que d'annoncer
            faux — la page reste ce qu'elle est, un formulaire de création
            d'équipe. */}

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--color-green)]/30 bg-[var(--color-green)]/5 px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-green-light)]">
                {t.registrationsEyebrow}
              </p>
              <p className="text-sm text-emerald-50/90">
                {t.registrationsDesc}
              </p>
            </div>
            <Link
              href="/timeline-2026"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-green)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              {t.viewTimeline}
            </Link>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--color-violet)]/30 bg-gradient-to-br from-[var(--color-violet)]/10 via-white/[0.02] to-[var(--color-green)]/10 px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-violet-light)]">
                {t.firstTimeEyebrow}
              </p>
              <p className="text-sm text-purple-50/90">{t.firstTimeDesc}</p>
            </div>
            <Link
              href="/guide/gerer-mon-equipe"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {t.viewGuide}
            </Link>
          </div>
        </div>

        {w.result ? <SuccessView w={w} /> : <WizardForm w={w} />}
      </div>
    </div>
  );
}

const publicCreateTeamSeo: SeoProps = {
  title: {
    fr: 'Créer une équipe',
    en: 'Create a team',
  },
  description: {
    fr: 'Crée ton équipe OW Women’s Cup et ajoute rapidement ton roster complet (emails existants ou comptes créés automatiquement).',
    en: 'Create your OW Women’s Cup team and quickly add your full roster (existing emails or auto-created accounts).',
  },
};

PublicCreateTeamPage.seo = publicCreateTeamSeo;
