// pages/securite.tsx — « Aide et sécurité » / « Help & safety ».
//
// Le pendant HORS DU MONDE de la Grande salle de lecture de la Women's Library
// (docs/PLAN-womens-library.md, lot 8) : mêmes contenus, sans canvas et sans
// compte. Ouverte à toutes et tous, MINEUR·ES COMPRIS — ce sont d'abord elles
// et eux que le 119 et le 3018 concernent. Pensée pour les lecteurs d'écran :
// un titre par section, un sommaire, des liens qui disent leur action.
//
// EN ATTENTE DE VALIDATION PAR L'ASSOCIATION : `noindex`, un avis visible en
// tête, et la page n'est liée NULLE PART (ni menu, ni pied de page, ni plan du
// site, ni sitemap) tant que le contenu n'est pas validé.
//
// Page statique : rien n'est lu ni écrit côté serveur, aucune trace de qui la
// consulte n'est produite par la page elle-même.

import Head from 'next/head';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import SafetyQuickExit from '@/components/safety/SafetyQuickExit';
import SafetySection from '@/components/safety/SafetySection';
import SafetyHelplines, {
  SAFETY_HELPLINES_ID,
} from '@/components/safety/SafetyHelplines';
import SafetyHarassmentGuides, {
  SAFETY_HARASSMENT_ID,
} from '@/components/safety/SafetyHarassmentGuides';
import SafetyReportSection, {
  SAFETY_REPORT_ID,
} from '@/components/safety/SafetyReportSection';

const CHARTER_ID = 'charte';
const EXIT_ID = 'sortie-rapide';

function SafetyPage() {
  const t = useT(nsSafetyPage);
  const toc = [
    { id: SAFETY_HELPLINES_ID, label: t.emergencyTitle },
    { id: SAFETY_HARASSMENT_ID, label: t.harassTitle },
    { id: SAFETY_REPORT_ID, label: t.reportTitle },
    { id: CHARTER_ID, label: t.charterTitle },
    { id: EXIT_ID, label: t.exitTitle },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        {/* `noindex` passe par `seo` (DefaultSeo) ; on le redit à Googlebot,
            que le document annonce en `index, follow`. */}
        <meta
          name="googlebot"
          content="noindex, nofollow"
          key="safety-googlebot"
        />
      </Head>

      <SafetyQuickExit />

      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/25 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 pt-header-xl pb-10 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-100">
            {t.heroBadge}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">
            {t.heroTitle}
          </h1>
          <span className="brand-rule mt-4 block" aria-hidden="true" />
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-100">
            {t.heroSubtitle}
          </p>

          <p
            role="note"
            className="mt-6 max-w-3xl rounded-xl border border-amber-300/70 bg-amber-950/60 px-4 py-3 text-sm font-medium text-amber-50"
          >
            {t.validationNotice}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-200">
            {t.quickExitHint}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-14 px-4 pb-24 sm:px-6">
        <nav aria-label={t.tocLabel}>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-300">
            {t.tocLabel}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/25 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-white/60 hover:bg-white/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-yellow)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <SafetyHelplines />
        <SafetyHarassmentGuides />
        <SafetyReportSection />

        <SafetySection id={CHARTER_ID} title={t.charterTitle}>
          <p className="mt-4 text-base leading-relaxed text-gray-100">
            {t.charterBody}
          </p>
        </SafetySection>

        <SafetySection id={EXIT_ID} title={t.exitTitle}>
          <p className="mt-4 text-base leading-relaxed text-gray-100">
            {t.exitBody}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-200">
            {t.exitLimit}
          </p>
        </SafetySection>
      </div>
    </div>
  );
}

const safetySeo: SeoProps = {
  title: {
    fr: 'Aide et sécurité',
    en: 'Help & safety',
  },
  description: {
    fr: "Numéros d'urgence et lignes d'écoute, réagir au harcèlement en jeu, sur Discord et en stream, et signaler à l'association OW Women's Cup.",
    en: "Emergency numbers and helplines, responding to harassment in game, on Discord and on stream, and reporting to the OW Women's Cup association.",
  },
  // Contenu en attente de validation par l'association : hors index.
  noindex: true,
};

SafetyPage.seo = safetySeo;

export default SafetyPage;
