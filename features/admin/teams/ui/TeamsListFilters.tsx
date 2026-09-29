// features/admin/teams/ui/TeamsListFilters.tsx — la ligne de filtres de la
// liste des équipes : recherche (soumise par formulaire, synchronisée à l'URL
// par la page), statut et tournoi.
//
// La recherche reste un `<input type="text">` dans un `<form>` : l'e2e
// admin-diagnostic la vise par `input[type="text"]` et la soumet par Entrée —
// d'où ce champ plutôt que `ListSearch` (type="search", sans formulaire).

import type { FormEvent } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import ListToolbar, {
  FilterSelect,
} from '@/features/admin/_shared/ui/ListToolbar';

export default function TeamsListFilters({
  searchInput,
  onSearchInputChange,
  onSubmit,
  activeFilter,
  onActiveFilterChange,
  tournamentFilter,
  onTournamentFilterChange,
  tournamentOptions,
  onTournamentFocus,
}: {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  activeFilter: string;
  onActiveFilterChange: (value: string | null) => void;
  tournamentFilter: string;
  onTournamentFilterChange: (value: string | null) => void;
  tournamentOptions: { id: string; name: string }[];
  /** Chargement paresseux des tournois au premier focus du sélecteur. */
  onTournamentFocus: () => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <form onSubmit={onSubmit}>
      <ListToolbar
        search={
          <div className="flex h-[38px] w-full items-center gap-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 sm:w-[280px]">
            <svg
              aria-hidden
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              className="shrink-0 text-[var(--t4,#807984)]"
            >
              <circle
                cx="9"
                cy="9"
                r="5.5"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="m13.2 13.2 3.3 3.3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              aria-label={t.searchPlaceholder}
              placeholder={t.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--t1,#f4edf7)] outline-none placeholder:text-[var(--t4,#807984)]"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
            />
          </div>
        }
        filters={
          <>
            <FilterSelect
              label={t.statusLabel}
              allLabel={t.statusAll}
              value={activeFilter}
              onChange={onActiveFilterChange}
              options={[
                { value: 'true', label: t.statusActive },
                { value: 'false', label: t.statusInactive },
              ]}
            />
            {/* onFocus remonte depuis le <select> de FilterSelect (React
                délègue le focus en bulle) : chargement au premier usage. */}
            <span className="contents" onFocus={onTournamentFocus}>
              <FilterSelect
                label={t.tournamentLabel}
                allLabel={t.allTournaments}
                value={tournamentFilter}
                onChange={onTournamentFilterChange}
                options={tournamentOptions.map((tour) => ({
                  value: tour.id,
                  label: tour.name,
                }))}
              />
            </span>
            <AdminButton type="submit" variant="ghost" size="sm">
              {t.search}
            </AdminButton>
          </>
        }
      />
    </form>
  );
}
