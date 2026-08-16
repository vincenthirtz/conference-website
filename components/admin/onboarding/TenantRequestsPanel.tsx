// components/admin/onboarding/TenantRequestsPanel.tsx
//
// "Demandes de tenant" tab of the merged /admin/onboarding hub (owner-only tab).
// Extracted from the former /admin/tenant-requests page — the host
// (pages/admin/onboarding/index.tsx) only renders this panel when the calling
// staff is an owner, and passes down the SSR-resolved Discord snowflake used
// for the "Toi" badge.
//
// The self-service onboarding flow (cf. database/migrations/create_tenant_requests_table.sql)
// auto-approves successful requests via /api/onboard/* + /api/bot/v1/tenants/link-guild.
// This panel gives the owner a queue view to:
//   - monitor pending requests (pending_email_verification, pending_bot_invite),
//   - audit completed requests (with a deep-link to the created tenant),
//   - manually reject (anti-spam) or expire (stale) requests still in flight.
//
// Data fetching uses the shared admin hooks (`useAdminFetch` / `useIdempotentMutation`)
// so auth + idempotency are handled centrally.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import AlertBanner from '@/components/admin/AlertBanner';
import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { logger } from '@/utils/logger';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantRequestsList from '@/lib/i18n/locales/admin-fr/adminTenantRequestsList';

type Dict = typeof nsAdminTenantRequestsList.fr;

type TenantRequestStatus =
  | 'pending_email_verification'
  | 'pending_bot_invite'
  | 'completed'
  | 'rejected'
  | 'expired';

type TenantRequestRow = {
  id: string;
  status: TenantRequestStatus;
  requestedSlug: string;
  requestedName: string;
  requesterEmail: string;
  requesterDiscordUserId: string;
  requesterDiscordDisplayName: string | null;
  createdAt: string;
  createdTenantId: string | null;
  createdGuildId: string | null;
  rejectionReason: string | null;
};

type ListResponse = {
  requests: TenantRequestRow[];
  total: number;
  limit: number;
  offset: number;
};

type StatusFilter = TenantRequestStatus | 'all';

type Props = {
  /** Discord snowflake of the calling staff, resolved server-side. Best-effort. */
  currentStaffDiscordId: string | null;
};

const PAGE_SIZE = 20;

function getStatusTabs(
  t: Dict
): ReadonlyArray<{ value: StatusFilter; label: string }> {
  return [
    { value: 'all', label: t.tabAll },
    { value: 'pending_email_verification', label: t.tabEmailVerif },
    { value: 'pending_bot_invite', label: t.tabBotInvite },
    { value: 'completed', label: t.tabCompleted },
    { value: 'rejected', label: t.tabRejected },
    { value: 'expired', label: t.tabExpired },
  ];
}

function getStatusBadge(
  t: Dict
): Record<TenantRequestStatus, { label: string; className: string }> {
  return {
    pending_email_verification: {
      label: t.badgeEmailVerif,
      className: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    },
    pending_bot_invite: {
      label: t.badgeBotInvite,
      className: 'bg-blue-500/15 text-blue-200 border-blue-500/30',
    },
    completed: {
      label: t.badgeCompleted,
      className: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    },
    rejected: {
      label: t.badgeRejected,
      className: 'bg-red-500/15 text-red-200 border-red-500/30',
    },
    expired: {
      label: t.badgeExpired,
      className: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
    },
  };
}

function isPending(status: TenantRequestStatus): boolean {
  return (
    status === 'pending_email_verification' || status === 'pending_bot_invite'
  );
}

