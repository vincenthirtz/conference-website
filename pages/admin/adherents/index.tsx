import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminAdherentsList'>>;
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

function getPaymentStatusLabels(t: Dict): Record<string, string> {
  return {
    pending: t.statusPending,
    partial: t.statusPartial,
    paid: t.statusPaid,
    exempt: t.statusExempt,
    overdue: t.statusOverdue,
  };
}

const paymentStatusColors: Record<string, string> = {
  pending: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  partial: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
  paid: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
  exempt: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
  overdue: 'bg-red-600/20 text-red-300 border-red-500/30',
};

function getRoleLabels(t: Dict): Record<string, string> {
  return {
    member: t.roleMember,
    volunteer: t.roleVolunteer,
    board: t.roleBoard,
    president: t.rolePresident,
    treasurer: t.roleTreasurer,
    secretary: t.roleSecretary,
  };
}

function AdminAdherentsPage({ staff }: Props) {
  const t = useAdminT('adminAdherentsList');
  const paymentStatusLabels = getPaymentStatusLabels(t);
  const roleLabels = getRoleLabels(t);
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
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [cotisationAmount, setCotisationAmount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (paymentStatusFilter) params.set('paymentStatus', paymentStatusFilter);
      if (yearFilter) params.set('year', yearFilter);
      if (roleFilter) params.set('role', roleFilter);
      if (activeFilter) params.set('active', activeFilter);

      const json = await adminFetchJson<{
        items?: AdherentRow[];
        stats?: Stats;
        total?: number | null;
      }>(`/api/admin/adherents?${params.toString()}`);

      setAdherents(json.items || []);
      setStats(json.stats || null);
      setTotal(typeof json.total === 'number' ? json.total : null);

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
    activeFilter,
    offset,
    limit,
    adminFetchJson,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Réinitialise la pagination quand un filtre/recherche change.
  useEffect(() => {
    setOffset(0);
  }, [
    debouncedSearch,
    paymentStatusFilter,
    yearFilter,
    roleFilter,
    activeFilter,
  ]);

  const onDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: format(t.confirmDeleteTitle, { name }),
      variant: 'danger',
      confirmLabel: t.delete,
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/admin/adherents/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || t.errorDeleteFailed);
      }
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
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
        throw new Error(json?.error || t.errorUpdateFailed);
      }
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorUpdate, 'error');
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
        format(t.syncOk, {
          created: json.created,
          updated: json.updated,
          skipped: json.skipped,
        })
      );
      fetchData();
    } catch (err: unknown) {
      setSyncResult(
        format(t.syncError, { message: (err as Error)?.message ?? '' })
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      {dialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {format(
                    (total !== null ? total : adherents.length) > 1
                      ? t.countMembers_other
                      : t.countMembers_one,
                    { count: total !== null ? total : adherents.length }
                  )}
                  {cotisationAmount > 0 && (
                    <span className="ml-2">
                      •{' '}
                      {format(t.cotisationInfo, {
                        amount: cotisationAmount.toFixed(2),
                      })}
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
                  {syncing ? t.syncing : t.syncHelloAsso}
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
                  {t.newAdherent}
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
                <p className="text-neutral-400 text-sm">{t.statTotalActive}</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">
                  {format(t.statYear, { year: currentYear })}
                </p>
                <p className="text-2xl font-bold text-blue-400">
                  {stats.currentYear}
                </p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-emerald-700/30 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">{t.statPaid}</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {stats.paid}
                </p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-amber-700/30 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">{t.statPending}</p>
                <p className="text-2xl font-bold text-amber-400">
                  {stats.pending}
                </p>
              </div>
              <div className="bg-neutral-800/50 backdrop-blur border border-red-700/30 rounded-xl p-4">
                <p className="text-neutral-400 text-sm">{t.statOverdue}</p>
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
                  {t.filterSearch}
                </label>
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterPaymentStatus}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={paymentStatusFilter || ''}
                  onChange={(e) =>
                    setPaymentStatusFilter(e.target.value || null)
                  }
                >
                  <option value="">{t.paymentStatusAll}</option>
                  <option value="pending">{t.statusPending}</option>
                  <option value="partial">{t.statusPartial}</option>
                  <option value="paid">{t.statusPaid}</option>
                  <option value="exempt">{t.statusExempt}</option>
                  <option value="overdue">{t.statusOverdue}</option>
                </select>
              </div>

              <div className="min-w-[120px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterYear}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={yearFilter || ''}
                  onChange={(e) => setYearFilter(e.target.value || null)}
                >
                  <option value="">{t.yearAll}</option>
                  {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                    <option key={y} value={y.toString()}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterRole}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={roleFilter || ''}
                  onChange={(e) => setRoleFilter(e.target.value || null)}
                >
                  <option value="">{t.roleAll}</option>
                  <option value="member">{t.roleMember}</option>
                  <option value="volunteer">{t.roleVolunteer}</option>
                  <option value="board">{t.roleBoard}</option>
                  <option value="president">{t.rolePresident}</option>
                  <option value="treasurer">{t.roleTreasurer}</option>
                  <option value="secretary">{t.roleSecretary}</option>
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterActive}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={activeFilter || ''}
                  onChange={(e) => setActiveFilter(e.target.value || null)}
                >
                  <option value="">{t.activeAll}</option>
                  <option value="true">{t.activeYes}</option>
                  <option value="false">{t.activeNo}</option>
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
                {t.empty}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/50 border-b border-neutral-700/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colMemberNumber}
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colName}
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colEmail}
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colRole}
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colYear}
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colPayment}
                      </th>
                      <th className="text-left px-4 py-3 text-neutral-400 font-medium">
                        {t.colAmount}
                      </th>
                      <th className="text-right px-4 py-3 text-neutral-400 font-medium">
                        {t.colActions}
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
                                {t.inactiveTag}
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
                                  title={t.markPaidTitle}
                                >
                                  {t.markPaidShort}
                                </button>
                              )}
                            <Link
                              href={`/admin/adherents/${a.id}`}
                              className="px-2 py-1 rounded-lg border border-neutral-600 hover:border-neutral-500 text-xs transition-colors"
                            >
                              {t.edit}
                            </Link>
                            <button
                              onClick={() =>
                                onDelete(a.id, `${a.first_name} ${a.last_name}`)
                              }
                              className="px-2 py-1 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-xs transition-colors"
                            >
                              {t.deleteShort}
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

          {/* Pagination */}
          {adherents.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
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
                {t.previous}
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + adherents.length}
                {total !== null ? format(t.paginationTotal, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminAdherentsPage;
