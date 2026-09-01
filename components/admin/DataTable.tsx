// components/admin/DataTable.tsx
//
// Table admin partagée — lot A5 de docs/PLAN-espace-admin.md.
//
// `AdminListShell` unifiait déjà les ÉTATS d'une liste (erreur → chargement →
// vide → contenu) ; son propre en-tête reconnaît factoriser « ~90 pages ». Tout
// le reste — tri, recherche, pagination, sélection, export CSV — restait
// réimplémenté à la main, écran par écran, chacun à sa façon.
//
// Ce composant porte ces cinq choses une fois. Ce qu'il n'essaie PAS de faire :
// remplacer une liste qui n'est pas une table (cartes, calendrier, kanban). Une
// abstraction qui couvre tout ne couvre rien.
//
// Trois choix qui expliquent la forme :
//
//   1. Les COLONNES sont déclaratives (`render` optionnel, `exportValue`
//      séparé) : l'export CSV cesse d'être une seconde description des mêmes
//      données, qui dérive de la première.
//   2. Le tri, la recherche et la page vivent dans l'URL (`useTableQueryState`)
//      — un filtre appliqué se partage et se recharge.
//   3. La sélection multiple est OPTIONNELLE et ne s'affiche que si des actions
//      groupées existent : une colonne de cases à cocher sans action est un
//      piège à clics.

import { useMemo, type ReactNode } from 'react';
import AdminListShell from './AdminListShell';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDataTable from '@/lib/i18n/locales/admin-fr/adminDataTable';
import Th from './Th';
import { useTableQueryState } from '@/hooks/useTableQueryState';

export type DataTableColumn<T> = {
  /** Clé stable — sert au tri (URL) et à l'en-tête d'export. */
  key: string;
  header: string;
  /** Rendu de la cellule. Défaut : la valeur brute de `value`. */
  render?: (row: T) => ReactNode;
  /** Valeur triable / exportable. Sans elle, la colonne n'est ni l'un ni l'autre. */
  value?: (row: T) => string | number | null;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
};

export type BulkAction<T> = {
  label: string;
  /** Exécutée avec les lignes sélectionnées. */
  run: (rows: T[]) => Promise<void> | void;
  variant?: 'default' | 'danger';
};

export type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  /**
   * Classe appliquée à la ligne — pour les états qui se lisent sur la LIGNE
   * entière (une clé révoquée qu'on estompe, une ligne inactive). Sans ça,
   * migrer une liste demanderait de répéter l'état dans chaque cellule.
   */
  rowClassName?: (row: T) => string;
  /**
   * `data-testid` de la ligne. Les suites e2e s'accrochent aux lignes, pas aux
   * cellules : sans ce point d'accroche, migrer une liste testée casserait ses
   * tests — et le kit deviendrait une raison de ne pas tester.
   */
  rowTestId?: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  /**
   * Affiche le champ de recherche. `true` = placeholder du kit ; une chaîne le
   * remplace quand l'écran a mieux à dire (« Nom, email ou n° adhérent… »).
   * Absent = pas de recherche.
   */
  searchPlaceholder?: string | boolean;
  /** Préfixe des paramètres d'URL, à distinguer si deux tables coexistent. */
  queryPrefix?: string;
  pageSize?: number;
  /**
   * Pagination SERVEUR : la table reçoit déjà la page à afficher et se contente
   * de rendre les commandes. Révélé par la deuxième adoption (les adhérents, en
   * `offset`/`limit`) — la corriger dans le kit plutôt que dans l'écran est
   * tout l'intérêt d'avoir un kit.
   *
   * En mode serveur, la table NE trie ni ne filtre côté client : le faire
   * n'ordonnerait que la page visible, ce qui se lit comme un tri global et
   * ment. L'écran garde ses propres filtres, la table garde l'export et le
   * rendu.
   */
  serverPagination?: {
    offset: number;
    limit: number;
    /** Total connu, ou `null` si le serveur ne le renvoie pas. */
    total: number | null;
    onOffsetChange: (offset: number) => void;
  };
  /** Nom du fichier CSV. Absent = pas d'export. */
  exportFilename?: string;
  selection?: {
    actions: BulkAction<T>[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
  };
  /**
   * Surcharge des libellés du kit. Optionnelle : par défaut la table lit son
   * propre namespace (`adminDataTable`) — sans quoi chaque écran migré devait
   * recopier huit clés de vocabulaire qui ne parlent pas de son métier.
   */
  labels?: Partial<{
    search: string;
    searchPlaceholder: string;
    empty: string;
    export: string;
    selected: string;
    selectAll: string;
    selectRow: string;
    previous: string;
    next: string;
    page: string;
  }>;
};

