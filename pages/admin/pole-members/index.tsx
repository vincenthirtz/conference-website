import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import {
  POLE_KEYS,
  POLE_LABELS,
  type PoleKey,
} from '@/utils/associationPoles';

import { logger } from '../../../utils/logger';

type PoleMemberRow = {
  id: string;
  pole_key: PoleKey;
  name: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  items: PoleMemberRow[];
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function statusColor(isActive: boolean) {
  return isActive
    ? 'bg-emerald-600 text-white'
    : 'bg-neutral-600 text-neutral-100';
}

function AdminPoleMembersPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<PoleMemberRow[]>([]);
  const [search, setSearch] = useState('');
  const [poleFilter, setPoleFilter] = useState<'all' | PoleKey>('all');
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const json = await adminFetchJson<ApiResponse>(
        '/api/admin/pole-members?includeInactive=true'
      );
      setMembers(json.items || []);
    } catch (err) {
      logger.error('Error fetching pole members', err);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Supprimer ce membre du pôle ?',
      variant: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/admin/pole-members/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Suppression impossible');
      }
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || 'Erreur de suppression.', 'error');
    }
  };

  const onToggleActive = async (member: PoleMemberRow) => {
    try {
      const res = await adminFetch(`/api/admin/pole-members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.is_active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Modification impossible');
      }
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || 'Erreur de modification.', 'error');
    }
  };

  const grouped = useMemo(() => {
    const filtered = members.filter((m) => {
      if (poleFilter !== 'all' && m.pole_key !== poleFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.title || '').toLowerCase().includes(q)
      );
    });
    const map = new Map<PoleKey, PoleMemberRow[]>();
    POLE_KEYS.forEach((k) => map.set(k, []));
    filtered.forEach((m) => {
      map.get(m.pole_key)?.push(m);
    });
    return map;
  }, [members, search, poleFilter]);

  return (
    <>
      {dialog}
      <Head>
        <title>Admin – Pôles de l&apos;asso</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Pôles de l&apos;association
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {members.length} membre{members.length > 1 ? 's' : ''} au
                  total — répartis sur {POLE_KEYS.length} pôles.
                </p>
              </div>

              <Link
                href="/admin/pole-members/new"
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
                Ajouter un membre
              </Link>
            </div>
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Recherche
                </label>
                <input
                  type="text"
                  placeholder="Nom ou rôle..."
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Pôle
                </label>
                <select
                  value={poleFilter}
                  onChange={(e) =>
                    setPoleFilter(e.target.value as 'all' | PoleKey)
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">Tous les pôles</option>
                  {POLE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {POLE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Grouped list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {POLE_KEYS.map((poleKey) => {
                const list = grouped.get(poleKey) ?? [];
                if (poleFilter !== 'all' && poleFilter !== poleKey) return null;
                return (
                  <section
                    key={poleKey}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden"
                  >
                    <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-700/50">
                      <h2 className="text-lg font-semibold">
                        {POLE_LABELS[poleKey]}
                      </h2>
                      <span className="text-xs text-neutral-400">
                        {list.length} membre{list.length > 1 ? 's' : ''}
                      </span>
                    </header>
                    {list.length === 0 ? (
                      <div className="px-6 py-10 text-center text-sm text-neutral-500">
                        Aucun membre dans ce pôle.
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-700/50">
                        {list.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group"
                          >
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
                                <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center border border-purple-500/30 text-purple-300 font-semibold">
                                  {m.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                            </div>

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
                                  {m.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              {m.title && (
                                <p className="text-sm text-neutral-400">
                                  {m.title}
                                </p>
                              )}
                              {m.link_url && (
                                <a
                                  href={m.link_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-purple-400 hover:underline"
                                >
                                  {m.link_url}
                                </a>
                              )}
                            </div>

                            <div className="flex-shrink-0 text-center">
                              <span className="text-xs text-neutral-500">
                                Ordre
                              </span>
                              <div className="text-lg font-bold text-neutral-300">
                                {m.sort_order}
                              </div>
                            </div>

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
                                href={`/admin/pole-members/${m.id}`}
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
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPoleMembersPage;
