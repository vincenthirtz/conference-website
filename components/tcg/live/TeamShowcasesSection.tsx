// components/tcg/live/TeamShowcasesSection.tsx
//
// Les VITRINES TCG des joueuses d'une équipe, sur sa fiche publique
// (`/team/[slug]`). Le consentement est celui de la vitrine elle-même : seules
// les vitrines ACTIVES arrivent ici, relues contre la possession réelle et
// passées par le filtre des faces (`readPublicShowcase`, côté serveur dans
// `utils/teams/buildTeamPage.ts`). Aucune vitrine = rien rendu.
//
// Le lien mène à la fiche de la joueuse, déjà publique (l'équipe la liste
// dans son roster) : la vitrine complète y est.

import type { JSX } from 'react';
import {
  rubanCard,
  rubanEyebrow,
  rubanMuted,
  rubanStrong,
} from '@/features/ruban/ruban';
import Link from 'next/link';
import type { ShowcaseCard } from '@/utils/tcg/showcase';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgLive from '@/lib/i18n/locales/fr/tcgLive';
import LiveCard from './LiveCard';

export type TeamMemberShowcase = {
  userId: string;
  name: string;
  cards: ShowcaseCard[];
};

export default function TeamShowcasesSection({
  showcases,
}: {
  showcases: TeamMemberShowcase[] | null | undefined;
}): JSX.Element | null {
  const t = useT(nsTcgLive);
  if (!showcases || showcases.length === 0) return null;
  return (
    <section
      className={`${rubanCard} mb-6 px-5 py-4`}
      aria-labelledby="team-tcg-showcases-title"
    >
      <h2 id="team-tcg-showcases-title" className={rubanEyebrow}>
        {t.teamShowcasesTitle}
      </h2>
      <p className={`mt-1 text-sm ${rubanMuted}`}>{t.teamShowcasesIntro}</p>
      <ul className="mt-4 space-y-5">
        {showcases.map((s) => (
          <li key={s.userId}>
            <h3 className={`mb-2 text-sm ${rubanStrong}`}>
              <Link
                href={`/player/${encodeURIComponent(s.userId)}`}
                className="hover:underline"
              >
                {format(t.teamShowcaseOf, { name: s.name })}
              </Link>
            </h3>
            <ul className="grid grid-cols-3 gap-3 sm:max-w-md">
              {s.cards.map((card) => (
                <li key={card.key} className="min-w-0">
                  <LiveCard card={card} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
