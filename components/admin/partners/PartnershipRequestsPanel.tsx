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
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPartnershipRequestsList from '@/lib/i18n/locales/admin-fr/adminPartnershipRequestsList';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

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

const statusTones: Record<string, ChipTone> = {
  new: 'brand',
  read: 'neutral',
  contacted: 'brand',
  negotiating: 'warn',
  accepted: 'ok',
  declined: 'err',
  archived: 'neutral',
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
                <span className="ml-2">
                  <Chip tone="brand">
                    {format(newCount > 1 ? t.newCount_other : t.newCount_one, {
                      count: newCount,
                    })}
                  </Chip>
                </span>
              )}
            </p>
          </div>

          <AdminButtonLink variant="ghost" size="md" href="/admin/partners">
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
          </AdminButtonLink>
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
            className={`p-3 rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] transition-colors text-center ${
              statusFilter === status
                ? 'border-[var(--or,#b467d1)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))] hover:border-[var(--t4,#807984)]'
            }`}
          >
            <div
              className="font-[family-name:var(--fd)] text-[28px] font-extrabold leading-none text-[var(--t1,#f4edf7)] [font-stretch:75%]"
              data-numeric
            >
              {counts[status] || 0}
            </div>
            <div className="mt-1.5 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
              {label}
            </div>
          </button>
        ))}
      </section>

      {/* Filters */}
      <ListToolbar
        search={
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder={t.searchPlaceholder}
            label={t.filterSearch}
          />
        }
        filters={
          <>
            <FilterSelect
              label={t.filterStatus}
              allLabel={t.statusAll}
              value={statusFilter}
              onChange={setStatusFilter}
              options={Object.entries(statusLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <FilterSelect
              label={t.filterCategory}
              allLabel={t.categoryAll}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={Object.entries(categoryLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </>
        }
      />

      {/* Requests List */}
      <section className="bg-[var(--s1,#100812)] backdrop-blur border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] overflow-hidden">
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
                      className={`w-10 h-10 rounded-[var(--r-card,14px)] flex items-center justify-center ${
                        r.status === 'new'
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'bg-[var(--s3,#2f2732)] text-neutral-400'
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
                      <Chip tone={statusTones[r.status]}>
                        {statusLabels[r.status]}
                      </Chip>
                      <Chip>{categoryLabels[r.category]}</Chip>
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
                    <AdminButtonLink
                      variant="ghost"
                      size="xs"
                      href={`/admin/partnership-requests/${r.id}`}
                    >
                      {t.view}
                    </AdminButtonLink>
                    <AdminButton
                      variant="danger"
                      size="xs"
                      onClick={() => onDelete(r.id)}
                    >
                      {t.delete}
                    </AdminButton>
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
          <AdminButton
            variant="ghost"
            size="md"
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
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
            {offset + 1} – {offset + requests.length}
            {total !== null ? format(t.paginationTotal, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="md"
            type="button"
            disabled={total !== null && offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
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
      )}
    </>
  );
}
