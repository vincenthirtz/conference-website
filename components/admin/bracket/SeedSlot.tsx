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

const SEED_GRADIENT_COLORS: Record<string, string> = {
  '1': 'from-amber-500 to-orange-600',
  '2': 'from-sky-500 to-blue-600',
  '3': 'from-emerald-500 to-green-600',
  '4': 'from-rose-500 to-pink-600',
  '5': 'from-violet-500 to-purple-600',
  '6': 'from-cyan-400 to-teal-600',
  '7': 'from-fuchsia-500 to-pink-600',
  '8': 'from-lime-500 to-emerald-600',
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
  const t = useAdminT('adminBracketSeedSlot');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const hasTeam = !!(team || teamId);

  const gradientClass = seed
    ? SEED_GRADIENT_COLORS[seed] || 'from-neutral-500 to-neutral-600'
    : '';
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
      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        hasTeam
          ? 'bg-white/[0.03] hover:bg-white/[0.06]'
          : isTBD
            ? 'bg-purple-500/5 border border-dashed border-purple-500/20'
            : 'bg-white/[0.02] border border-dashed border-white/[0.06]'
      } ${isWinner ? 'ring-1 ring-emerald-500/30' : ''} ${canPick && !showPicker ? 'cursor-pointer hover:border-purple-500/40' : ''}`}
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
          <div
            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradientClass} flex items-center justify-center text-sm font-extrabold text-white shadow-lg`}
          >
            {seed}
          </div>
        )}

        {/* TBD badge */}
        {!seed && isTBD && (
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold text-purple-300">
            ?
          </div>
        )}

        {/* Empty badge */}
        {!seed && !isTBD && (
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-neutral-600">
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
                  isWinner ? 'text-emerald-300' : 'text-white'
                }`}
              >
                {team.name}
              </span>
            </div>
          ) : isTBD ? (
            <span className="text-sm font-medium text-purple-300/50 italic">
              {t.available}
            </span>
          ) : seed ? (
            <span className="text-sm font-semibold text-white/70">
              Seed {seed}
            </span>
          ) : (
            <span className="text-xs text-neutral-600 italic">
              {t.emptySlot}
            </span>
          )}
          {teamId && !team && (
            <span className="text-[10px] text-neutral-500 font-mono truncate">
              {teamId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Assign hint */}
      {canPick && !showPicker && (
        <div className="text-[10px] text-purple-400/60 flex-shrink-0">
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
      {isWinner && <div className="text-emerald-400 text-xs font-bold">W</div>}

      {/* Clear button */}
      {hasTeam && (
        <button
          type="button"
          onClick={onClear}
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all p-0.5"
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
          className="absolute top-full left-0 right-0 mt-1 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2">
            <input
              type="text"
              autoFocus
              placeholder={t.searchPlaceholder}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-800 border border-neutral-600 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredPickerTeams.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-500 text-center">
                {t.noTeams}
              </div>
            ) : (
              filteredPickerTeams.map((t) => (
                <button
                  key={t.team_id}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-600/20 transition-colors"
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
                  <span className="text-sm text-white truncate">
                    {t.team.name}
                  </span>
                  {t.seed != null && (
                    <span className="ml-auto text-[10px] text-neutral-500 flex-shrink-0">
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
