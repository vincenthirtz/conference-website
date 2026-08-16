// components/tournament/landing/TournamentInfoCards.tsx
//
// Contenu rédactionnel réel du tournoi (champs libres admin : infos, calendrier,
// règles d'horaires, détails du format). Masquée si tout est vide. Réutilise les
// titres du namespace `tournamentDetail`.

import { useT } from '@/lib/i18n/useT';
import { Section, Reveal } from './primitives';
import nsTournamentDetail from '@/lib/i18n/locales/fr/tournamentDetail';

type Card = { title: string; content: string; accent: string };

const ACCENT: Record<string, string> = {
  violet: 'border-[var(--color-violet)]/25',
  green: 'border-[var(--color-green)]/25',
  yellow: 'border-[var(--color-yellow)]/25',
  pink: 'border-[var(--color-violet-light)]/25',
};

export default function TournamentInfoCards({
  descriptionInfo,
  scheduleDetails,
  scheduleRules,
  formatDetails,
}: {
  descriptionInfo?: string | null;
  scheduleDetails?: string | null;
  scheduleRules?: string | null;
  formatDetails?: string | null;
}) {
  const td = useT(nsTournamentDetail);

  const cards: Card[] = [
    descriptionInfo && {
      title: td.infoTitle,
      content: descriptionInfo,
      accent: 'violet',
    },
    scheduleDetails && {
      title: td.scheduleTitle,
      content: scheduleDetails,
      accent: 'green',
    },
    scheduleRules && {
      title: td.scheduleRulesTitle,
      content: scheduleRules,
      accent: 'yellow',
    },
    formatDetails && {
      title: td.formatDetailsTitle,
      content: formatDetails,
      accent: 'pink',
    },
  ].filter(Boolean) as Card[];

  if (cards.length === 0) return null;

  return (
    <Section id="infos" className="!py-10">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c, i) => (
          <Reveal
            key={c.title}
            stagger={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
            className={`rounded-3xl border bg-white/[0.03] p-6 backdrop-blur-sm ${ACCENT[c.accent] || ACCENT.violet}`}
          >
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {c.title}
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">
              {c.content}
            </p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