function toCsvCell(value: string | number | null): string {
  const s = value == null ? '' : String(value);
  // Guillemets doublés, champ entre guillemets dès qu'il contient un
  // séparateur : la règle RFC 4180, sans laquelle un nom d'équipe avec une
  // virgule décale toute la ligne.
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowClassName,
  rowTestId,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyMessage,
  searchPlaceholder,
  queryPrefix = '',
  pageSize = 25,
  exportFilename,
  serverPagination,
  selection,
  labels: labelOverrides,
}: DataTableProps<T>) {
  const tk = useAdminT(nsAdminDataTable);
  const labels = { ...tk, ...(labelOverrides ?? {}) };
  const { q, sort, dir, page, setQ, toggleSort, setPage } =
    useTableQueryState(queryPrefix);

  const searchable = useMemo(
    () => columns.filter((c) => typeof c.value === 'function'),
    [columns]
  );

  const filtered = useMemo(() => {
    // Mode serveur : `rows` EST la page. Filtrer ici ne filtrerait que ce qui
    // est déjà à l'écran.
    if (serverPagination) return rows;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      searchable.some((c) =>
        String(c.value?.(row) ?? '')
          .toLowerCase()
          .includes(needle)
      )
    );
  }, [rows, q, searchable, serverPagination]);

  const sorted = useMemo(() => {
    if (serverPagination) return filtered;
    if (!sort) return filtered;
    const column = columns.find((c) => c.key === sort);
    if (!column?.value) return filtered;
    const factor = dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = column.value!(a);
      const vb = column.value!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // les vides en dernier, dans les deux sens
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * factor;
      }
      return (
        String(va).localeCompare(String(vb), undefined, {
          numeric: true,
        }) * factor
      );
    });
  }, [filtered, sort, dir, columns, serverPagination]);

  const pageCount = serverPagination
    ? Math.max(
        1,
        serverPagination.total !== null
          ? Math.ceil(serverPagination.total / serverPagination.limit)
          : serverPagination.offset / serverPagination.limit + 2
      )
    : Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = serverPagination
    ? Math.floor(serverPagination.offset / serverPagination.limit) + 1
    : Math.min(page, pageCount);
  const visible = serverPagination
    ? sorted
    : sorted.slice((current - 1) * pageSize, current * pageSize);

  const goToPage = (next: number) => {
    if (serverPagination) {
      serverPagination.onOffsetChange(
        Math.max(0, (next - 1) * serverPagination.limit)
      );
      return;
    }
    setPage(next);
  };

  const allVisibleSelected =
    !!selection &&
    visible.length > 0 &&
    visible.every((row) => selection.selected.has(rowKey(row)));

  const exportCsv = () => {
    if (!exportFilename) return;
    const cols = columns.filter((c) => typeof c.value === 'function');
    const head = cols.map((c) => toCsvCell(c.header)).join(',');
    const body = sorted
      .map((row) => cols.map((c) => toCsvCell(c.value!(row))).join(','))
      .join('\n');
    // BOM UTF-8 : sans lui, Excel ouvre les accents en mojibake — et l'export
    // sert surtout à ouvrir le fichier dans Excel.
    const blob = new Blob([`﻿${head}\n${body}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename.endsWith('.csv')
      ? exportFilename
      : `${exportFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const selectedRows = selection
    ? sorted.filter((row) => selection.selected.has(rowKey(row)))
    : [];

  return (
    <div className="flex flex-col gap-3">
      {((searchPlaceholder && !serverPagination) || exportFilename) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && !serverPagination && (
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                typeof searchPlaceholder === 'string'
                  ? searchPlaceholder
                  : labels.searchPlaceholder
              }
              aria-label={labels.search}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          )}
          {exportFilename && (
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
            >
              {labels.export}
            </button>
          )}
        </div>
      )}

      {selection && selectedRows.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2"
          role="status"
        >
          <span className="text-xs text-blue-100">
            {labels.selected.replace('{n}', String(selectedRows.length))}
          </span>
          {selection.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => action.run(selectedRows)}
              className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                action.variant === 'danger'
                  ? 'border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20'
                  : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <AdminListShell
        loading={loading}
        error={error}
        isEmpty={sorted.length === 0}
        onRetry={onRetry}
        emptyTitle={emptyTitle ?? labels.empty}
        emptyMessage={emptyMessage}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                {selection && (
                  <Th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      aria-label={labels.selectAll}
                      onChange={(e) => {
                        const next = new Set(selection.selected);
                        for (const row of visible) {
                          if (e.target.checked) next.add(rowKey(row));
                          else next.delete(rowKey(row));
                        }
                        selection.onChange(next);
                      }}
                    />
                  </Th>
                )}
                {columns.map((c) => {
                  const isSorted = sort === c.key;
                  const canSort =
                    !serverPagination && c.sortable !== false && !!c.value;
                  return (
                    <Th
                      key={c.key}
                      className={`px-3 py-2 font-medium ${c.headerClassName ?? ''}`}
                      aria-sort={
                        isSorted
                          ? dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="inline-flex items-center gap-1 transition hover:text-white"
                        >
                          {c.header}
                          <span aria-hidden className="text-[10px]">
                            {isSorted ? (dir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      ) : (
                        c.header
                      )}
                    </Th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((row) => {
                const id = rowKey(row);
                return (
                  <tr
                    key={id}
                    data-testid={rowTestId?.(row)}
                    className={`hover:bg-white/[0.03] ${rowClassName?.(row) ?? ''}`}
                  >
                    {selection && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selection.selected.has(id)}
                          aria-label={labels.selectRow}
                          onChange={(e) => {
                            const next = new Set(selection.selected);
                            if (e.target.checked) next.add(id);
                            else next.delete(id);
                            selection.onChange(next);
                          }}
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 align-middle ${c.className ?? ''}`}
                      >
                        {c.render ? c.render(row) : (c.value?.(row) ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-end gap-3 text-xs text-neutral-400">
            <button
              type="button"
              onClick={() => goToPage(current - 1)}
              disabled={current <= 1}
              className="rounded-lg border border-white/15 px-2 py-1 transition hover:bg-white/10 disabled:opacity-40"
            >
              {labels.previous}
            </button>
            <span className="tabular-nums">
              {labels.page
                .replace('{page}', String(current))
                .replace('{pages}', String(pageCount))}
            </span>
            <button
              type="button"
              onClick={() => goToPage(current + 1)}
              disabled={current >= pageCount}
              className="rounded-lg border border-white/15 px-2 py-1 transition hover:bg-white/10 disabled:opacity-40"
            >
              {labels.next}
            </button>
          </div>
        )}
      </AdminListShell>
    </div>
  );
}
