import { memo } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { Conflict, Dict } from './types';

type ConflictRowProps = {
  conflict: Conflict;
  tx: Dict;
};

/**
 * Single schedule-conflict card in the conflicts report modal.
 * Pure/memoized presentational row.
 */
function ConflictRow({ conflict: c, tx }: ConflictRowProps) {
  return (
    <div className="bg-neutral-900/70 border border-red-500/20 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-500/30">
          {format(tx.overlapLabel, { minutes: c.overlap_minutes })}
        </span>
        <span className="font-medium text-white">{c.team_name}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-neutral-800/50 rounded-lg p-2.5">
          <div className="text-neutral-500 mb-1">{tx.matchA}</div>
          <div className="text-neutral-300">
            {c.match_a.stage_name && <span>{c.match_a.stage_name} · </span>}
            {c.match_a.round_number && (
              <span>
                {format(tx.roundLabel, {
                  round: c.match_a.round_number,
                })}
              </span>
            )}
          </div>
          <div className="text-neutral-400 mt-1">
            {new Date(c.match_a.scheduled_at).toLocaleString('fr-FR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
            {' → '}
            {new Date(c.match_a.estimated_end).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-2.5">
          <div className="text-neutral-500 mb-1">{tx.matchB}</div>
          <div className="text-neutral-300">
            {c.match_b.stage_name && <span>{c.match_b.stage_name} · </span>}
            {c.match_b.round_number && (
              <span>
                {format(tx.roundLabel, {
                  round: c.match_b.round_number,
                })}
              </span>
            )}
          </div>
          <div className="text-neutral-400 mt-1">
            {new Date(c.match_b.scheduled_at).toLocaleString('fr-FR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
            {' → '}
            {new Date(c.match_b.estimated_end).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ConflictRow);
