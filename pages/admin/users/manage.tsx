import { useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  staff_role?: string | null;
};

export const getServerSideProps = withStaffPage('admin');

const ROLES = ['member', 'player', 'helper', 'caster', 'referee', 'manager', 'admin', 'owner'];
const STAFF_ROLES = ['helper', 'caster', 'referee', 'manager', 'admin', 'owner'];

export default function ManageUsersPage({ staff }: { staff: StaffShape }) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

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

  const changeRole = async (userId: string, role: string, staffRole?: string) => {
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
        body: JSON.stringify({ userId, role, staffRole }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Mise à jour impossible.');
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role, staff_role: staffRole ?? u.staff_role } : u
        )
      );
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la mise à jour du rôle.');
    } finally {
      setUpdating(null);
    }
  };

  const filtered = users;

  return (
    <>
      <Head>
        <title>Admin – Gestion des inscrits</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl font-bold mt-1">Gestion des inscrits</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Modifier le rôle des nouveaux comptes (default: member).
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </header>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Recherche email / nom / rôle"
            className="rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="px-3 py-2 text-sm rounded-lg border border-white/20 hover:border-white/40"
          >
            Recharger
          </button>
          {error && <span className="text-sm text-red-200">{error}</span>}
        </div>

        {loading ? (
          <div className="text-neutral-300">Chargement…</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Nom</th>
                  <th className="text-left px-4 py-2">Rôle</th>
                  <th className="text-left px-4 py-2">Staff (optionnel)</th>
                  <th className="text-left px-4 py-2">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-2 text-neutral-200">
                      {u.display_name || '—'}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={u.role || 'member'}
                        onChange={(e) =>
                          changeRole(u.id, e.target.value, u.staff_role || undefined)
                        }
                        disabled={updating === u.id}
                        className="bg-neutral-800 border border-white/10 rounded px-2 py-1 text-sm"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        defaultValue=""
                        onChange={(e) =>
                          changeRole(
                            u.id,
                            u.role || 'member',
                            e.target.value || undefined
                          )
                        }
                        disabled={updating === u.id}
                        className="bg-neutral-800 border border-white/10 rounded px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        {STAFF_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-neutral-400">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleString('fr-FR')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
