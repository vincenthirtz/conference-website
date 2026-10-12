// components/tcg/live/index.tsx
//
// Le TCG « EN ACTION » côté public : point d'insertion `<TcgLiveSections />`
// de la page `/tcg`, et blocs réutilisables exportés un par un.
//
//   - RecentPullsSection    — derniers tirages rares
//   - CollectorsLeaderboard — classement des collectionneuses
//   - CardOfWeekSection     — carte de la semaine
//   - TeamShowcasesSection  — vitrines des joueuses, fiche d'équipe
//
// AUTONOME : le conteneur lit lui-même `GET /api/public/tcg/live` (cache CDN
// court), pour s'insérer sans rien demander au chargement de la page hôte.
// Les règles de consentement vivent côté serveur (`utils/tcg/live.ts`) : ces
// composants n'affichent que ce qu'on leur donne.

import type { JSX } from 'react';
import { rubanCard } from '@/features/ruban/ruban';
import { useT } from '@/lib/i18n/useT';
import nsTcgLive from '@/lib/i18n/locales/fr/tcgLive';
import CardOfWeekSection from './CardOfWeekSection';
import CollectorsLeaderboard from './CollectorsLeaderboard';
import RecentPullsSection from './RecentPullsSection';
import { useTcgLive } from '@/features/player/tcg/hooks/useTcgLive';

export { default as CardOfWeekSection } from './CardOfWeekSection';
export { default as CollectorsLeaderboard } from './CollectorsLeaderboard';
export { default as RecentPullsSection } from './RecentPullsSection';
export { default as TeamShowcasesSection } from './TeamShowcasesSection';
export type { TeamMemberShowcase } from './TeamShowcasesSection';
export { default as LiveCard } from './LiveCard';
export { useTcgLive } from '@/features/player/tcg/hooks/useTcgLive';

export default function TcgLiveSections({
  className = '',
}: {
  className?: string;
}): JSX.Element | null {
  const t = useT(nsTcgLive);
  const state = useTcgLive();

  // Une panne n'affiche rien : ces blocs illustrent, ils ne portent pas la page.
  if (state.status === 'error') return null;
  if (state.status === 'loading') {
    return (
      <div className={className} role="status" aria-live="polite">
        <span className="sr-only">{t.loading}</span>
        <div aria-hidden className={`${rubanCard} h-48 animate-pulse`} />
      </div>
    );
  }

  const { recentPulls, collectors, cardOfWeek } = state.data;
  return (
    <div className={`space-y-10 ${className}`}>
      <div
        className={
          cardOfWeek
            ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]'
            : 'grid gap-8'
        }
      >
        <RecentPullsSection pulls={recentPulls} />
        <CardOfWeekSection cardOfWeek={cardOfWeek} />
      </div>
      <CollectorsLeaderboard collectors={collectors} />
    </div>
  );
}
