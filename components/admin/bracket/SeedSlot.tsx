// components/admin/bracket/SeedSlot.tsx
// Seed / Team slot component for bracket match cards

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type {
  ScheduleMatch,
  TeamMini,
  TournamentTeam,
  DragPayload,
} from './types';
import nsAdminBracketSeedSlot from '@/lib/i18n/locales/admin-fr/adminBracketSeedSlot';

type SeedSlotProps = {
  match: ScheduleMatch;
  slot: 1 | 2;
  seed: string | null;
  team: TeamMini | null | undefined;
  teamId: string | null;
  isWinner: boolean;
  isTBD: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, p: DragPayload) => void;
  onDragOverSlot: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnSlot: (
    e: React.DragEvent<HTMLDivElement>,
    id: string,
    slot: 1 | 2
  ) => void;
  onClear: () => void;
  availableTeams: TournamentTeam[];
  onAssignTeam: (team: TournamentTeam) => void;
};

export default function SeedSlot({
  match,
  slot,
  seed,
  team,
  teamId,
  isWinner,
  isTBD,
  onDragStart,
  onDragOverSlot,
  onDropOnSlot,
  onClear,
  availableTeams,
  onAssignTeam,
}: SeedSlotProps) {
  const t = useAdminT(nsAdminBracketSeedSlot);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const hasTeam = !!(team || teamId);

  const canPick = !hasTeam && availableTeams.length > 0;

  const filteredPickerTeams = availableTeams.filter((t) =>
    t.team.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  // Close picker on click outside
  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setPickerSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPicker]);

  return (
    <div
      ref={pickerRef}
      className={`relative flex items-center gap-3 rounded-[var(--r-ctrl,4px)] px-3 py-2 transition-colors ${
        hasTeam
          ? 'border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] hover:border-[var(--line2,rgba(194,196,201,.2))]'
          : isTBD
            ? 'border border-dashed border-[rgba(180,103,209,.35)] bg-[var(--s2,#1d1520)]'
            : 'border border-dashed border-[var(--line2,rgba(194,196,201,.2))]'
      } ${isWinner ? 'ring-1 ring-[rgba(127,202,101,.45)]' : ''} ${canPick && !showPicker ? 'cursor-pointer hover:border-[var(--or,#b467d1)]' : ''}`}
      onDragOver={onDragOverSlot}
      onDrop={(e) => onDropOnSlot(e, match.id, slot)}
      onClick={() => {
        if (canPick && !showPicker) {
          setShowPicker(true);
          setPickerSearch('');
        }
      }}
    >
      <div
        className={`flex items-center gap-3 flex-1 ${hasTeam ? 'cursor-move' : ''}`}
        draggable={hasTeam}
        onDragStart={(e) =>
          hasTeam && onDragStart(e, { matchId: match.id, slot })
        }
      >
        {/* Seed badge */}
        {seed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s3,#2f2732)] font-[family-name:var(--fd)] text-sm font-extrabold text-[var(--t1,#f4edf7)]">
            {seed}
          </div>
        )}

        {/* TBD badge */}
        {!seed && isTBD && (
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.12)] text-[10px] font-bold text-[var(--or-200,#eec4ff)]">
            ?
          </div>
        )}

        {/* Empty badge */}
        {!seed && !isTBD && (
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] text-[10px] text-[var(--t4,#807984)]">
            —
          </div>
        )}

        {/* Team info or seed label */}
        <div className="flex flex-col min-w-0">
          {team ? (
            <div className="flex items-center gap-2">
              {team.logo_url && (
                <Image
                  src={team.logo_url}
                  alt={team.name}
                  width={20}
                  height={20}
                  className="w-5 h-5 rounded object-cover"
                />
              )}
              <span
                className={`text-sm font-semibold truncate ${
                  isWinner
                    ? 'text-[var(--lf-200,#b3e7a3)]'
                    : 'text-[var(--t1,#f4edf7)]'
                }`}
              >
                {team.name}
              </span>
            </div>
          ) : isTBD ? (
            <span className="text-sm font-medium italic text-[var(--or-300,#dea3f6)]">
              {t.available}
            </span>
          ) : seed ? (
            <span className="text-sm font-semibold text-[var(--t2,#c7bfca)]">
              Seed {seed}
            </span>
          ) : (
            <span className="text-xs italic text-[var(--t4,#807984)]">
              {t.emptySlot}
            </span>
          )}
          {teamId && !team && (
            <span className="truncate font-mono text-[10px] text-[var(--t4,#807984)]">
              {teamId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Assign hint */}
      {canPick && !showPicker && (
        <div className="shrink-0 text-[10px] text-[var(--or-300,#dea3f6)]">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
      )}

      {/* Winner indicator */}
      {isWinner && (
        <div className="text-xs font-bold text-[var(--lf,#7fca65)]">W</div>
      )}

      {/* Clear button */}
      {hasTeam && (
        <button
          type="button"
          onClick={onClear}
          className="p-0.5 text-[var(--t4,#807984)] opacity-0 transition-all hover:text-[var(--err,#ff6b6b)] group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8m0-8L4 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {/* Team picker dropdown */}
      {showPicker && (
        <div
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2">
            <input
              type="text"
              autoFocus
              placeholder={t.searchPlaceholder}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2.5 py-1.5 text-xs text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredPickerTeams.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[var(--t4,#807984)]">
                {t.noTeams}
              </div>
            ) : (
              filteredPickerTeams.map((t) => (
                <button
                  key={t.team_id}
                  type="button"
                  data-case="normal"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[rgba(180,103,209,.12)]"
                  onClick={() => {
                    onAssignTeam(t);
                    setShowPicker(false);
                    setPickerSearch('');
                  }}
                >
                  {t.team.logo_url && (
                    <Image
                      src={t.team.logo_url}
                      alt={t.team.name}
                      width={20}
                      height={20}
                      className="w-5 h-5 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <span className="truncate text-sm text-[var(--t1,#f4edf7)]">
                    {t.team.name}
                  </span>
                  {t.seed != null && (
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--t4,#807984)]">
                      Seed {t.seed}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
