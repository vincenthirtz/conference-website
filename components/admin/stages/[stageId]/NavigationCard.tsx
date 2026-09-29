// components/admin/stages/[stageId]/NavigationCard.tsx
import React, { type ReactNode } from 'react';
import Link from 'next/link';
import type { Stage, Tournament } from '@/types/admin';
import {
  rubanCardPadded,
  rubanCardTitle,
  rubanMuted,
  rubanRowIcon,
  rubanRowLink,
} from '@/features/admin/_shared/ui/ruban';
import type { Dict } from './stageDisplay';

type Props = {
  stage: Stage;
  tournament: Tournament | null;
  matchesUrl: string | null;
  tournamentDashboardUrl: string;
  t: Dict;
};

const ICON: Record<string, string> = {
  matches:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  groups:
    'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  swiss:
    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  teams:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  tournament:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
};

function NavRow({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: ReactNode;
  desc: ReactNode;
}) {
  return (
    <Link href={href} className={rubanRowLink}>
      <div className="flex items-center gap-3">
        <div className={rubanRowIcon}>
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={icon}
            />
          </svg>
        </div>
        <div>
          <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
            {title}
          </div>
          <div className={`text-xs ${rubanMuted}`}>{desc}</div>
        </div>
      </div>
      <span
        aria-hidden
        className="text-[var(--t4,#807984)] transition-colors group-hover:text-[var(--or-200,#eec4ff)]"
      >
        →
      </span>
    </Link>
  );
}

/** Carte de navigation (matches, groupes, swiss, équipes, tournoi). */
function NavigationCard({
  stage,
  tournament,
  matchesUrl,
  tournamentDashboardUrl,
  t,
}: Props) {
  return (
    <section className={rubanCardPadded}>
      <h2 className={`${rubanCardTitle} mb-4`}>{t.navTitle}</h2>
      <div className="space-y-2">
        {matchesUrl && (
          <NavRow
            href={matchesUrl}
            icon={ICON.matches}
            title={t.navMatches}
            desc={t.navMatchesDesc}
          />
        )}
        {(stage.stage_type === 'group' ||
          stage.stage_type === 'round_robin') && (
          <NavRow
            href={`/admin/stages/${stage.id}/groups`}
            icon={ICON.groups}
            title={t.navGroups}
            desc={t.navGroupsDesc}
          />
        )}
        {stage.stage_type === 'swiss' && (
          <NavRow
            href={`/admin/stages/${stage.id}/swiss`}
            icon={ICON.swiss}
            title={t.navSwiss}
            desc={t.navSwissDesc}
          />
        )}
        <NavRow
          href={`/admin/stages/${stage.id}/teams`}
          icon={ICON.teams}
          title={t.navTeams}
          desc={t.navTeamsDesc}
        />
        <NavRow
          href={tournamentDashboardUrl}
          icon={ICON.tournament}
          title={t.navTournament}
          desc={tournament?.name || t.navTournamentFallback}
        />
      </div>
    </section>
  );
}

export default React.memo(NavigationCard);
