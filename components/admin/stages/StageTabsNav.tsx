import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { StageType } from '@/types/admin';

/**
 * Stable identifiers for the stage sub-screen tabs. Each maps to a real route
 * under `/admin/stages/[stageId]/*` (or the stage root for `overview`).
 */
export type StageTabId =
  | 'overview'
  | 'teams'
  | 'seeding'
  | 'groups'
  | 'swiss'
  | 'history';

/** Absolute href (relative to `/admin/stages/[stageId]`) for a stage tab. */
export function stageTabHref(stageId: string, id: StageTabId) {
  if (id === 'overview') return `/admin/stages/${stageId}`;
  return `/admin/stages/${stageId}/${id}`;
}

/** Ordered tabs with the i18n key of their label. */
const TAB_ORDER: { id: StageTabId; labelKey: string }[] = [
  { id: 'overview', labelKey: 'tabOverview' },
  { id: 'teams', labelKey: 'tabTeams' },
  { id: 'seeding', labelKey: 'tabSeeding' },
  { id: 'groups', labelKey: 'tabGroups' },
  { id: 'swiss', labelKey: 'tabSwiss' },
  { id: 'history', labelKey: 'tabHistory' },
];

/**
 * Format-aware visibility. `groups` only makes sense for group / round-robin
 * stages, `swiss` only for swiss stages. When the stage format is not (yet)
 * known — e.g. the sub-screen hasn't finished loading the stage, or simply
 * doesn't fetch it — we fall back to showing the tab rather than hiding it, so
 * navigation is never lost. The tab of the current sub-screen is always shown.
 */
function isTabVisible(
  id: StageTabId,
  active: StageTabId,
  stageType: StageType | null | undefined
): boolean {
  if (id === active) return true;
  if (id === 'groups') {
    if (stageType == null) return true;
    return stageType === 'group' || stageType === 'round_robin';
  }
  if (id === 'swiss') {
    if (stageType == null) return true;
    return stageType === 'swiss';
  }
  return true;
}

type Props = {
  stageId: string;
  active: StageTabId;
  /**
   * Stage format, used to hide the tabs that don't apply (see
   * {@link isTabVisible}). Pass `null`/omit while the format is unknown — every
   * tab then stays reachable.
   */
  stageType?: StageType | null;
  /** Parent tournament, used for the "back" link. */
  tournamentId?: string | null;
  tournamentName?: string | null;
  className?: string;
};

/**
 * Shared contextual tab bar rendered at the top of every
 * `/admin/stages/[stageId]/*` sub-screen — the stage-scoped counterpart of
 * {@link import('../tournament/TournamentTabsNav').default}. Cross-page
 * navigation: each tab is a real `<Link>` and the active one carries
 * `aria-current="page"`.
 */
export default function StageTabsNav({
  stageId,
  active,
  stageType,
  tournamentId,
  tournamentName,
  className = '',
}: Props) {
  const t = useAdminT('adminStageNav');
  const tx = t as Record<string, string>;

  const backHref = tournamentId
    ? `/admin/tournament/${tournamentId}`
    : '/admin/tournaments';
  const backLabel = tournamentId
    ? `← ${tournamentName || t.backTournamentFallback}`
    : t.backTournaments;

  return (
    <nav
      aria-label={t.ariaLabel}
      className={`mb-6 flex flex-col gap-3 ${className}`}
    >
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 text-sm text-neutral-400 hover:text-white"
      >
        {backLabel}
      </Link>
      <div className="flex flex-wrap gap-1 border-b border-neutral-700/60">
        {TAB_ORDER.filter(({ id }) => isTabVisible(id, active, stageType)).map(
          ({ id, labelKey }) => {
            const selected = id === active;
            return (
              <Link
                key={id}
                href={stageTabHref(stageId, id)}
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
          }
        )}
      </div>
    </nav>
  );
}
