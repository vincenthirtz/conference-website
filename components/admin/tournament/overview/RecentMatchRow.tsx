import { memo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import { matchStatusLabel } from './labels';
import type { Dict, RecentMatch } from './types';

const STATUS_TONE: Partial<Record<MatchStatus, ChipTone>> = {
  ongoing: 'live',
  finished: 'ok',
  cancelled: 'err',
};

type RecentMatchRowProps = {
  match: RecentMatch;
  tx: Dict;
};

/**
 * Single recent-match card (link) in the tournament overview sidebar.
 * Pure/memoized so unrelated page re-renders don't reconcile every match.
 */
function RecentMatchRow({ match, tx }: RecentMatchRowProps) {
  return (
    <Link
      href={`/admin/matches/${match.id}`}
      className="group block rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 transition-colors hover:border-[var(--or,#b467d1)]"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <Chip tone={STATUS_TONE[match.status] ?? 'neutral'}>
          {matchStatusLabel(tx, match.status)}
        </Chip>
        {match.round_number && (
          <span className="text-[10px] text-[var(--t4,#807984)]">
            {format(tx.roundLabel, {
              round: match.round_number,
            })}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        {/* Team 1 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {match.team1?.logo_url ? (
            <Image
              src={match.team1.logo_url}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 rounded-[3px] object-cover"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-[var(--s3,#2f2732)] text-[10px] font-semibold">
              {(match.team1?.name || 'TBD').slice(0, 2).toUpperCase()}
            </div>
          )}
          <span
            className={`text-xs font-medium truncate ${
              match.winner_team_id === match.team1?.id
                ? 'text-[var(--lf,#7fca65)]'
                : 'text-[var(--t2,#c7bfca)]'
            }`}
          >
            {match.team1?.name || 'TBD'}
          </span>
        </div>

        {/* Score */}
        <div
          className="rounded-[3px] bg-[var(--s1,#100812)] px-2 py-0.5 font-mono text-sm font-bold"
          data-numeric
        >
          {typeof match.team1_score === 'number' ||
          typeof match.team2_score === 'number'
            ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
            : 'vs'}
        </div>

        {/* Team 2 */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span
            className={`text-xs font-medium truncate ${
              match.winner_team_id === match.team2?.id
                ? 'text-[var(--lf,#7fca65)]'
                : 'text-[var(--t2,#c7bfca)]'
            }`}
          >
            {match.team2?.name || 'TBD'}
          </span>
          {match.team2?.logo_url ? (
            <Image
              src={match.team2.logo_url}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 rounded-[3px] object-cover"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-[var(--s3,#2f2732)] text-[10px] font-semibold">
              {(match.team2?.name || 'TBD').slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default memo(RecentMatchRow);
