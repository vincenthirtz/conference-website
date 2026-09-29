// features/admin/users/ui/UsersManageFilters.tsx — la ligne de filtres de la
// gestion des inscrits (pages/admin/users/manage.tsx) : recherche, rôle de
// compte, statut annoncé, filtres rapides cumulables. Présentationnelle : les
// valeurs et leurs setters appartiennent à la page (synchronisée à l'URL).
//
// La recherche reste un `<input type="text">` dans un `<form>` (comme
// TeamsListFilters) : l'e2e admin-users la vise par son placeholder. Le filtre
// de rôle reste un `<select>` natif à groupes (<optgroup>) — FilterSelect n'en
// porte pas — habillé à l'identique.

import type { FormEvent } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import ListToolbar from '@/features/admin/_shared/ui/ListToolbar';
import {
  QUICK_FILTERS,
  quickFilterLabel,
  type Dict,
  type QuickFilter,
} from '@/features/admin/users/manageModel';
import { RoleOptionGroups } from './UsersManageRow';

const CAPS =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] [font-stretch:75%]';

export default function UsersManageFilters({
  t,
  search,
  onSearchChange,
  onSubmit,
  roleFilter,
  onRoleFilterChange,
  loading,
  total,
  quickFilters,
  onToggleQuickFilter,
  onClearQuickFilters,
}: {
  t: Dict;
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  roleFilter: string | null;
  onRoleFilterChange: (value: string | null) => void;
  loading: boolean;
  total: number | null;
  quickFilters: QuickFilter[];
  onToggleQuickFilter: (f: QuickFilter) => void;
  onClearQuickFilters: () => void;
}) {
  return (
    <section className="mb-6">
      <form onSubmit={onSubmit}>
        <ListToolbar
          search={
            <div className="flex h-[38px] w-full items-center gap-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 sm:w-[320px]">
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
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          }
          filters={
            <div
              className={`relative inline-flex h-[38px] items-center gap-1.5 rounded-[var(--r-ctrl,4px)] border px-[13px] ${CAPS} ${
                roleFilter
                  ? 'border-[var(--or,#b467d1)] text-[var(--or-200,#eec4ff)]'
                  : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)]'
              }`}
            >
              <label htmlFor="role-filter" className="whitespace-nowrap">
                {t.accountRoleLabel} :
              </label>
              <select
                id="role-filter"
                aria-describedby="role-filter-hint"
                className="cursor-pointer appearance-none bg-transparent pr-3 uppercase outline-none"
                value={roleFilter || ''}
                onChange={(e) => onRoleFilterChange(e.target.value || null)}
              >
                <option value="">{t.allRoles}</option>
                <RoleOptionGroups t={t} />
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-[11px] text-[var(--t4,#807984)]"
              >
                ▾
              </span>
            </div>
          }
          note={
            // Il n'y a pas de bouton « Rechercher » : la saisie est envoyée
            // automatiquement (debounce 300 ms). Cette zone dit ce qui se
            // passe — et l'annonce aux lecteurs d'écran.
            <span role="status" aria-live="polite" data-numeric>
              {loading
                ? t.searchingStatus
                : total !== null
                  ? format(
                      total > 1 ? t.resultsStatus_other : t.resultsStatus_one,
                      { count: total }
                    )
                  : ''}
            </span>
          }
        />
        <p
          id="role-filter-hint"
          className="-mt-2 mb-4 text-xs text-[var(--t4,#807984)]"
        >
          {t.roleFilterHint}
        </p>
        {/* Le tri a migré vers les en-têtes cliquables de la liste. */}
      </form>

      {/* Filtres rapides — cumulables, appliqués côté SQL (donc cohérents
          avec la pagination et le total). « Identité à vérifier » rend
          atteignable le flag anti-smurf battle_tag_mismatch. */}
      <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`mr-1 text-[var(--t3,#a39ba6)] ${CAPS}`}>
            {t.quickFiltersLabel}
          </span>
          {QUICK_FILTERS.map((f) => {
            const active = quickFilters.includes(f);
            const alert = f === 'battletag_mismatch';
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleQuickFilter(f)}
                className={`inline-flex h-[30px] items-center gap-1 rounded-[var(--r-ctrl,4px)] border px-3 text-[12px] font-medium transition-colors focus:outline-none focus-visible:border-[var(--or,#b467d1)] ${
                  active
                    ? alert
                      ? 'border-[rgba(245,165,36,.55)] bg-[rgba(245,165,36,.13)] text-[#ffd9a3]'
                      : 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)]'
                    : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]'
                }`}
              >
                {alert && <span aria-hidden="true">⚠ </span>}
                {quickFilterLabel(t, f)}
              </button>
            );
          })}
          {quickFilters.length > 0 && (
            <button
              type="button"
              onClick={onClearQuickFilters}
              className="h-[30px] px-2 text-[12px] text-[var(--t4,#807984)] underline-offset-2 transition-colors hover:text-[var(--t1,#f4edf7)] hover:underline"
            >
              {t.quickFiltersClear}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--t4,#807984)]">
          {t.quickFiltersHint}
        </p>
      </div>
    </section>
  );
}
