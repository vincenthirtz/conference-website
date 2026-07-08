import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';

/**
 * Stable identifiers for the top-level tournament tabs. Several legacy
 * sub-screens share a single tab (e.g. bracket / bracket-builder / map-draw /
 * veto all live under `bracket`); the sub-screen decides which tab is active by
 * passing the matching id to {@link TournamentTabsNav}.
 */
export type TournamentTabId =
  | 'dashboard'
  | 'checkin'
  | 'bracket'
  | 'matches'
  | 'stages'
  | 'stats'
  | 'maps'
  | 'discord'
  | 'history'
  | 'edit'
  | 'tools';

/** Primary route slug (relative to `/admin/tournament/[id]/`) for each tab. */
const TAB_ROUTE: Record<TournamentTabId, string> = {
  dashboard: 'dashboard',
  checkin: 'checkin',
  bracket: 'bracket',
  matches: 'matches',
  stages: 'stages',
  stats: 'stats',
  maps: 'maps',
  discord: 'discord',
  history: 'history',
  edit: 'edit',
  tools: 'bulk-ops',
};

/** Ordered tabs with the i18n key of their label. */
const TAB_ORDER: { id: TournamentTabId; labelKey: string }[] = [
  { id: 'dashboard', labelKey: 'tabDashboard' },
  { id: 'checkin', labelKey: 'tabCheckin' },
  { id: 'bracket', labelKey: 'tabBracket' },
  { id: 'matches', labelKey: 'tabMatches' },
  { id: 'stages', labelKey: 'tabStages' },
  { id: 'stats', labelKey: 'tabStats' },
  { id: 'maps', labelKey: 'tabMaps' },
  { id: 'discord', labelKey: 'tabDiscord' },
  { id: 'history', labelKey: 'tabHistory' },
  { id: 'edit', labelKey: 'tabEdit' },
  { id: 'tools', labelKey: 'tabTools' },
];

/** Absolute href for a tournament tab. */
export function tournamentTabHref(tournamentId: string, id: TournamentTabId) {
  return `/admin/tournament/${tournamentId}/${TAB_ROUTE[id]}`;
}

type Props = {
  tournamentId: string;
  active: TournamentTabId;
  className?: string;
};

/**
 * Shared contextual tab bar rendered at the top of every
 * `/admin/tournament/[id]/*` sub-screen. Unlike the in-page `Tabs` component
 * (WAI-ARIA tablist for on-page panels), this is cross-page navigation: each
 * tab is a real `<Link>` and the active one carries `aria-current="page"`.
 *
 * Sub-screens that share a tab (bracket-builder, map-draw, veto → `bracket`;
 * analytics, podium → `stats`; checkin/live → `checkin`) pass the parent tab id
 * as `active` so the correct tab lights up.
 */
export default function TournamentTabsNav({
  tournamentId,
  active,
  className = '',
}: Props) {
  const t = useAdminT('adminTournamentNav');
  const tx = t as Record<string, string>;

  return (
    <nav
      aria-label={t.ariaLabel}
      className={`mb-6 flex flex-col gap-3 ${className}`}
    >
      <Link
        href={`/admin/tournament/${tournamentId}`}
        className="inline-flex w-fit items-center gap-2 text-sm text-neutral-400 hover:text-white"
      >
        {t.back}
      </Link>
      <div className="flex flex-wrap gap-1 border-b border-neutral-700/60">
        {TAB_ORDER.map(({ id, labelKey }) => {
          const selected = id === active;
          return (
            <Link
              key={id}
              href={tournamentTabHref(tournamentId, id)}
              aria-current={selected ? 'page' : undefined}
              className={`-mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                selected
                  ? 'border-b-2 border-purple-500 text-white'
                  : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tx[labelKey]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
