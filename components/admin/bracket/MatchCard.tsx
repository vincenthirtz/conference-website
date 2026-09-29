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
import nsAdminBracketMatchCard from '@/lib/i18n/locales/admin-fr/adminBracketMatchCard';
import Chip from '@/features/admin/_shared/ui/Chip';
import { MATCH_STATUS_TONE } from './statusTone';

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
  const t = useAdminT(nsAdminBracketMatchCard);
  const info = parseNotes(match.notes);
  const statusCfg = STATUS_CONFIG[match.status];
  const isEditing = editingDateId === match.id;
  const isTBD = info && info.seed1 === null;

  return (
    <div
      className={`group relative rounded-[var(--r-card,14px)] border transition-all duration-200 hover:border-[var(--or,#b467d1)] ${
        isTBD
          ? 'border-dashed border-[rgba(180,103,209,.4)] bg-[var(--s1,#100812)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]'
      }`}
    >
      {/* Top bar: time + status + format */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {match.scheduled_at && (
            <button
              type="button"
              onClick={() => onEditDate(isEditing ? null : match.id)}
              className="font-mono text-sm font-bold text-[var(--t1,#f4edf7)] transition-colors hover:text-[var(--or-300,#dea3f6)]"
              title={t.editTime}
            >
              {formatTime(match.scheduled_at)}
            </button>
          )}
          {match.match_format && <Chip>{match.match_format}</Chip>}
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={MATCH_STATUS_TONE[match.status] ?? 'neutral'}>
            {statusCfg.label}
          </Chip>
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
            className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2.5 py-1.5 text-xs text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
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
            <div className="h-px flex-1 bg-[var(--line,rgba(194,196,201,.12))]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--t4,#807984)]">
              vs
            </span>
            <div className="h-px flex-1 bg-[var(--line,rgba(194,196,201,.12))]" />
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
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[var(--t4,#807984)]">
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
