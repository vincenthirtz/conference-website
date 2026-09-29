import React from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { SearchResult } from './types';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import Chip from '@/features/admin/_shared/ui/Chip';

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
  const t = useAdminT(nsAdminTeamsMy);

  return (
    <div className="space-y-2">
      {searchLoading && (
        <div className="flex items-center gap-2 text-[var(--t3,#a39ba6)] text-sm py-4">
          <div className="w-4 h-4 border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)] rounded-full animate-spin" />
          {t.searching}
        </div>
      )}
      {!searchLoading && searchQuery.length >= 2 && results.length === 0 && (
        <div className="text-[var(--t3,#a39ba6)] text-sm py-4 text-center">
          {t.noResult}
        </div>
      )}
      {results.map((player) => (
        <button
          key={player.id}
          onClick={() => onSelect(player)}
          disabled={player.has_team}
          className={`w-full text-left p-3 rounded-[var(--r-ctrl,4px)] border transition-colors ${
            player.has_team
              ? 'bg-[var(--s1,#100812)] border-[var(--line,rgba(194,196,201,.12))] opacity-50 cursor-not-allowed'
              : 'bg-[var(--s2,#1d1520)] border-[var(--line,rgba(194,196,201,.12))] hover:border-[var(--or,#b467d1)] hover:bg-[var(--s3,#2f2732)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-[var(--t1,#f4edf7)]">
                {player.display_name || player.email || t.userFallback}
              </div>
              {player.email && player.display_name && (
                <div className="text-xs text-[var(--t3,#a39ba6)]">
                  {player.email}
                </div>
              )}
              {player.battle_tag && (
                <div className="font-mono text-xs text-[var(--t2,#c7bfca)]">
                  {player.battle_tag}
                </div>
              )}
            </div>
            {player.has_team && <Chip tone="err">{t.alreadyInTeam}</Chip>}
          </div>
        </button>
      ))}
    </div>
  );
}

export const PlayerSearchResults = React.memo(PlayerSearchResultsInner);
