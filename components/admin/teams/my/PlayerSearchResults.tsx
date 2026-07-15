import React from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { SearchResult } from './types';

type PlayerSearchResultsProps = {
  results: SearchResult[];
  searchLoading: boolean;
  searchQuery: string;
  onSelect: (player: SearchResult) => void;
};

function PlayerSearchResultsInner({
  results,
  searchLoading,
  searchQuery,
  onSelect,
}: PlayerSearchResultsProps) {
  const t = useAdminT('adminTeamsMy');

  return (
    <div className="space-y-2">
      {searchLoading && (
        <div className="flex items-center gap-2 text-neutral-400 text-sm py-4">
          <div className="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          {t.searching}
        </div>
      )}
      {!searchLoading && searchQuery.length >= 2 && results.length === 0 && (
        <div className="text-neutral-400 text-sm py-4 text-center">
          {t.noResult}
        </div>
      )}
      {results.map((player) => (
        <button
          key={player.id}
          onClick={() => onSelect(player)}
          disabled={player.has_team}
          className={`w-full text-left p-3 rounded-xl border transition-colors ${
            player.has_team
              ? 'bg-neutral-900/30 border-neutral-700 opacity-50 cursor-not-allowed'
              : 'bg-neutral-900/50 border-neutral-700/50 hover:border-blue-500/50 hover:bg-neutral-800/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-white">
                {player.display_name || player.email || t.userFallback}
              </div>
              {player.email && player.display_name && (
                <div className="text-xs text-neutral-400">{player.email}</div>
              )}
              {player.battle_tag && (
                <div className="text-xs text-blue-400">{player.battle_tag}</div>
              )}
            </div>
            {player.has_team && (
              <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-lg border border-red-500/30">
                {t.alreadyInTeam}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export const PlayerSearchResults = React.memo(PlayerSearchResultsInner);
