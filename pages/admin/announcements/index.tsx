import { useCallback, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import DeleteConfirmModal from '@/components/admin/DeleteConfirmModal';
import { useUrlFilters } from '@/utils/useUrlFilters';
import {
  escapePostgrestValue,
  sanitizeSearch,
} from '@/utils/apiHelpers';

import { logger } from '../../../utils/logger';
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

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
  announcements: AnnouncementRow[];
  total: number;
  errorMsg: string | null;
};

const A_FILTER_KEYS = ['search', 'status', 'offset'] as const;
const LIMIT = 20;

function statusLabel(isActive: boolean) {
  return isActive ? 'Actif' : 'Inactif';
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

function AdminAnnouncementsPage({
  announcements,
  total,
  errorMsg: ssrError,
}: Props) {
  const router = useRouter();
  const { filters, setFilter, setFilters } = useUrlFilters(A_FILTER_KEYS);

  const search = filters.search ?? '';
  const statusFilter = filters.status ?? null;
  const offset = Number(filters.offset) || 0;
  const limit = LIMIT;

  const [searchInput, setSearchInput] = useState(search);
  const [errorMsg, setErrorMsg] = useState<string | null>(ssrError);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const loading = false;

  const fetchData = useCallback(() => {
    router.replace(router.asPath, undefined, { scroll: false });
  }, [router]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ search: searchInput.trim() || null, offset: null });
  }

  const handleDelete = async (item: AnnouncementRow) => {
    if (!item?.id) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Suppression impossible');
      }
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Erreur de suppression.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Annonces</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Gestion des annonces
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total} annonce{total > 1 ? 's' : ''}
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
                Nouvelle annonce
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
                Réessayer
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
                    placeholder="Titre ou message..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={statusFilter || ''}
                  onChange={(e) =>
                    setFilters({ status: e.target.value || null, offset: null })
                  }
                >
                  <option value="">Tous les statuts</option>
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
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
                Rechercher
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
                Aucune annonce trouvée
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
                          {statusLabel(a.is_active)}
                        </span>
                        {a.priority !== null && a.priority > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                            Priorité {a.priority}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-300 truncate mb-1">
                        {a.message}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-neutral-400">
                        {a.cta_label && (
                          <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                            CTA: {a.cta_label}
                          </span>
                        )}
                        <span>Début: {formatDate(a.starts_at)}</span>
                        <span>•</span>
                        <span>Fin: {formatDate(a.ends_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/admin/announcements/${a.id}`}
                        className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                      >
                        Modifier
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(a)}
                        className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setFilter('offset', String(Math.max(0, offset - limit)) || null)
              }
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
              {offset + 1} – {offset + announcements.length}
              {total ? ` sur ${total}` : ''}
            </span>

            <button
              type="button"
              disabled={offset + limit >= total}
              onClick={() => setFilter('offset', String(offset + limit))}
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
        </div>
      </div>

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          title="Supprimer cette annonce ?"
          deleting={deleting}
          errorMsg={errorMsg}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        >
          <p className="text-sm text-neutral-300 bg-neutral-900/50 rounded-xl p-3">
            Supprimer l&apos;annonce{' '}
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

export const getServerSideProps = withStaffPage('admin', async (ctx) => {
  const { query } = ctx;
  const search = sanitizeSearch(query.search);
  const status = typeof query.status === 'string' ? query.status : null;
  const offset = Math.max(0, Number(query.offset) || 0);

  if (!supabaseAdmin) {
    return { announcements: [], total: 0, errorMsg: 'Service indisponible' };
  }

  let q = supabaseAdmin
    .from('announcements')
    .select('*', { count: 'exact' })
    .order('priority', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIMIT - 1);

  if (status === 'active') {
    q = q.eq('is_active', true);
  } else if (status === 'inactive') {
    q = q.eq('is_active', false);
  }
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    q = q.or(`title.ilike.${s},message.ilike.${s}`);
  }

  const { data, error, count } = await q;

  if (error) {
    logger.error('admin announcements SSR error:', error);
    return {
      announcements: [],
      total: 0,
      errorMsg: 'Erreur lors du chargement',
    };
  }

  return {
    announcements: (data || []) as AnnouncementRow[],
    total: typeof count === 'number' ? count : (data?.length ?? 0),
    errorMsg: null,
  };
});

export default AdminAnnouncementsPage;
