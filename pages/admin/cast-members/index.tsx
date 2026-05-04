import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';

import { logger } from '../../../utils/logger';
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
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function statusLabel(isActive: boolean) {
  return isActive ? 'Active' : 'Inactive';
}

function statusColor(isActive: boolean) {
  return isActive
    ? 'bg-emerald-600 text-white'
    : 'bg-neutral-600 text-neutral-100';
}

function AdminCastMembersPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<CastMemberRow[]>([]);
  const [search, setSearch] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const json = await adminFetchJson<ApiResponse>(
        '/api/admin/cast-members?includeInactive=true'
      );

      setMembers(json.items || []);
    } catch (err) {
      logger.error('Error fetching cast members', err);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer cette casteuse ?')) return;
    try {
      const res = await adminFetch(`/api/admin/cast-members/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Suppression impossible');
      }
      fetchData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Erreur de suppression.');
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
        throw new Error(json?.error || 'Modification impossible');
      }
      fetchData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Erreur de modification.');
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
        await Promise.all(
          updates.map((u) =>
            adminFetch(`/api/admin/cast-members/${u.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ sortOrder: u.sortOrder }),
            })
          )
        );
      } catch (err: unknown) {
        logger.error('Reorder error', err);
        alert('Erreur lors de la sauvegarde de l\u2019ordre.');
        fetchData();
      } finally {
        setSaving(false);
      }
    },
    [members, fetchData, adminFetch]
  );

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.title && m.title.toLowerCase().includes(search.toLowerCase())) ||
      (m.city && m.city.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <Head>
        <title>Admin – Casteuses</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Pôle Production &amp; Cast
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {members.length} casteuse{members.length > 1 ? 's' : ''}{' '}
                  configurée{members.length > 1 ? 's' : ''}
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
                Ajouter une casteuse
              </Link>
            </div>
          </div>

          {/* Search */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
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
                  placeholder="Nom, titre ou ville..."
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Members List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : filteredMembers.length === 0 ? (
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
                {search
                  ? 'Aucune casteuse trouvée'
                  : 'Aucune casteuse configurée'}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {saving && (
                  <div className="px-4 py-2 bg-purple-600/20 text-purple-300 text-xs text-center">
                    Sauvegarde de l&apos;ordre…
                  </div>
                )}
                {filteredMembers.map((m, idx) => {
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx;
                  const canDrag = !search; // disable drag when filtering
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
                            {statusLabel(m.is_active)}
                          </span>
                          {m.is_promo && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                              Promo
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
                        <span className="text-xs text-neutral-500">Ordre</span>
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
                          {m.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <Link
                          href={`/admin/cast-members/${m.id}`}
                          className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                        >
                          Modifier
                        </Link>
                        <button
                          onClick={() => onDelete(m.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminCastMembersPage;
