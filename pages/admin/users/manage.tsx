import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
};

type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  team_memberships?: TeamMembership[];
};

export const getServerSideProps = withStaffPage('admin');

const ROLES = ['member', 'player', 'caster', 'manager', 'admin', 'owner'];

export default function ManageUsersPage({ staff }: { staff: StaffShape }) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  // Battle tag edit modal
  const [editingBattleTag, setEditingBattleTag] = useState<{
    userId: string;
    teamId: string;
    teamName: string;
    currentTag: string;
  } | null>(null);
  const [newBattleTag, setNewBattleTag] = useState('');
  const [battleTagSaving, setBattleTagSaving] = useState(false);
  const [battleTagError, setBattleTagError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const url = `/api/admin/users/manage?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur de chargement');
      setUsers(json.items || []);
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRole = async (userId: string, role: string) => {
    setUpdating(userId);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const res = await fetch('/api/admin/users/manage', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Mise à jour impossible.');
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role } : u
        )
      );
      setSuccessMsg('Rôle mis à jour');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la mise à jour du rôle.');
    } finally {
      setUpdating(null);
    }
  };

  const openBattleTagEdit = (
    userId: string,
    teamId: string,
    teamName: string,
    currentTag: string | null
  ) => {
    setEditingBattleTag({ userId, teamId, teamName, currentTag: currentTag || '' });
    setNewBattleTag(currentTag || '');
    setBattleTagError(null);
  };

  const saveBattleTag = async () => {
    if (!editingBattleTag) return;

    setBattleTagSaving(true);
    setBattleTagError(null);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const res = await fetch('/api/admin/users/manage', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: editingBattleTag.userId,
          teamId: editingBattleTag.teamId,
          battleTag: newBattleTag.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Mise à jour impossible.');
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === editingBattleTag.userId && u.team_memberships) {
            return {
              ...u,
              team_memberships: u.team_memberships.map((tm) =>
                tm.team_id === editingBattleTag.teamId
                  ? { ...tm, battle_tag: newBattleTag.trim() || null }
                  : tm
              ),
            };
          }
          return u;
        })
      );

      setEditingBattleTag(null);
      setSuccessMsg('BattleTag mis à jour');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setBattleTagError(err?.message || 'Erreur inattendue');
    } finally {
      setBattleTagSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Gestion des inscrits</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
              Gestion des inscrits
            </h1>
            <p className="text-sm text-neutral-400 mt-2">
              Modifier le rôle des comptes et gérer les BattleTags des membres d&apos;équipe.
            </p>
          </div>

          {/* Messages */}
          {error && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMsg}
            </div>
          )}

          {/* Search */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
                placeholder="Recherche email / nom / rôle / BattleTag"
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-neutral-800/50 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <button
              onClick={load}
              className="px-4 py-2 text-sm rounded-lg bg-neutral-700 hover:bg-neutral-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recharger
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-900/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-neutral-300">Email</th>
                      <th className="text-left px-4 py-3 font-semibold text-neutral-300">Nom</th>
                      <th className="text-left px-4 py-3 font-semibold text-neutral-300">Rôle</th>
                      <th className="text-left px-4 py-3 font-semibold text-neutral-300">Équipes & BattleTags</th>
                      <th className="text-left px-4 py-3 font-semibold text-neutral-300">Créé le</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-neutral-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-neutral-300">{u.email}</span>
                        </td>
                        <td className="px-4 py-3 text-neutral-200">
                          {u.display_name || <span className="text-neutral-500">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role || 'member'}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            disabled={updating === u.id}
                            className="bg-neutral-700 border border-neutral-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {u.team_memberships && u.team_memberships.length > 0 ? (
                            <div className="space-y-1">
                              {u.team_memberships.map((tm) => (
                                <div
                                  key={tm.team_id}
                                  className="flex items-center gap-2 flex-wrap"
                                >
                                  <Link
                                    href={`/admin/teams/${tm.team_id}/edit`}
                                    className="text-xs text-blue-400 hover:text-blue-300 truncate max-w-[100px]"
                                  >
                                    {tm.team_name}
                                  </Link>
                                  <span className="text-neutral-500 text-xs">•</span>
                                  {tm.battle_tag ? (
                                    <button
                                      onClick={() =>
                                        openBattleTagEdit(u.id, tm.team_id, tm.team_name, tm.battle_tag)
                                      }
                                      className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs hover:bg-emerald-600/30 transition-colors"
                                    >
                                      {tm.battle_tag}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        openBattleTagEdit(u.id, tm.team_id, tm.team_name, null)
                                      }
                                      className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30 text-xs hover:bg-red-600/30 transition-colors"
                                    >
                                      BattleTag manquant
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-neutral-500 text-xs">Aucune équipe</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-400 text-xs">
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString('fr-FR')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {users.length === 0 && (
                <div className="text-center py-12 text-neutral-400">
                  Aucun utilisateur trouvé
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-sm text-neutral-500">
            {users.length} utilisateur{users.length > 1 ? 's' : ''} affiché{users.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Battle Tag Edit Modal */}
      {editingBattleTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-2">Modifier le BattleTag</h3>
            <p className="text-sm text-neutral-400 mb-4">
              Équipe : <span className="text-white">{editingBattleTag.teamName}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">BattleTag</label>
                <input
                  type="text"
                  value={newBattleTag}
                  onChange={(e) => setNewBattleTag(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Pseudo#1234"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Format : Pseudo#0000 (alphanumérique + # + 3 à 6 chiffres)
                </p>
              </div>

              {battleTagError && (
                <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
                  {battleTagError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditingBattleTag(null)}
                className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveBattleTag}
                disabled={battleTagSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {battleTagSaving && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {battleTagSaving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