function formatDateTime(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export default function TenantRequestsPanel({ currentStaffDiscordId }: Props) {
  const t = useAdminT(nsAdminTenantRequestsList);
  const STATUS_TABS = getStatusTabs(t);
  const STATUS_BADGE = getStatusBadge(t);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson, regenerate } = useIdempotentMutation();
  const { addToast } = useToast();

  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Reject modal state.
  const [rejectTarget, setRejectTarget] = useState<TenantRequestRow | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  // Expire confirm state.
  const [expireTarget, setExpireTarget] = useState<TenantRequestRow | null>(
    null
  );
  const [expireError, setExpireError] = useState<string | null>(null);
  const [expireLoading, setExpireLoading] = useState(false);

  const fetchPage = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const json = await adminFetchJson<ListResponse>(
        `/api/admin/tenant-requests?${params.toString()}`
      );
      setData(json);
    } catch (err) {
      logger.error('AdminTenantRequestsPage: fetch error', err);
      setError((err as Error)?.message || t.errorLoad);
    } finally {
      setRefreshing(false);
    }
  }, [adminFetchJson, status, offset, t]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Reset offset when status filter changes.
  const onChangeStatus = useCallback((next: StatusFilter) => {
    setStatus(next);
    setOffset(0);
  }, []);

  const visibleRequests = data?.requests ?? [];
  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + visibleRequests.length, total);
  const hasPrev = offset > 0;
  const hasNext = offset + visibleRequests.length < total;

  const openReject = useCallback(
    (row: TenantRequestRow) => {
      setRejectTarget(row);
      setRejectReason('');
      setRejectError(null);
      regenerate();
    },
    [regenerate]
  );

  const closeReject = useCallback(() => {
    if (rejectLoading) return;
    setRejectTarget(null);
    setRejectReason('');
    setRejectError(null);
  }, [rejectLoading]);

  const submitReject = useCallback(async () => {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 1 || trimmed.length > 500) {
      setRejectError(t.errorReasonLength);
      return;
    }
    setRejectLoading(true);
    setRejectError(null);
    try {
      await mutateJson(`/api/admin/tenant-requests/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: trimmed }),
      });
      addToast(t.toastRejected, 'success');
      setRejectTarget(null);
      setRejectReason('');
      await fetchPage();
    } catch (err) {
      logger.error('AdminTenantRequestsPage: reject error', err);
      setRejectError((err as Error)?.message || t.errorReject);
    } finally {
      setRejectLoading(false);
    }
  }, [rejectTarget, rejectReason, mutateJson, addToast, fetchPage, t]);

  const openExpire = useCallback(
    (row: TenantRequestRow) => {
      setExpireTarget(row);
      setExpireError(null);
      regenerate();
    },
    [regenerate]
  );

  const closeExpire = useCallback(() => {
    if (expireLoading) return;
    setExpireTarget(null);
    setExpireError(null);
  }, [expireLoading]);

  const submitExpire = useCallback(async () => {
    if (!expireTarget) return;
    setExpireLoading(true);
    setExpireError(null);
    try {
      await mutateJson(`/api/admin/tenant-requests/${expireTarget.id}/expire`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      addToast(t.toastExpired, 'success');
      setExpireTarget(null);
      await fetchPage();
    } catch (err) {
      logger.error('AdminTenantRequestsPage: expire error', err);
      setExpireError((err as Error)?.message || t.errorExpire);
    } finally {
      setExpireLoading(false);
    }
  }, [expireTarget, mutateJson, addToast, fetchPage, t]);

  const summary = useMemo(() => {
    if (data === null) return t.summaryLoading;
    if (total === 0) return t.summaryEmpty;
    return format(t.summaryRange, {
      start: pageStart,
      end: pageEnd,
      total,
    });
  }, [data, total, pageStart, pageEnd, t]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {t.heading}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            {t.subtitle}
            {summary}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchPage}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl border border-neutral-700 hover:border-neutral-500 text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          data-testid="tenant-requests-refresh"
        >
          {refreshing ? t.refreshing : t.refresh}
        </button>
      </div>

      <AlertBanner message={error} className="mb-4" />

      {/* Filter tabs */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-2 mb-6 flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChangeStatus(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === tab.value
                ? 'bg-purple-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            data-testid={`status-tab-${tab.value}`}
          >
            {tab.label}
          </button>
        ))}
      </section>

      {/* List */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        {data === null ? (
          <div className="py-16">
            <LoadingSpinner label={t.loadingRequests} />
          </div>
        ) : visibleRequests.length === 0 ? (
          <EmptyState
            title={t.emptyTitle}
            description={status === 'all' ? t.emptyDescAll : t.emptyDescFilter}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colStatus}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colSlug}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colName}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colEmail}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colDiscord}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colCreated}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colTenant}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {t.colActions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700/50">
                {visibleRequests.map((row) => {
                  const badge = STATUS_BADGE[row.status];
                  const pending = isPending(row.status);
                  const isSelf =
                    currentStaffDiscordId !== null &&
                    row.requesterDiscordUserId === currentStaffDiscordId;
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-neutral-700/30 transition-colors"
                      data-testid={`tenant-request-row-${row.id}`}
                    >
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {row.rejectionReason && (
                          <p
                            className="mt-1 text-[11px] text-red-300/80 max-w-[180px]"
                            title={row.rejectionReason}
                          >
                            {row.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-purple-300 align-top">
                        {row.requestedSlug}
                      </td>
                      <td className="px-4 py-3 font-medium text-white align-top">
                        {row.requestedName}
                      </td>
                      <td className="px-4 py-3 text-neutral-300 text-xs align-top">
                        {row.requesterEmail}
                      </td>
                      <td className="px-4 py-3 text-neutral-300 text-xs align-top">
                        <div className="flex flex-col gap-0.5">
                          <span>
                            {row.requesterDiscordDisplayName ?? '—'}
                            {isSelf && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-200 text-[10px] font-semibold uppercase">
                                {t.selfBadge}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[11px] text-neutral-500">
                            {row.requesterDiscordUserId}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 text-xs align-top">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {row.createdTenantId ? (
                          <Link
                            href={`/admin/tenants/${row.createdTenantId}`}
                            className="text-emerald-300 hover:text-emerald-200 text-xs font-medium underline decoration-dotted underline-offset-4"
                          >
                            {t.viewTenant}
                          </Link>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end gap-2">
                          {pending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openReject(row)}
                                className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs font-medium transition-colors"
                                data-testid={`reject-${row.id}`}
                              >
                                {t.reject}
                              </button>
                              <button
                                type="button"
                                onClick={() => openExpire(row)}
                                className="px-3 py-1.5 rounded-lg border border-neutral-600 text-neutral-200 hover:bg-neutral-700 text-xs font-medium transition-colors"
                                data-testid={`expire-${row.id}`}
                              >
                                {t.expire}
                              </button>
                            </>
                          ) : (
                            <span className="text-neutral-600 text-xs italic">
                              {t.readOnly}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      {data !== null && total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
          <span>{summary}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={!hasPrev || refreshing}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
              data-testid="pagination-prev"
            >
              {t.prev}
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={!hasNext || refreshing}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
              data-testid="pagination-next"
            >
              {t.next}
            </button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <ConfirmDialog
          title={t.rejectTitle}
          subtitle={`${rejectTarget.requestedName} (${rejectTarget.requestedSlug})`}
          loading={rejectLoading}
          variant="danger"
          confirmLabel={t.rejectConfirm}
          confirmingLabel={t.rejecting}
          cancelLabel={t.cancel}
          onCancel={closeReject}
          onConfirm={submitReject}
          errorMsg={rejectError}
        >
          <label
            htmlFor="reject-reason"
            className="block text-xs uppercase tracking-wider text-neutral-400 mb-1"
          >
            {t.rejectReasonLabel}
          </label>
          <textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder={t.rejectReasonPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            data-testid="reject-reason-input"
            disabled={rejectLoading}
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            {format(t.rejectCounter, { count: rejectReason.trim().length })}
          </p>
        </ConfirmDialog>
      )}

      {/* Expire confirm */}
      {expireTarget && (
        <ConfirmDialog
          title={t.expireTitle}
          subtitle={`${expireTarget.requestedName} (${expireTarget.requestedSlug})`}
          loading={expireLoading}
          variant="warning"
          confirmLabel={t.expireConfirm}
          confirmingLabel={t.expiring}
          cancelLabel={t.cancel}
          onCancel={closeExpire}
          onConfirm={submitExpire}
          errorMsg={expireError}
        >
          <p className="text-sm text-neutral-300">
            {t.expireBodyBefore}
            <strong>expired</strong>
            {t.expireBodyAfter}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
