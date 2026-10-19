// components/safety/SafetyReportSection.tsx
//
// Section 3 de /securite : comment l'association traite un signalement. Le
// texte décrit le parcours RÉEL (formulaire /support et commande Discord
// /signalement → /api/support/ticket de conference-api) :
//   - anonyme possible : ni nom, ni e-mail, ni compte, ni identité Discord
//     enregistrés ;
//   - gravité « haute » → ping immédiat du rôle de modération sur Discord ;
//     basse ou moyenne → message dans le salon, sans ping ;
//   - prise en charge par un membre du staff ; suites jusqu'à la liste
//     d'exclusion (conversion en blacklist joueuse ou structure) ;
//   - accusé de réception et retour sur la suite seulement par e-mail, donc
//     seulement si une adresse est donnée.
//
// Le bouton principal ouvre /support pré-rempli (catégorie `behavior`, case
// anonyme cochée) — utils/support/prefill.ts.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import { buildSupportHref } from '@/utils/support/prefill';
import SafetySection from './SafetySection';

export const SAFETY_REPORT_ID = 'signaler';

/** Le guichet : signalement de comportement, anonymat proposé. */
export const SAFETY_REPORT_HREF = buildSupportHref({
  category: 'behavior',
  anonymous: true,
});
/** Même formulaire, sans l'anonymat coché, pour qui veut un retour. */
export const SAFETY_REPORT_NAMED_HREF = buildSupportHref({
  category: 'behavior',
});

export default function SafetyReportSection() {
  const t = useT(nsSafetyPage);
  const steps = [
    t.reportStep1,
    t.reportStep2,
    t.reportStep3,
    t.reportStep4,
    t.reportStep5,
  ];

  return (
    <SafetySection id={SAFETY_REPORT_ID} title={t.reportTitle}>
      <p className="mt-4 text-base leading-relaxed text-gray-100">
        {t.reportIntro}
      </p>

      <ol className="mt-6 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/[0.04] p-4"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-violet-cta)] text-sm font-bold text-white"
            >
              {index + 1}
            </span>
            <span className="text-sm leading-relaxed text-gray-100">
              {step}
            </span>
          </li>
        ))}
      </ol>

      <p
        role="note"
        className="mt-6 rounded-xl border-2 border-red-300/70 bg-red-950/50 px-4 py-3 text-sm font-semibold leading-relaxed text-white"
      >
        {t.reportNotEmergency}
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href={SAFETY_REPORT_HREF}
          aria-describedby="safety-report-hint"
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-transparent bg-[var(--color-violet-cta)] px-7 py-3 text-base font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-violet-light)]"
        >
          {t.reportCta}
        </Link>
        <Link
          href={SAFETY_REPORT_NAMED_HREF}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-violet-light)]"
        >
          {t.reportCtaNamed}
        </Link>
      </div>
      <p
        id="safety-report-hint"
        className="mt-3 text-sm leading-relaxed text-gray-200"
      >
        {t.reportCtaHint}
      </p>
    </SafetySection>
  );
}
