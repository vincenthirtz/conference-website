import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';
type Dict = ReturnType<typeof useAdminT<'adminCastMembersList'>>;

type CastMemberRow = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  twitch_url: string | null;
  city: string | null;
  is_active: boolean;
  is_promo: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  items: CastMemberRow[];
  total: number | null;
};

const PAGE_SIZE = 50;

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function statusLabel(tx: Dict, isActive: boolean) {
  return isActive ? tx.statusActive : tx.statusInactive;
}

function statusColor(isActive: boolean) {
  return isActive
    ? 'bg-emerald-600 text-white'
    : 'bg-neutral-600 text-neutral-100';
}

function AdminCastMembersPage({ staff }: Props) {
  const tx = useAdminT('adminCastMembersList');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<CastMemberRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [offset, setOffset] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  // Le drag-reorder n'a de sens que sur la liste complète, triée par
  // sort_order ASC, page 0. On le désactive dès qu'un filtre/recherche
  // restreint ou réordonne le jeu de résultats côté serveur.
  const canReorder =
    !debouncedSearch.trim() && status === 'all' && offset === 0;

  // Debounce de la recherche (~300ms) avant de requêter le serveur.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Toute modification de recherche/filtre repart de la première page.
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, status]);

  // Guard de séquence : le reset d'offset (effet ci-dessus) et le changement
  // de filtre déclenchent deux fetchs successifs dans le même commit ; seule
  // la dernière requête lancée peut appliquer sa réponse (sinon une réponse
  // périmée — ancien offset — peut revenir après la bonne et l'écraser).
  const fetchSeqRef = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (status === 'active') {
        params.set('status', 'active');
      } else if (status === 'inactive') {
        params.set('status', 'inactive');
      } else {
        // 'all' => inclure les inactives
        params.set('includeInactive', 'true');
      }
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }

      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/cast-members?${params.toString()}`
      );

      if (seq !== fetchSeqRef.current) return; // réponse périmée
      setMembers(json.items || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      logger.error('Error fetching cast members', err);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [adminFetchJson, offset, status, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: tx.deleteConfirmTitle,
      variant: 'danger',
      confirmLabel: tx.delete,
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/admin/cast-members/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || tx.errorDeleteFailed);
      }
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || tx.errorDelete, 'error');
    }
  };

  const onToggleActive = async (member: CastMemberRow) => {
    try {
      const res = await adminFetch(`/api/admin/cast-members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.is_active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || tx.errorUpdateFailed);
      }
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || tx.errorUpdate, 'error');
    }
  };

  const onDrop = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const reordered = [...members];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      // Compute new sort_order values
      const updates: { id: string; sortOrder: number }[] = [];
      reordered.forEach((m, i) => {
        if (m.sort_order !== i) {
          updates.push({ id: m.id, sortOrder: i });
        }
      });

      // Optimistic update
      setMembers(reordered.map((m, i) => ({ ...m, sort_order: i })));
      setDragIdx(null);
      setOverIdx(null);

      if (updates.length === 0) return;

      setSaving(true);
      try {
        const results = await Promise.all(
          updates.map((u) =>
            adminFetch(`/api/admin/cast-members/${u.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ sortOrder: u.sortOrder }),
            })
          )
        );
        // fetch ne rejette pas sur un statut HTTP d'erreur : vérifier chaque
        // réponse, sinon un 403/409/500 laisserait l'ordre optimiste affiché
        // sans persistance (ni toast ni resync).
        const failed = results.filter((res) => !res.ok);
        if (failed.length > 0) {
          throw new Error(
            format(
              failed.length > 1 ? tx.reorderFailed_other : tx.reorderFailed_one,
              { failed: failed.length, total: results.length }
            )
          );
        }
      } catch (err: unknown) {
        logger.error('Reorder error', err);
        addToast(tx.errorReorder, 'error');
        fetchData();
      } finally {
        setSaving(false);
      }
    },
    [members, fetchData, adminFetch, addToast, tx]
  );

  return (
    <>
      {dialog}
      <Head>
        <title>{tx.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {tx.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(total > 1 ? tx.count_other : tx.count_one, {
                        count: total,
                      })
                    : tx.loading}
                </p>
              </div>

              <Link
                href="/admin/cast-members/new"
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                {tx.addButton}
              </Link>
            </div>
          </div>

          {/* Search + Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="sm:col-span-2">
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.searchLabel}
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
                    placeholder={tx.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {tx.statusLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'all' | 'active' | 'inactive')
                  }
                >
                  <option value="all">{tx.statusAll}</option>
                  <option value="active">{tx.statusActivePlural}</option>
                  <option value="inactive">{tx.statusInactivePlural}</option>
                </select>
              </div>
            </div>
          </section>

          {/* Members List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
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
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                {debouncedSearch.trim() || status !== 'all'
                  ? tx.emptyFiltered
                  : tx.emptyState}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {saving && (
                  <div className="px-4 py-2 bg-purple-600/20 text-purple-300 text-xs text-center">
                    {tx.savingOrder}
                  </div>
                )}
                {members.map((m, idx) => {
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx;
                  const canDrag = canReorder; // disable when filtering/paginating
                  return (
                    <div
                      key={m.id}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        setDragIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setOverIdx(idx);
                      }}
                      onDragLeave={() => {
                        if (overIdx === idx) setOverIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx !== null) onDrop(dragIdx, idx);
                      }}
                      onDragEnd={() => {
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      className={`flex items-center gap-4 p-4 transition-colors group ${
                        isDragging
                          ? 'opacity-40 bg-neutral-700/20'
                          : isOver
                            ? 'bg-purple-600/10 border-t-2 border-purple-500'
                            : 'hover:bg-neutral-700/30'
                      }`}
                      style={{ cursor: canDrag ? 'grab' : undefined }}
                    >
                      {/* Drag handle */}
                      {canDrag && (
                        <div className="flex-shrink-0 text-neutral-500 hover:text-neutral-300 cursor-grab active:cursor-grabbing">
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
                              d="M4 8h16M4 16h16"
                            />
                          </svg>
                        </div>
                      )}
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {m.image_url ? (
                          <Image
                            src={m.image_url}
                            alt={m.name}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center border border-purple-500/30">
                            <svg
                              className="w-6 h-6 text-purple-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-white group-hover:text-purple-400 transition-colors">
                            {m.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                              m.is_active
                            )}`}
                          >
                            {statusLabel(tx, m.is_active)}
                          </span>
                          {m.is_promo && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                              {tx.promo}
                            </span>
                          )}
                        </div>
                        {m.title && (
                          <p className="text-sm text-neutral-400 mb-1">
                            {m.title}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-neutral-400">
                          {m.city && (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {m.city}
                            </span>
                          )}
                          {m.twitch_url && (
                            <a
                              href={m.twitch_url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-purple-400 transition-colors"
                            >
                              Twitch
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Sort order */}
                      <div className="flex-shrink-0 text-center">
                        <span className="text-xs text-neutral-500">
                          {tx.order}
                        </span>
                        <div className="text-lg font-bold text-neutral-300">
                          {m.sort_order}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => onToggleActive(m)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            m.is_active
                              ? 'border-amber-500/40 text-amber-300 hover:border-amber-400'
                              : 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                          }`}
                        >
                          {m.is_active ? tx.deactivate : tx.activate}
                        </button>
                        <Link
                          href={`/admin/cast-members/${m.id}`}
                          className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                        >
                          {tx.edit}
                        </Link>
                        <button
                          onClick={() => onDelete(m.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                        >
                          {tx.delete}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Pagination */}
          {members.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0 || loading}
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
                {tx.previous}
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + members.length}
                {total !== null ? format(tx.paginationOf, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={
                  loading || (total !== null && offset + PAGE_SIZE >= total)
                }
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {tx.next}
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

export default AdminCastMembersPage;
