import { memo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from '@/lib/i18n/useAdminT';
import { matchStatusColor, matchStatusLabel } from './labels';
import type { Dict, RecentMatch } from './types';

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
      className="block bg-neutral-900/50 hover:bg-neutral-900 rounded-xl p-3 transition-colors group"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${matchStatusColor(
            match.status
          )}`}
        >
          {matchStatusLabel(tx, match.status)}
        </span>
        {match.round_number && (
          <span className="text-[10px] text-neutral-500">
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
              className="w-6 h-6 rounded object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded bg-neutral-700 flex items-center justify-center text-[10px] font-semibold">
              {(match.team1?.name || 'TBD').slice(0, 2).toUpperCase()}
            </div>
          )}
          <span
            className={`text-xs font-medium truncate ${
              match.winner_team_id === match.team1?.id
                ? 'text-emerald-400'
                : 'text-neutral-300'
            }`}
          >
            {match.team1?.name || 'TBD'}
          </span>
        </div>

        {/* Score */}
        <div className="text-sm font-bold px-2 py-0.5 bg-neutral-800 rounded">
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
                ? 'text-emerald-400'
                : 'text-neutral-300'
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
              className="w-6 h-6 rounded object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded bg-neutral-700 flex items-center justify-center text-[10px] font-semibold">
              {(match.team2?.name || 'TBD').slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default memo(RecentMatchRow);
