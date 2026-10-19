// components/safety/SafetyHelplines.tsx
//
// Section 1 de /securite : urgences et lignes d'écoute (France). Chaque numéro
// est un lien `tel:` (ou `sms:` pour le 114) assez grand pour un pouce, avec
// un nom accessible qui dit l'action (« Appeler le 3919 »).

import { useT, format } from '@/lib/i18n/useT';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import SafetySection from './SafetySection';
import { E_ENFANCE_3018_URL, HELPLINES, type Helpline } from './helplines';

type SafetyDict = typeof nsSafetyPage.fr;

export const SAFETY_HELPLINES_ID = 'urgences';

function HelplineCard({ line, t }: { line: Helpline; t: SafetyDict }) {
  const urgent = line.group === 'urgent';
  const tags = [
    t.freeLabel,
    ...(line.kind === 'sms' ? [t.smsLabel] : []),
    ...(line.allDay ? [t.availability24] : []),
  ];
  return (
    <li
      className={`flex flex-col rounded-2xl border p-4 ${
        urgent
          ? 'border-red-300/70 bg-red-950/50'
          : 'border-white/20 bg-white/[0.05]'
      }`}
    >
      <p className="text-base font-semibold text-white">{t[line.nameKey]}</p>
      <a
        href={line.href}
        aria-label={format(line.kind === 'sms' ? t.smsAria : t.callAria, {
          number: line.number,
        })}
        className="mt-1 inline-flex min-h-11 w-fit items-center rounded-lg text-4xl font-extrabold tracking-tight text-white underline decoration-2 underline-offset-[6px] hover:text-[var(--color-yellow-light)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-yellow)]"
      >
        {line.number}
      </a>
      <p className="mt-2 text-sm leading-relaxed text-gray-100">
        {t[line.bodyKey]}
      </p>
      {line.number === '3018' && (
        <p className="mt-2 text-sm leading-relaxed text-gray-100">
          {t.line3018ExtraBefore}
          <a
            href={E_ENFANCE_3018_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white underline underline-offset-2 hover:text-[var(--color-yellow-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] rounded"
          >
            3018.fr<span className="sr-only"> {t.newTab}</span>
          </a>
          {t.line3018ExtraAfter}
        </p>
      )}
      <ul className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white"
          >
            {tag}
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function SafetyHelplines() {
  const t = useT(nsSafetyPage);
  const urgent = HELPLINES.filter((line) => line.group === 'urgent');
  const listen = HELPLINES.filter((line) => line.group === 'listen');

  return (
    <SafetySection id={SAFETY_HELPLINES_ID} title={t.emergencyTitle}>
      <p className="mt-4 text-base leading-relaxed text-gray-100">
        {t.emergencyIntro}
      </p>

      <div className="mt-6 space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {t.urgentGroupTitle}
          </h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {urgent.map((line) => (
              <HelplineCard key={line.number} line={line} t={t} />
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white">
            {t.listenGroupTitle}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-gray-200">
            {t.listenGroupIntro}
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {listen.map((line) => (
              <HelplineCard key={line.number} line={line} t={t} />
            ))}
          </ul>
        </div>
      </div>
    </SafetySection>
  );
}
