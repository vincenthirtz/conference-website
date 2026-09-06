import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentNav from '@/lib/i18n/locales/admin-fr/adminTournamentNav';

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
  | 'schedule'
  | 'stages'
  | 'stats'
  | 'maps'
  | 'discord'
  | 'prize-pool'
  | 'history'
  | 'edit'
  | 'tools'
  | 'bulk-ops';

/** Primary route slug (relative to `/admin/tournament/[id]/`) for each tab. */
const TAB_ROUTE: Record<TournamentTabId, string> = {
  dashboard: 'dashboard',
  checkin: 'checkin',
  bracket: 'bracket',
  matches: 'matches',
  schedule: 'schedule',
  stages: 'stages',
  stats: 'stats',
  maps: 'maps',
  discord: 'discord',
  'prize-pool': 'prize-pool',
  history: 'history',
  edit: 'edit',
  tools: 'tools',
  'bulk-ops': 'bulk-ops',
};

type TabDef = { id: TournamentTabId; labelKey: string };

/**
 * Live-ops tabs shown inline — the handful an organiser touches constantly
 * during an event. The long tail (config, integrations, utilities) lives in the
 * "Plus" overflow menu below to keep the bar from wrapping.
 */
const CORE_TABS: TabDef[] = [
  { id: 'dashboard', labelKey: 'tabDashboard' },
  { id: 'checkin', labelKey: 'tabCheckin' },
  { id: 'bracket', labelKey: 'tabBracket' },
  { id: 'matches', labelKey: 'tabMatches' },
  { id: 'schedule', labelKey: 'tabSchedule' },
  { id: 'stages', labelKey: 'tabStages' },
  { id: 'stats', labelKey: 'tabStats' },
];

/** Secondary tabs, collapsed into the "Plus" dropdown. */
const MORE_TABS: TabDef[] = [
  { id: 'maps', labelKey: 'tabMaps' },
  { id: 'prize-pool', labelKey: 'tabPrizePool' },
  { id: 'discord', labelKey: 'tabDiscord' },
  { id: 'history', labelKey: 'tabHistory' },
  { id: 'edit', labelKey: 'tabEdit' },
  { id: 'tools', labelKey: 'tabTools' },
  { id: 'bulk-ops', labelKey: 'tabBulkOps' },
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

/** Shared tab styling (mirrors the inline-tab look for the overflow trigger). */
function tabClassName(selected: boolean) {
  return `-mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
    selected
      ? 'border-b-2 border-purple-500 text-white'
      : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-200'
  }`;
}

/**
 * Shared contextual tab bar rendered at the top of every
 * `/admin/tournament/[id]/*` sub-screen. Unlike the in-page `Tabs` component
 * (WAI-ARIA tablist for on-page panels), this is cross-page navigation: each
 * tab is a real `<Link>` and the active one carries `aria-current="page"`.
 *
 * Six live-ops tabs are shown inline; the rest are collapsed into a "Plus"
 * dropdown. When the active screen lives in that dropdown, the trigger itself
 * lights up (and shows the active label) so the user keeps their bearings.
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
  const t = useAdminT(nsAdminTournamentNav);
  const tx = t as Record<string, string>;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const activeMoreTab = MORE_TABS.find((tab) => tab.id === active);
  const activeInMore = !!activeMoreTab;

  // Close the overflow menu on outside-click or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  return (
    <nav
      aria-label={t.ariaLabel}
      className={`mb-6 flex flex-col gap-3 ${className}`}
    >
      {/* "Up one level": from the dashboard (tournament root) → tournaments
          list; from any sub-tab → the tournament dashboard. */}
      <Link
        href={
          active === 'dashboard'
            ? '/admin/tournaments'
            : `/admin/tournament/${tournamentId}/dashboard`
        }
        className="inline-flex w-fit items-center gap-2 text-sm text-neutral-400 hover:text-white"
      >
        {active === 'dashboard' ? tx.backToList : t.back}
      </Link>
      <div className="flex flex-wrap items-end gap-1 border-b border-neutral-700/60">
        {CORE_TABS.map(({ id, labelKey }) => {
          const selected = id === active;
          return (
            <Link
              key={id}
              href={tournamentTabHref(tournamentId, id)}
              aria-current={selected ? 'page' : undefined}
              className={tabClassName(selected)}
            >
              {tx[labelKey]}
            </Link>
          );
        })}

        {/* Overflow "Plus" menu — collapses the secondary tabs. */}
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-current={activeInMore ? 'page' : undefined}
            onClick={() => setMoreOpen((v) => !v)}
            className={`${tabClassName(activeInMore)} inline-flex items-center gap-1.5`}
          >
            {activeMoreTab
              ? `${tx.tabMore} · ${tx[activeMoreTab.labelKey]}`
              : tx.tabMore}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${
                moreOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
            >
              {MORE_TABS.map(({ id, labelKey }) => {
                const selected = id === active;
                return (
                  <Link
                    key={id}
                    href={tournamentTabHref(tournamentId, id)}
                    role="menuitem"
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      selected
                        ? 'bg-purple-600/20 text-white'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    {tx[labelKey]}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
