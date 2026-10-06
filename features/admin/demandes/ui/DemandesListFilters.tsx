// features/admin/demandes/ui/DemandesListFilters.tsx — la ligne de filtres de
// la liste des demandes : type, statut, tournoi, recherche, période, tri.
//
// Présentationnelle : chaque changement remonte à la page, qui pousse la
// nouvelle requête dans l'URL (rechargement SSR complet).
//
// La recherche reste un `<input type="text">` dans un `<form>` soumis par
// « Rechercher » : l'e2e admin-demandes la vise par son placeholder et clique
// le bouton par son nom exact — d'où ce champ plutôt que `ListSearch`.

import type { FormEvent } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import ListToolbar, {
  FilterSelect,
} from '@/features/admin/_shared/ui/ListToolbar';
import type { TournamentMini } from '@/features/admin/demandes/listModel';

const FIELD =
  'h-[38px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-[13px] text-[var(--t1,#f4edf7)] outline-none [color-scheme:dark] focus:border-[var(--or,#b467d1)]';
const INLINE_LABEL =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

export default function DemandesListFilters({
  typeFilter,
  statusFilter,
  tournamentFilter,
  tournaments,
  searchInput,
  onSearchInputChange,
  dateFrom,
  dateTo,
  assignedFilter,
  sortValue,
  hasActiveFilters,
  onFilterChange,
  onSortChange,
  onSubmit,
  onReset,
}: {
  typeFilter: string;
  statusFilter: string;
  tournamentFilter: string;
  tournaments: TournamentMini[];
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  /** `me` / `unassigned` / '' ; `null` = assignation indisponible (masqué). */
  assignedFilter: string | null;
  /** `${orderBy}:${orderDir}` */
  sortValue: string;
  hasActiveFilters: boolean;
  /** Un filtre de l'URL ; `null` le retire. */
  onFilterChange: (
    key: 'type' | 'status' | 'tournamentId' | 'from' | 'to' | 'assigned',
    value: string | null
  ) => void;
  onSortChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onReset: () => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
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
              label={t.filterType}
              allLabel={t.typeAll}
              value={typeFilter}
              onChange={(v) => onFilterChange('type', v)}
              options={[
                { value: 'captain_request', label: t.typeCaptainRequest },
                { value: 'join', label: t.typeJoin },
                { value: 'leave', label: t.typeLeave },
                { value: 'team_registration', label: t.typeTeamRegistration },
                { value: 'scrim', label: t.typeScrim },
                { value: 'other', label: t.typeOther },
              ]}
            />
            <FilterSelect
              label={t.filterStatus}
              allLabel={t.statusAll}
              value={statusFilter}
              onChange={(v) => onFilterChange('status', v)}
              options={[
                { value: 'pending', label: t.statusPending },
                { value: 'approved', label: t.statusApproved },
                { value: 'rejected', label: t.statusRejected },
                { value: 'cancelled', label: t.statusCancelled },
              ]}
            />
            <FilterSelect
              label={t.filterTournament}
              allLabel={t.tournamentAll}
              value={tournamentFilter}
              onChange={(v) => onFilterChange('tournamentId', v)}
              options={tournaments.map((tour) => ({
                value: tour.id,
                label: `${tour.name}${tour.slug ? ` (${tour.slug})` : ''}`,
              }))}
            />
            {assignedFilter !== null && (
              <FilterSelect
                label={t.filterAssigned}
                allLabel={t.assignedAll}
                value={assignedFilter}
                onChange={(v) => onFilterChange('assigned', v)}
                options={[
                  { value: 'me', label: t.assignedMe },
                  { value: 'unassigned', label: t.assignedNone },
                ]}
              />
            )}
            <label className="inline-flex items-center gap-2">
              <span className={INLINE_LABEL}>{t.filterFrom}</span>
              <input
                type="date"
                className={FIELD}
                value={dateFrom}
                onChange={(e) => onFilterChange('from', e.target.value || null)}
              />
            </label>
            <label className="inline-flex items-center gap-2">
              <span className={INLINE_LABEL}>{t.filterTo}</span>
              <input
                type="date"
                className={FIELD}
                value={dateTo}
                onChange={(e) => onFilterChange('to', e.target.value || null)}
              />
            </label>
            <label className="inline-flex items-center gap-2">
              <span className={INLINE_LABEL}>{t.filterSort}</span>
              <select
                className={FIELD}
                value={sortValue}
                onChange={(e) => onSortChange(e.target.value)}
              >
                <option value="created_at:desc">{t.sortDateRecent}</option>
                <option value="created_at:asc">{t.sortDateOld}</option>
                <option value="processed_at:desc">
                  {t.sortProcessedRecent}
                </option>
                <option value="processed_at:asc">{t.sortProcessedOld}</option>
              </select>
            </label>
            <AdminButton type="submit" variant="ghost" size="sm">
              {t.searchBtn}
            </AdminButton>
            {hasActiveFilters && (
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={onReset}
                title={t.resetFiltersTitle}
              >
                {t.reset}
              </AdminButton>
            )}
          </>
        }
      />
    </form>
  );
}
