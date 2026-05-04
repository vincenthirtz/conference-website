import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useDebounce } from '@/hooks/useDebounce';
import { useAdminFetch } from '@/hooks/useAdminFetch';

import { logger } from '../../../utils/logger';
type AdherentRow = {
  id: string;
  member_number: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  join_date: string;
  current_year: number;
  payment_status: 'pending' | 'partial' | 'paid' | 'exempt' | 'overdue';
  payment_amount: number;
  payment_date: string | null;
  payment_method: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
};

type Stats = {
  total: number;
  currentYear: number;
  paid: number;
  pending: number;
  overdue: number;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

const paymentStatusLabels: Record<string, string> = {
  pending: 'En attente',
  partial: 'Partiel',
  paid: 'Payé',
  exempt: 'Exempté',
  overdue: 'En retard',
};

const paymentStatusColors: Record<string, string> = {
  pending: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  partial: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
  paid: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
  exempt: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
  overdue: 'bg-red-600/20 text-red-300 border-red-500/30',
};

const roleLabels: Record<string, string> = {
  member: 'Membre',
  volunteer: 'Bénévole',
  board: 'Bureau',
  president: 'Président(e)',
  treasurer: 'Trésorier(ère)',
  secretary: 'Secrétaire',
};

function AdminAdherentsPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [adherents, setAdherents] = useState<AdherentRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | null>(
    null
  );
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [cotisationAmount, setCotisationAmount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (paymentStatusFilter) params.set('paymentStatus', paymentStatusFilter);
      if (yearFilter) params.set('year', yearFilter);
      if (roleFilter) params.set('role', roleFilter);

      const json = await adminFetchJson<{
        items?: AdherentRow[];
        stats?: Stats;
      }>(`/api/admin/adherents?${params.toString()}`);

      setAdherents(json.items || []);
      setStats(json.stats || null);

      // Récupérer le montant de cotisation
      const settingsJson = await adminFetchJson<{
        items?: { key: string; value: string }[];
      }>('/api/admin/site-settings');
      const cotisation = settingsJson.items?.find(
        (s: { key: string }) => s.key === 'cotisation_amount'
      );
      if (cotisation?.value) {
        setCotisationAmount(parseFloat(cotisation.value) || 0);
      }
    } catch (err) {
      logger.error('Error fetching adherents', err);
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    paymentStatusFilter,
    yearFilter,
    roleFilter,
    adminFetchJson,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer l'adhérent "${name}" ?`)) return;
    try {
      const res = await adminFetch(`/api/admin/adherents/${id}`, {
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

  const updatePaymentStatus = async (
    id: string,
    newStatus: string,
    isPaid: boolean
  ) => {
    try {
      const payload: Record<string, unknown> = {
        paymentStatus: newStatus,
      };

      if (isPaid) {
        payload.paymentAmount = cotisationAmount;
        payload.paymentDate = new Date().toISOString().split('T')[0];
      }

      const res = await adminFetch(`/api/admin/adherents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
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

  const syncHelloAsso = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const json = await adminFetchJson<{
        created: number;
        updated: number;
        skipped: number;
      }>('/api/admin/helloasso/sync?formSlug=adhesion-2026-2027-women-s-cup', {
        method: 'POST',
      });

      setSyncResult(
        `Sync OK : ${json.created} créé(s), ${json.updated} mis à jour, ${json.skipped} déjà sync.`
      );
      fetchData();
    } catch (err: unknown) {
      setSyncResult(`Erreur : ${(err as Error)?.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin - Adhérents</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Gestion des adhérents
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {adherents.length} adhérent{adherents.length > 1 ? 's' : ''}
                  {cotisationAmount > 0 && (
                    <span className="ml-2">
                      • Cotisation : {cotisationAmount.toFixed(2)} €
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={syncHelloAsso}
                  disabled={syncing}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {syncing ? 'Sync...' : 'Sync HelloAsso'}
                </button>
                <Link
                  href="/admin/adherents/new"
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
                  Nouvel adhérent
                </Link>
              </div>
            </div>
          </div>

          {/* Sync result */}
          {syncResult && (
            <div
              className={`mb-6 rounded-xl border p-4 text-sm ${
                syncResult.startsWith('Erreur')
                  ? 'border-red-500/30 bg-red-600/10 text-red-300'
                  : 'border-emerald-500/30 bg-emerald-600/10 text-emerald-300'
              }`}
            >
              {syncResult}
            </div>
          )}

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">Total actifs</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">Année {currentYear}</p>
                <p className="text-2xl font-bold text-blue-400">
                  {stats.currentYear}
                </p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-emerald-700/30 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">Payés</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {stats.paid}
                </p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-amber-700/30 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">En attente</p>
                <p className="text-2xl font-bold text-amber-400">
                  {stats.pending}
                </p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-red-700/30 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">En retard</p>
                <p className="text-2xl font-bold text-red-400">
                  {stats.overdue}
                </p>
              </div>
            </div>
          )}

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="flex gap-4 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Recherche
                </label>
                <input
                  type="text"
                  placeholder="Nom, prénom, email ou n° adhérent..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut paiement
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={paymentStatusFilter || ''}
                  onChange={(e) =>
                    setPaymentStatusFilter(e.target.value || null)
                  }
                >
                  <option value="">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="partial">Partiel</option>
                  <option value="paid">Payé</option>
                  <option value="exempt">Exempté</option>
                  <option value="overdue">En retard</option>
                </select>
              </div>

              <div className="min-w-[120px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Année
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={yearFilter || ''}
                  onChange={(e) => setYearFilter(e.target.value || null)}
                >
                  <option value="">Toutes</option>
                  {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                    <option key={y} value={y.toString()}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Rôle
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={roleFilter || ''}
                  onChange={(e) => setRoleFilter(e.target.value || null)}
                >
                  <option value="">Tous les rôles</option>
                  <option value="member">Membre</option>
                  <option value="volunteer">Bénévole</option>
                  <option value="board">Bureau</option>
                  <option value="president">Président(e)</option>
                  <option value="treasurer">Trésorier(ère)</option>
                  <option value="secretary">Secrétaire</option>
                </select>
              </div>
            </div>
          </section>

          {/* Adherents List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : adherents.length === 0 ? (
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Aucun adhérent trouvé
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 border-b border-neutral-700/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        N° Adhérent
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        Nom
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        Rôle
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        Année
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        Paiement
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        Montant
                      </th>
                      <th className="text-right px-4 py-3 text-neutral-400 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {adherents.map((a) => (
                      <tr
                        key={a.id}
                        className={`hover:bg-neutral-700/30 transition-colors ${
                          !a.is_active ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-neutral-300">
                            {a.member_number || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="font-medium text-white">
                              {a.last_name} {a.first_name}
                            </span>
                            {!a.is_active && (
                              <span className="ml-2 text-xs text-neutral-500">
                                (inactif)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-400">
                          {a.email}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-neutral-300">
                            {roleLabels[a.role] || a.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          {a.current_year}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${
                              paymentStatusColors[a.payment_status]
                            }`}
                          >
                            {paymentStatusLabels[a.payment_status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-neutral-300">
                            {a.payment_amount.toFixed(2)} €
                            {cotisationAmount > 0 &&
                              a.payment_status !== 'paid' && (
                                <span className="text-neutral-500 text-xs ml-1">
                                  / {cotisationAmount.toFixed(2)} €
                                </span>
                              )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {a.payment_status !== 'paid' &&
                              a.payment_status !== 'exempt' && (
                                <button
                                  onClick={() =>
                                    updatePaymentStatus(a.id, 'paid', true)
                                  }
                                  className="px-2 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 hover:border-emerald-400 text-xs transition-colors"
                                  title="Marquer comme payé"
                                >
                                  Payé
                                </button>
                              )}
                            <Link
                              href={`/admin/adherents/${a.id}`}
                              className="px-2 py-1 rounded-lg border border-neutral-600 hover:border-neutral-500 text-xs transition-colors"
                            >
                              Modifier
                            </Link>
                            <button
                              onClick={() =>
                                onDelete(a.id, `${a.first_name} ${a.last_name}`)
                              }
                              className="px-2 py-1 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-xs transition-colors"
                            >
                              Suppr.
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminAdherentsPage;
