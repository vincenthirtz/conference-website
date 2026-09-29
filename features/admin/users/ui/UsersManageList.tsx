// features/admin/users/ui/UsersManageList.tsx — la coquille de la liste de la
// gestion des inscrits (pages/admin/users/manage.tsx) : barre de tri, barre de
// sélection et d'actions en lot, corps (squelette / vide / lignes) et
// pagination. Présentationnelle : la page garde la sélection, les actions en
// lot (confirmation + appels) et l'offset ; elle ne passe ici que des valeurs
// et des gestes.

import type { ReactNode } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type {
  Dict,
  SortDir,
  SortField,
} from '@/features/admin/users/manageModel';
import {
  RoleOptionGroups,
  USERS_MANAGE_CHECKBOX,
  USERS_MANAGE_SELECT,
} from './UsersManageRow';

const CAPS =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] [font-stretch:75%]';

const SPINNER = (
  <span
    aria-hidden
    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
);

/* En-tête de tri — l'affordance « je clique sur la colonne pour trier »
 * remplace les listes déroulantes de tri du bandeau de filtres. */
function SortHeader({
  t,
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  t: Dict;
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-pressed={active}
      title={
        active
          ? sortDir === 'asc'
            ? t.sortAscTitle
            : t.sortDescTitle
          : undefined
      }
      className={`inline-flex h-[26px] items-center gap-1 rounded-[3px] px-2.5 ${CAPS} transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--or,#b467d1)] ${
        active
          ? 'bg-[var(--s3,#2f2732)] text-[var(--t1,#f4edf7)]'
          : 'text-[var(--t3,#a39ba6)] hover:bg-[var(--s2,#1d1520)] hover:text-[var(--t1,#f4edf7)]'
      }`}
    >
      {label}
      {active && (
        <svg
          className={`h-3 w-3 transition-transform ${
            sortDir === 'asc' ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      )}
    </button>
  );
}

/** Barre de tri (remplace les selects « Trier par »). */
export function UsersManageSortBar({
  t,
  sortField,
  sortDir,
  onSort,
}: {
  t: Dict;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-2">
      <span className={`mr-1 text-[var(--t4,#807984)] ${CAPS}`}>
        {t.sortLabel}
      </span>
      {(
        [
          ['display_name', t.sortName],
          ['email', t.sortEmail],
          ['role', t.sortRole],
          ['created_at', t.sortCreatedAt],
          ['last_sign_in_at', t.sortLastSignIn],
        ] as Array<[SortField, string]>
      ).map(([field, label]) => (
        <SortHeader
          key={field}
          t={t}
          field={field}
          label={label}
          sortField={sortField}
          sortDir={sortDir}
          onSort={onSort}
        />
      ))}
    </div>
  );
}

/** Barre de sélection et d'actions en lot (bandeau orchidée de la planche). */
export function UsersManageBulkBar({
  t,
  staffCanGrant,
  allPageSelected,
  onToggleSelectAll,
  selectedCount,
  bulkProgress,
  bulkBusy,
  onBulkRole,
  onBulkDelete,
  onClear,
}: {
  t: Dict;
  /** Anti-escalade : grise ce que l'appelant ne peut pas octroyer. */
  staffCanGrant: (role: string) => boolean;
  allPageSelected: boolean;
  onToggleSelectAll: () => void;
  selectedCount: number;
  bulkProgress: { done: number; total: number } | null;
  bulkBusy: boolean;
  onBulkRole: (role: string) => void;
  onBulkDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-b border-[var(--line,rgba(194,196,201,.12))] px-4 py-3 ${
        selectedCount > 0 ? 'bg-[rgba(180,103,209,.10)]' : ''
      }`}
    >
      <label className="flex items-center gap-2 text-[13px] text-[var(--t2,#c7bfca)]">
        <input
          type="checkbox"
          checked={allPageSelected}
          onChange={onToggleSelectAll}
          aria-label={t.selectAllAria}
          className={USERS_MANAGE_CHECKBOX}
        />
        <span
          className={selectedCount > 0 ? 'text-[var(--or-200,#eec4ff)]' : ''}
          data-numeric
        >
          {selectedCount > 0
            ? format(
                selectedCount > 1 ? t.bulkSelected_other : t.bulkSelected_one,
                { count: selectedCount }
              )
            : t.selectAllAria}
        </span>
      </label>
      {selectedCount > 0 && (
        <span className="text-xs text-[var(--t4,#807984)]">
          {t.selectionAcrossPages}
        </span>
      )}
      {bulkProgress && (
        <span
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-[var(--t2,#c7bfca)]"
          data-numeric
        >
          {format(t.bulkProgress, {
            done: bulkProgress.done,
            total: bulkProgress.total,
          })}
        </span>
      )}

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <select
            value=""
            disabled={bulkBusy}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = '';
              if (v) onBulkRole(v);
            }}
            aria-label={t.bulkRolePlaceholder}
            className={USERS_MANAGE_SELECT}
          >
            <option value="">{t.bulkRolePlaceholder}</option>
            <RoleOptionGroups t={t} isGrantable={staffCanGrant} />
          </select>
          <AdminButton
            variant="danger"
            size="xs"
            onClick={onBulkDelete}
            disabled={bulkBusy}
          >
            {bulkBusy && SPINNER}
            {t.bulkDelete}
          </AdminButton>
          <AdminButton
            variant="ghost"
            size="xs"
            onClick={onClear}
            disabled={bulkBusy}
          >
            {t.bulkClear}
          </AdminButton>
        </div>
      )}
    </div>
  );
}

/** Corps de la liste : squelette pendant le chargement, état vide, lignes. */
export function UsersManageListBody({
  t,
  loading,
  empty,
  children,
}: {
  t: Dict;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton
              className="h-12 w-12 flex-shrink-0"
              rounded="rounded-[4px]"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton
              className="h-8 w-28 flex-shrink-0"
              rounded="rounded-[4px]"
            />
          </div>
        ))}
      </div>
    );
  }
  if (empty) return <EmptyState title={t.emptyUsers} />;
  return (
    <ul
      role="list"
      className="divide-y divide-[var(--line,rgba(194,196,201,.12))]"
    >
      {children}
    </ul>
  );
}

/** Pagination serveur : précédent / plage affichée / suivant. */
export function UsersManagePagination({
  t,
  offset,
  shown,
  total,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
}: {
  t: Dict;
  offset: number;
  /** Nombre de lignes de la page courante. */
  shown: number;
  total: number | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
      <AdminButton
        variant="ghost"
        size="sm"
        disabled={prevDisabled}
        onClick={onPrev}
      >
        <span aria-hidden>‹</span>
        {t.previous}
      </AdminButton>

      <span className="text-xs text-[var(--t4,#807984)]" data-numeric>
        {format(t.paginationRange, { from: offset + 1, to: offset + shown })}
        {total ? format(t.paginationOf, { total }) : ''}
      </span>

      <AdminButton
        variant="ghost"
        size="sm"
        disabled={nextDisabled}
        onClick={onNext}
      >
        {t.next}
        <span aria-hidden>›</span>
      </AdminButton>
    </div>
  );
}
