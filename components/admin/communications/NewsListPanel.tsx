// components/admin/communications/NewsListPanel.tsx
//
// "Actualités" tab of the merged /admin/communications hub (ex-route
// /admin/news, 308-redirected here). Liste paginée + filtres + suppression.
// Les pages de création/édition (news/new, news/[id]) restent des routes à
// part.
//
// Les données (news/total/errorMsg) sont chargées côté SSR par le loader du
// host (/admin/communications) — identique à l'ex-page — puis passées en props.
// Les filtres (search/status/offset) restent pilotés par l'URL : les modifier
// déclenche un `router.replace(asPath)` qui relance le loader SSR du host.
// minRole 'admin' (re-gaté par le host).

import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import DeleteConfirmModal from '@/components/admin/DeleteConfirmModal';
import { newsListClient } from '@/features/admin/communications/client';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminNewsList from '@/lib/i18n/locales/admin-fr/adminNewsList';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminNewsList.fr;

export type NewsRow = {
  id: string;
  title: string;
  slug: string;
  tag?: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
};

type Props = {
  news: NewsRow[];
  total: number;
  errorMsg: string | null;
};

const N_FILTER_KEYS = ['search', 'status', 'offset'] as const;
const LIMIT = 20;

function statusLabel(t: Dict, status: 'draft' | 'published') {
  return status === 'published' ? t.statusPublished : t.statusDraft;
}

function statusTone(status: 'draft' | 'published'): ChipTone {
  return status === 'published' ? 'ok' : 'neutral';
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

export default function NewsListPanel({
  news,
  total,
  errorMsg: ssrError,
}: Props) {
  const t = useAdminT(nsAdminNewsList);
  const router = useRouter();
  const { filters, setFilter, setFilters } = useUrlFilters(N_FILTER_KEYS);

  const search = filters.search ?? '';
  const statusFilter = filters.status ?? null;
  const offset = Number(filters.offset) || 0;
  const limit = LIMIT;

  const [searchInput, setSearchInput] = useState(search);
  const [errorMsg, setErrorMsg] = useState<string | null>(ssrError);
  const [deleteTarget, setDeleteTarget] = useState<NewsRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loading = false;

  const fetchData = useCallback(() => {
    router.replace(router.asPath, undefined, { scroll: false });
  }, [router]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ search: searchInput.trim() || null, offset: null });
  }

  const handleDelete = async (item: NewsRow) => {
    if (!item?.id) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await newsListClient.remove(item.id);
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorDelete);
    } finally {
      setDeleting(false);
    }
  };

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
              {format(total > 1 ? t.count_other : t.count_one, {
                count: total,
              })}
            </p>
          </div>

          <AdminButtonLink href="/admin/news/new" variant="primary">
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
          </AdminButtonLink>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] px-4 py-3 text-sm flex items-center gap-2">
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
          <AdminButton variant="ghost" size="xs" onClick={() => fetchData()}>
            {t.retry}
          </AdminButton>
        </div>
      )}

      {/* Filters */}
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 mb-6">
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
                className="w-full pl-10 pr-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          <div className="min-w-[160px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.statusLabel}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none"
              value={statusFilter || ''}
              onChange={(e) =>
                setFilters({ status: e.target.value || null, offset: null })
              }
            >
              <option value="">{t.statusAll}</option>
              <option value="draft">{t.statusDraft}</option>
              <option value="published">{t.statusPublished}</option>
            </select>
          </div>

          <AdminButton variant="ghost" size="sm" type="submit">
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
          </AdminButton>
        </form>
      </section>

      {/* News List */}
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)] rounded-full animate-spin" />
          </div>
        ) : news.length === 0 ? (
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
                d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
              />
            </svg>
            {t.emptyState}
          </div>
        ) : (
          <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
            {news.map((n) => (
              <div
                key={n.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-neutral-700/30 transition-colors group"
              >
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] flex items-center justify-center border border-[var(--line,rgba(194,196,201,.12))]">
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                        {n.title}
                      </h3>
                      <Chip tone={statusTone(n.status)}>
                        {statusLabel(t, n.status)}
                      </Chip>
                      {n.tag && <Chip tone="neutral">{n.tag}</Chip>}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-sm text-neutral-400 flex-wrap">
                      <span className="font-mono text-xs bg-[var(--s2,#1d1520)] px-2 py-0.5 rounded-[3px]">
                        /{n.slug}
                      </span>
                      <span className="hidden sm:inline">•</span>
                      <span>
                        {format(t.createdOn, {
                          date: formatDate(n.created_at),
                        })}
                      </span>
                      {n.status === 'published' && n.published_at && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            {format(t.publishedOn, {
                              date: formatDate(n.published_at),
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 pl-13 sm:pl-0">
                  <AdminButtonLink
                    href={`/admin/news/${n.id}`}
                    variant="ghost"
                    size="sm"
                  >
                    {t.edit}
                  </AdminButtonLink>
                  <AdminButton
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget(n)}
                  >
                    {t.delete}
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-6">
        <AdminButton
          variant="ghost"
          size="sm"
          disabled={offset === 0}
          onClick={() =>
            setFilter('offset', String(Math.max(0, offset - limit)) || null)
          }
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
        </AdminButton>

        <span className="text-neutral-400 text-sm">
          {offset + 1} – {offset + news.length}
          {total ? format(t.paginationOf, { total }) : ''}
        </span>

        <AdminButton
          variant="ghost"
          size="sm"
          disabled={offset + limit >= total}
          onClick={() => setFilter('offset', String(offset + limit))}
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
        </AdminButton>
      </div>

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          title={t.deleteModalTitle}
          deleting={deleting}
          errorMsg={errorMsg}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        >
          <p className="text-sm text-neutral-300 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
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
