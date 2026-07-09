// components/admin/communications/AnnouncementsListPanel.tsx
//
// "Annonces" tab of the merged /admin/communications hub (ex-route
// /admin/announcements, 308-redirected here). Liste paginée + filtres +
// suppression. Les pages de création/édition (announcements/new,
// announcements/[id]) restent des routes à part. minRole 'admin' (re-gaté par
// le host).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DeleteConfirmModal from '@/components/admin/DeleteConfirmModal';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminAnnouncementsList'>>;

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  cta_label: string | null;
  cta_url: string | null;
  is_active: boolean;
  priority: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type AnnouncementsApiResponse = {
  items: AnnouncementRow[];
  total: number | null;
};

const A_FILTER_KEYS = ['search', 'status'] as const;
const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

function statusLabel(t: Dict, isActive: boolean) {
  return isActive ? t.statusActive : t.statusInactive;
}

function statusColor(isActive: boolean) {
  return isActive
    ? 'bg-emerald-600 text-white'
    : 'bg-neutral-600 text-neutral-100';
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export default function AnnouncementsListPanel() {
  const t = useAdminT('adminAnnouncementsList');
  const { adminFetch } = useAdminFetch();
  const { filters, setFilters } = useUrlFilters(A_FILTER_KEYS);

  const search = filters.search ?? '';
  const statusFilter = filters.status ?? null;
  const limit = LIMIT;

  const [searchInput, setSearchInput] = useState(search);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filtres (search/status) restent pilotés par l'URL (partage de lien) et
  // passés en params serveur ; la pagination est détenue par le hook.
  // `includeInactive: true` toujours envoyé — le filtrage statut est explicite.
  const {
    data: announcements,
    total,
    loading,
    error: fetchError,
    refresh: fetchData,
    offset,
    setOffset,
    resetOffset,
  } = useAdminResource<AnnouncementRow, AnnouncementsApiResponse>(
    '/api/admin/announcements',
    {
      limit: LIMIT,
      params: {
        includeInactive: true,
        status: statusFilter,
        search,
      },
      select: (res) => res.items || [],
      selectTotal: (res) => (typeof res.total === 'number' ? res.total : null),
    }
  );

  // Bannière = erreur de suppression prioritaire, sinon erreur de chargement.
  const errorMsg = deleteError ?? fetchError;

  // Keep the search input in sync if the URL search param changes externally.
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounced search → write to URL (~300ms) which triggers a refetch.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = value.trim();
      if (next === (search.trim() || '')) return;
      resetOffset();
      setFilters({ search: next || null });
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    resetOffset();
    setFilters({ search: searchInput.trim() || null });
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDelete = async (item: AnnouncementRow) => {
    if (!item?.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await adminFetch(`/api/admin/announcements/${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || t.errorDeleteFailed);
      }
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      setDeleteError((err as Error)?.message || t.errorDelete);
    } finally {
      setDeleting(false);
    }
  };

  const totalCount = total ?? 0;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {t.heading}
            </h2>
            <p className="text-neutral-400 text-sm mt-1">
              {total !== null
                ? format(totalCount > 1 ? t.count_other : t.count_one, {
                    count: totalCount,
                  })
                : t.loading}
            </p>
          </div>

          <Link
            href="/admin/announcements/new"
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
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
            {t.newButton}
          </Link>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => fetchData()}
            className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
          >
            {t.retry}
          </button>
        </div>
      )}

      {/* Filters */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-4 flex-wrap items-end"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.searchLabel}
            </label>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
          </div>

          <div className="min-w-[160px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.statusLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFilter || ''}
              onChange={(e) => {
                resetOffset();
                setFilters({ status: e.target.value || null });
              }}
            >
              <option value="">{t.statusAll}</option>
              <option value="active">{t.statusActive}</option>
              <option value="inactive">{t.statusInactive}</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
          >
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {t.searchButton}
          </button>
        </form>
      </section>

      {/* Announcements List */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
              />
            </svg>
            {t.emptyState}
          </div>
        ) : (
          <div className="divide-y divide-neutral-700/50">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group"
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                    <svg
                      className="w-6 h-6 text-neutral-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                      {a.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                        a.is_active
                      )}`}
                    >
                      {statusLabel(t, a.is_active)}
                    </span>
                    {a.priority !== null && a.priority > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                        {format(t.priority, { priority: a.priority })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-300 truncate mb-1">
                    {a.message}
                  </p>
                  <div className="flex items-center gap-3 text-sm text-neutral-400">
                    {a.cta_label && (
                      <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                        {format(t.ctaLabel, { label: a.cta_label })}
                      </span>
                    )}
                    <span>
                      {format(t.startAt, { date: formatDate(a.starts_at) })}
                    </span>
                    <span>•</span>
                    <span>
                      {format(t.endAt, { date: formatDate(a.ends_at) })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/announcements/${a.id}`}
                    className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                  >
                    {t.edit}
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(a)}
                    className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pagination */}
      {announcements.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.previous}
          </button>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + announcements.length}
            {total !== null ? format(t.paginationOf, { total }) : ''}
          </span>

          <button
            type="button"
            disabled={total !== null && offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {t.next}
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          title={t.deleteModalTitle}
          deleting={deleting}
          errorMsg={errorMsg}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        >
          <p className="text-sm text-neutral-300 bg-neutral-900/50 rounded-xl p-3">
            {t.deleteModalPrefix}{' '}
            <span className="font-semibold text-white">
              {deleteTarget.title}
            </span>{' '}
            ?
          </p>
        </DeleteConfirmModal>
      )}
    </>
  );
}
