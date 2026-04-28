import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';

type TwitchChannelRow = {
  id: string;
  channel: string;
  label: string;
  badge: string | null;
  description: string | null;
  background_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  items: TwitchChannelRow[];
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function statusLabel(isActive: boolean) {
  return isActive ? 'Actif' : 'Inactif';
}

function statusColor(isActive: boolean) {
  return isActive
    ? 'bg-emerald-600 text-white'
    : 'bg-neutral-600 text-neutral-100';
}

function AdminTwitchChannelsPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<TwitchChannelRow[]>([]);
  const [search, setSearch] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch(
        '/api/admin/twitch-channels?includeInactive=true',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json: ApiResponse = await res.json();

      setChannels(json.items || []);
    } catch (err) {
      console.error('Error fetching twitch channels', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer cette chaîne ?')) return;
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');
      const res = await fetch(`/api/admin/twitch-channels/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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

  const onToggleActive = async (channel: TwitchChannelRow) => {
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');
      const res = await fetch(`/api/admin/twitch-channels/${channel.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !channel.is_active }),
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
      const reordered = [...channels];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      const updates: { id: string; sortOrder: number }[] = [];
      reordered.forEach((c, i) => {
        if (c.sort_order !== i) {
          updates.push({ id: c.id, sortOrder: i });
        }
      });

      // Optimistic update
      setChannels(reordered.map((c, i) => ({ ...c, sort_order: i })));
      setDragIdx(null);
      setOverIdx(null);

      if (updates.length === 0) return;

      setSaving(true);
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('Session staff manquante.');

        await Promise.all(
          updates.map((u) =>
            fetch(`/api/admin/twitch-channels/${u.id}`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ sortOrder: u.sortOrder }),
            })
          )
        );
      } catch (err: unknown) {
        console.error('Reorder error', err);
        alert('Erreur lors de la sauvegarde de l\u2019ordre.');
        fetchData();
      } finally {
        setSaving(false);
      }
    },
    [channels, fetchData]
  );

  const filteredChannels = channels.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.channel.toLowerCase().includes(search.toLowerCase()) ||
      (c.badge && c.badge.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <Head>
        <title>Admin – Chaînes Twitch</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Chaînes Twitch partenaires
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {channels.length} chaîne{channels.length > 1 ? 's' : ''}{' '}
                  configurée{channels.length > 1 ? 's' : ''}
                </p>
              </div>

              <Link
                href="/admin/twitch-channels/new"
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
                Ajouter une chaîne
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
                  placeholder="Nom, chaîne ou badge..."
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Channels List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
                {search ? 'Aucune chaîne trouvée' : 'Aucune chaîne configurée'}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {saving && (
                  <div className="px-4 py-2 bg-purple-600/20 text-purple-300 text-xs text-center">
                    Sauvegarde de l&apos;ordre…
                  </div>
                )}
                {filteredChannels.map((c, idx) => {
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx;
                  const canDrag = !search;
                  return (
                    <div
                      key={c.id}
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
                        {c.background_url ? (
                          <Image
                            src={c.background_url}
                            alt={c.label}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center border border-purple-500/30">
                            <svg
                              className="w-6 h-6 text-purple-400"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-white group-hover:text-purple-400 transition-colors">
                            {c.label}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                              c.is_active
                            )}`}
                          >
                            {statusLabel(c.is_active)}
                          </span>
                          {c.badge && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30">
                              {c.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-400 mb-1">
                          <a
                            href={`https://twitch.tv/${c.channel}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-purple-400 transition-colors"
                          >
                            twitch.tv/{c.channel}
                          </a>
                        </p>
                        {c.description && (
                          <p className="text-sm text-neutral-300 truncate">
                            {c.description}
                          </p>
                        )}
                      </div>

                      {/* Sort order */}
                      <div className="flex-shrink-0 text-center">
                        <span className="text-xs text-neutral-500">Ordre</span>
                        <div className="text-lg font-bold text-neutral-300">
                          {c.sort_order}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => onToggleActive(c)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            c.is_active
                              ? 'border-amber-500/40 text-amber-300 hover:border-amber-400'
                              : 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                          }`}
                        >
                          {c.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <Link
                          href={`/admin/twitch-channels/${c.id}`}
                          className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                        >
                          Modifier
                        </Link>
                        <button
                          onClick={() => onDelete(c.id)}
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

export default AdminTwitchChannelsPage;
