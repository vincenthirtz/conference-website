import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';

import { logger } from '../../../utils/logger';
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

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

const statusLabels: Record<string, string> = {
  new: 'Nouvelle',
  read: 'Lue',
  contacted: 'Contacté',
  negotiating: 'En négociation',
  accepted: 'Acceptée',
  declined: 'Déclinée',
  archived: 'Archivée',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-600 text-white',
  read: 'bg-neutral-600 text-white',
  contacted: 'bg-purple-600 text-white',
  negotiating: 'bg-amber-600 text-white',
  accepted: 'bg-emerald-600 text-white',
  declined: 'bg-red-600 text-white',
  archived: 'bg-neutral-500 text-white',
};

const categoryLabels: Record<string, string> = {
  super: 'Super partenaire',
  major: 'Partenaire majeur',
  cultural: 'Partenaire culturel',
  other: 'Autre',
};

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

function AdminPartnershipRequestsPage({ staff }: Props) {
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);

  // Debounce de la recherche (requête serveur)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Tout changement de filtre/recherche réinitialise la pagination
  useEffect(() => {
    setOffset(0);
  }, [statusFilter, categoryFilter, debouncedSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const json = await adminFetchJson<{
        items?: RequestRow[];
        counts?: Record<string, number>;
        total?: number | null;
      }>(`/api/admin/partnership-requests?${params.toString()}`);

      setRequests(json.items || []);
      setCounts(json.counts || {});
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err) {
      logger.error('Error fetching partnership requests', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, debouncedSearch, offset, adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Supprimer cette demande ?',
      variant: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      await adminFetchJson(`/api/admin/partnership-requests/${id}`, {
        method: 'DELETE',
      });
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || 'Erreur de suppression.', 'error');
    }
  };

  const newCount = counts['new'] || 0;

  return (
    <>
      {dialog}
      <Head>
        <title>Admin - Demandes de partenariat</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Demandes de partenariat
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? `${total} demande${total > 1 ? 's' : ''}`
                    : `${requests.length} demande${requests.length > 1 ? 's' : ''}`}
                  {newCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-600 text-white">
                      {newCount} nouvelle{newCount > 1 ? 's' : ''}
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
                Gérer les partenaires
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
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={statusFilter || ''}
                  onChange={(e) => setStatusFilter(e.target.value || null)}
                >
                  <option value="">Tous les statuts</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Catégorie
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={categoryFilter || ''}
                  onChange={(e) => setCategoryFilter(e.target.value || null)}
                >
                  <option value="">Toutes les catégories</option>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[220px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Recherche
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
                    placeholder="Entreprise, contact, email..."
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
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : requests.length === 0 ? (
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
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Aucune demande trouvée
              </div>
            ) : (
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
                          <span>Reçue le {formatDate(r.created_at)}</span>
                          {r.budget_range && (
                            <>
                              <span>•</span>
                              <span>Budget: {r.budget_range}</span>
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
                          Voir
                        </Link>
                        <button
                          onClick={() => onDelete(r.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                Précédent
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + requests.length}
                {total !== null ? ` sur ${total}` : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Suivant
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
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPartnershipRequestsPage;
