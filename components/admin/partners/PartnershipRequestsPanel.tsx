// components/admin/partners/PartnershipRequestsPanel.tsx
// Admin: liste des demandes de partenariat entrantes du tenant courant.
// Rendered as the "Demandes" tab of the /admin/partners hub.
//
// Endpoints:
//   GET    /api/admin/partnership-requests?status=&category=&search=
//            → { items, counts, total }
//   DELETE /api/admin/partnership-requests/[id]
//
// La page détail d'une demande reste une route à part
// (/admin/partnership-requests/[id]). minRole 'admin' (miroir des routes API).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPartnershipRequestsList from '@/lib/i18n/locales/admin-fr/adminPartnershipRequestsList';

type Dict = typeof nsAdminPartnershipRequestsList.fr;
type RequestRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  category: 'super' | 'major' | 'cultural' | 'other';
  message: string;
  budget_range: string | null;
  status: string;
  created_at: string;
};

const PAGE_SIZE = 50;

function getStatusLabels(t: Dict): Record<string, string> {
  return {
    new: t.statusNew,
    read: t.statusRead,
    contacted: t.statusContacted,
    negotiating: t.statusNegotiating,
    accepted: t.statusAccepted,
    declined: t.statusDeclined,
    archived: t.statusArchived,
  };
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-600 text-white',
  read: 'bg-neutral-600 text-white',
  contacted: 'bg-purple-600 text-white',
  negotiating: 'bg-amber-600 text-white',
  accepted: 'bg-emerald-600 text-white',
  declined: 'bg-red-600 text-white',
  archived: 'bg-neutral-500 text-white',
};

function getCategoryLabels(t: Dict): Record<string, string> {
  return {
    super: t.categorySuper,
    major: t.categoryMajor,
    cultural: t.categoryCultural,
    other: t.categoryOther,
  };
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

export default function PartnershipRequestsPanel() {
  const t = useAdminT(nsAdminPartnershipRequestsList);
  const statusLabels = getStatusLabels(t);
  const categoryLabels = getCategoryLabels(t);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Filtres status/category → params serveur ; recherche → `query` (debounce
  // 350ms + reset d'offset gérés par le hook). Les compteurs par statut
  // reviennent dans le même payload → captés via `onData` (pas de 2e requête).
  const {
    data: requests,
    total,
    loading,
    refresh: fetchData,
    offset,
    setOffset,
    resetOffset,
  } = useAdminResource<
    RequestRow,
    {
      items?: RequestRow[];
      counts?: Record<string, number>;
      total?: number | null;
    }
  >('/api/admin/partnership-requests', {
    limit: PAGE_SIZE,
    query: search,
    debounceMs: 350,
    params: { status: statusFilter, category: categoryFilter },
    select: (res) => res.items || [],
    selectTotal: (res) => (typeof res.total === 'number' ? res.total : null),
    onData: (res) => setCounts(res.counts || {}),
  });

  // Le changement de filtre revient à la première page (le reset lié à la
  // recherche est déjà géré par le hook via `query`).
  useEffect(() => {
    resetOffset();
  }, [statusFilter, categoryFilter, resetOffset]);

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: t.confirmDeleteTitle,
      variant: 'danger',
      confirmLabel: t.delete,
    });
    if (!ok) return;
    try {
      await adminFetchJson(`/api/admin/partnership-requests/${id}`, {
        method: 'DELETE',
      });
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
    }
  };

  const newCount = counts['new'] || 0;

  return (
    <>
      {dialog}

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {format(
                (total !== null ? total : requests.length) > 1
                  ? t.countRequests_other
                  : t.countRequests_one,
                { count: total !== null ? total : requests.length }
              )}
              {newCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-600 text-white">
                  {format(newCount > 1 ? t.newCount_other : t.newCount_one, {
                    count: newCount,
                  })}
                </span>
              )}
            </p>
          </div>

          <Link
            href="/admin/partners"
            className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {t.managePartners}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {Object.entries(statusLabels).map(([status, label]) => (
          <button
            key={status}
            onClick={() =>
              setStatusFilter(statusFilter === status ? null : status)
            }
            className={`p-3 rounded-xl border transition-colors text-center ${
              statusFilter === status
                ? 'border-white/40 bg-white/10'
                : 'border-neutral-700/50 bg-neutral-800/30 hover:border-neutral-600'
            }`}
          >
            <div className="text-2xl font-bold">{counts[status] || 0}</div>
            <div className="text-xs text-neutral-400">{label}</div>
          </button>
        ))}
      </section>

      {/* Filters */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="min-w-[180px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.filterStatus}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFilter || ''}
              onChange={(e) => setStatusFilter(e.target.value || null)}
            >
              <option value="">{t.statusAll}</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.filterCategory}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={categoryFilter || ''}
              onChange={(e) => setCategoryFilter(e.target.value || null)}
            >
              <option value="">{t.categoryAll}</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm text-neutral-400 mb-1">
              {t.filterSearch}
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Requests List */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        <AdminListShell
          loading={loading}
          error={null}
          isEmpty={requests.length === 0}
          loadingClassName="py-20"
          emptyTitle={t.empty}
          emptyIcon={
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        >
          <div className="divide-y divide-neutral-700/50">
            {requests.map((r) => (
              <div
                key={r.id}
                className={`p-4 hover:bg-neutral-700/30 transition-colors ${
                  r.status === 'new' ? 'bg-blue-900/10' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        r.status === 'new'
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'bg-neutral-700/50 text-neutral-400'
                      }`}
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
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-white">
                        {r.company_name}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[r.status]
                        }`}
                      >
                        {statusLabels[r.status]}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-700 text-neutral-300">
                        {categoryLabels[r.category]}
                      </span>
                    </div>
                    <div className="text-sm text-neutral-300 mb-1">
                      {r.contact_name} • {r.email}
                      {r.phone && ` • ${r.phone}`}
                    </div>
                    <p className="text-sm text-neutral-400 line-clamp-2 mb-2">
                      {r.message}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span>
                        {format(t.receivedOn, {
                          date: formatDate(r.created_at),
                        })}
                      </span>
                      {r.budget_range && (
                        <>
                          <span>•</span>
                          <span>
                            {format(t.budget, { budget: r.budget_range })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/admin/partnership-requests/${r.id}`}
                      className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                    >
                      {t.view}
                    </Link>
                    <button
                      onClick={() => onDelete(r.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                    >
                      {t.delete}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AdminListShell>
      </section>

      {/* Pagination */}
      {requests.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
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
            {offset + 1} – {offset + requests.length}
            {total !== null ? format(t.paginationTotal, { total }) : ''}
          </span>

          <button
            type="button"
            disabled={total !== null && offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
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
    </>
  );
}
