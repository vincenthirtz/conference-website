// components/admin/bracket/MatchCard.tsx
// Match card for the planning view in bracket-builder

import {
  formatTime,
  isoToLocalInput,
  localInputToIso,
} from '@/utils/dateFormatters';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import { useAdminT } from '@/lib/i18n/useAdminT';
import SeedSlot from './SeedSlot';
import { parseNotes } from './types';
import type { ScheduleMatch, TournamentTeam, DragPayload } from './types';

type MatchCardProps = {
  match: ScheduleMatch;
  editingDateId: string | null;
  onEditDate: (id: string | null) => void;
  onScheduleChange: (id: string, value: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, p: DragPayload) => void;
  onDragOverSlot: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnSlot: (
    e: React.DragEvent<HTMLDivElement>,
    id: string,
    slot: 1 | 2
  ) => void;
  onClearSlot: (id: string, slot: 1 | 2) => void;
  availableTeams: TournamentTeam[];
  onAssignTeam: (matchId: string, slot: 1 | 2, team: TournamentTeam) => void;
};

export default function MatchCard({
  match,
  editingDateId,
  onEditDate,
  onScheduleChange,
  onDragStart,
  onDragOverSlot,
  onDropOnSlot,
  onClearSlot,
  availableTeams,
  onAssignTeam,
}: MatchCardProps) {
  const t = useAdminT('adminBracketMatchCard');
  const info = parseNotes(match.notes);
  const statusCfg = STATUS_CONFIG[match.status];
  const isEditing = editingDateId === match.id;
  const isTBD = info && info.seed1 === null;

  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 hover:border-purple-500/30 ${
        isTBD
          ? 'bg-gradient-to-br from-purple-950/40 to-indigo-950/40 border-purple-500/20'
          : 'bg-[#12121a] border-white/[0.06]'
      }`}
    >
      {/* Top bar: time + status + format */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {match.scheduled_at && (
            <button
              type="button"
              onClick={() => onEditDate(isEditing ? null : match.id)}
              className="text-sm font-bold tabular-nums text-white/90 hover:text-purple-300 transition-colors"
              title={t.editTime}
            >
              {formatTime(match.scheduled_at)}
            </button>
          )}
          {match.match_format && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-white/5 text-neutral-400 border border-white/5">
              {match.match_format}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusCfg.bg}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Inline date editor */}
      {isEditing && (
        <div className="px-4 pb-2">
          <input
            type="datetime-local"
            autoFocus
            defaultValue={isoToLocalInput(match.scheduled_at)}
            onBlur={(e) =>
              onScheduleChange(match.id, localInputToIso(e.target.value))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                onScheduleChange(
                  match.id,
                  localInputToIso((e.target as HTMLInputElement).value)
                );
              if (e.key === 'Escape') onEditDate(null);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        </div>
      )}

      {/* Teams / seeds */}
      <div className="px-4 pb-3">
        <div className="flex flex-col gap-1.5">
          <SeedSlot
            match={match}
            slot={1}
            seed={info?.seed1 ?? null}
            team={match.team1}
            teamId={match.team1_id}
            isWinner={
              !!match.winner_team_id && match.winner_team_id === match.team1_id
            }
            isTBD={!!isTBD}
            onDragStart={onDragStart}
            onDragOverSlot={onDragOverSlot}
            onDropOnSlot={onDropOnSlot}
            onClear={() => onClearSlot(match.id, 1)}
            availableTeams={availableTeams}
            onAssignTeam={(team) => onAssignTeam(match.id, 1, team)}
          />

          {/* VS divider */}
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-px bg-white/[0.04]" />
            <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
              vs
            </span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          <SeedSlot
            match={match}
            slot={2}
            seed={info?.seed2 ?? null}
            team={match.team2}
            teamId={match.team2_id}
            isWinner={
              !!match.winner_team_id && match.winner_team_id === match.team2_id
            }
            isTBD={!!isTBD}
            onDragStart={onDragStart}
            onDragOverSlot={onDragOverSlot}
            onDropOnSlot={onDropOnSlot}
            onClear={() => onClearSlot(match.id, 2)}
            availableTeams={availableTeams}
            onAssignTeam={(team) => onAssignTeam(match.id, 2, team)}
          />
        </div>

        {/* Venue */}
        {info?.venue && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              className="opacity-50"
            >
              <path
                d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5c0-2.5-2-4.5-4.5-4.5z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle
                cx="8"
                cy="6"
                r="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            {info.venue}
          </div>
        )}
      </div>
    </div>
  );
}
