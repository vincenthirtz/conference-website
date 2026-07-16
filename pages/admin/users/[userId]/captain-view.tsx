// pages/admin/users/[userId]/captain-view.tsx
//
// Admin "Vue capitaine" — per-captain COMMAND CENTER. Staff browse a read-only
// snapshot of the team a target user CAPTAINS (roster, join requests, pending
// scrims, demande history) AND can act on the two flows that make sense at
// captain level:
//   - approve / reject a pending JOIN demande  → POST /api/admin/demandes
//   - promote a roster member to captain       → POST /api/admin/users/[id]/actions
// Everything else (recruiting/scrim toggles, roster edits, scrim answers) is
// READ-ONLY in v1. Snapshot comes from
//   GET /api/admin/users/[userId]/captain-view
// Page gated at `manager`; every action refetches the snapshot. Mirrors the
// structure / atoms / Tailwind of player-view.tsx.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { AdminCaptainViewPayload } from '@/pages/api/admin/users/[userId]/captain-view';

import { logger } from '../../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminUserCaptainView'>>;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage('manager');

type TabKey = 'team' | 'joinRequests' | 'scrims' | 'history';

function getTabs(t: Dict): Array<{ key: TabKey; label: string }> {
  return [
    { key: 'team', label: t.tabEquipe },
    { key: 'joinRequests', label: t.tabJoinRequests },
    { key: 'scrims', label: t.tabScrims },
    { key: 'history', label: t.tabHistory },
  ];
}

type Member = NonNullable<AdminCaptainViewPayload['team']>['members'][number];
type JoinRequest = AdminCaptainViewPayload['joinRequests'][number];
type Scrim = AdminCaptainViewPayload['pendingScrims'][number];
type Demande = AdminCaptainViewPayload['demandes'][number];

/* ----------------------------------------------------------------------- */
/* Helpers (pure presentation)                                              */
/* ----------------------------------------------------------------------- */

function roleLabel(t: Dict, role: string | null): string {
  switch (role?.toLowerCase()) {
    case 'owner':
      return t.roleOwner;
    case 'admin':
      return t.roleAdmin;
    case 'manager':
      return t.roleManager;
    case 'caster':
      return t.roleCaster;
    case 'player':
      return t.rolePlayer;
    case 'member':
      return t.roleMember;
    default:
      return role ?? t.roleMember;
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function initials(name: string | null, email: string | null): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function roleBadgeClass(role: string | null): string {
  const r = role?.toLowerCase();
  if (r === 'owner' || r === 'admin')
    return 'bg-purple-600/20 text-purple-200 border border-purple-500/30';
  if (r === 'manager' || r === 'caster')
    return 'bg-sky-600/20 text-sky-200 border border-sky-500/30';
  return 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/30';
}

const DEMANDE_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
  cancelled: 'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30',
};

function getDemandeTypeLabels(t: Dict): Record<string, string> {
  return {
    captain_request: t.demandeTypeCaptainRequest,
    join: t.demandeTypeJoin,
    leave: t.demandeTypeLeave,
    transfer: t.demandeTypeTransfer,
    scrim: t.demandeTypeScrim,
    other: t.demandeTypeOther,
  };
}

function getDemandeStatusLabels(t: Dict): Record<string, string> {
  return {
    pending: t.demandeStatusPending,
    approved: t.demandeStatusApproved,
    rejected: t.demandeStatusRejected,
    cancelled: t.demandeStatusCancelled,
  };
}

/* ----------------------------------------------------------------------- */
/* Small presentational atoms                                               */
/* ----------------------------------------------------------------------- */

function RoleBadge({ t, role }: { t: Dict; role: string | null }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeClass(
        role
      )}`}
    >
      {roleLabel(t, role)}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-8 text-center text-neutral-400">
      {children}
    </div>
  );
}

/** Compact, clickable KPI used in the identity summary strip. */
function StatPill({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
        value > 0
          ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
          : 'border-neutral-700/60 bg-neutral-800/60 hover:bg-neutral-700/60'
      }`}
    >
      <span className="text-lg font-bold text-white tabular-nums leading-none">
        {value}
      </span>
      <span className="text-xs text-neutral-300 leading-tight">{label}</span>
    </button>
  );
}

/** Read-only open/closed status chip. */
function StateChip({
  label,
  open,
  openText,
  closedText,
}: {
  label: string;
  open: boolean;
  openText: string;
  closedText: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          open
            ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/30'
            : 'bg-neutral-600/20 text-neutral-300 border border-neutral-500/30'
        }`}
      >
        {open ? openText : closedText}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                      */
/* ----------------------------------------------------------------------- */

function CaptainViewPage({ staff: _staff }: { staff: StaffShape }) {
  const t = useAdminT('adminUserCaptainView');
  const router = useRouter();
  const rawUserId = router.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [data, setData] = useState<AdminCaptainViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>('team');

  // Per-action busy flag (keeps buttons from double-submitting).
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const json = await adminFetchJson<AdminCaptainViewPayload>(
        `/api/admin/users/${encodeURIComponent(userId)}/captain-view`
      );
      setData(json);
    } catch (err) {
      logger.error('[admin/captain-view] load error:', err);
      if (err instanceof AdminFetchError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(t.loadError);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, adminFetchJson, t]);

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [router.isReady, load]);

  const headerName =
    data?.user.displayName || data?.user.email || t.defaultUser;

  /* --------------------------------------------------------------------- */
  /* Actions — each reuses an existing endpoint then refetches the snapshot */
  /* --------------------------------------------------------------------- */

  // POST /api/admin/users/[memberUserId]/actions — assign_captain (promote a
  // roster member; the target is the MEMBER's userId, not the current captain).
  const promoteMember = useCallback(
    async (member: Member) => {
      if (!member.userId || !data?.team) return;
      const memberName = member.displayName || t.noName;
      const ok = await confirm({
        title: t.confirmCaptainTitle,
        subtitle: format(t.confirmCaptainSubtitle, {
          name: memberName,
          team: data.team.name,
        }),
        variant: 'warning',
        confirmLabel: t.confirmCaptainBtn,
      });
      if (!ok) return;
      setBusy(`captain-${member.id}`);
      try {
        await adminFetchJson(
          `/api/admin/users/${encodeURIComponent(member.userId)}/actions`,
          {
            method: 'POST',
            body: JSON.stringify({ action: 'assign_captain' }),
          }
        );
        addToast(t.toastCaptainTransferred, 'success');
        await load();
      } catch (err) {
        addToast((err as Error)?.message || t.errCaptainAssign, 'error');
      } finally {
        setBusy(null);
      }
    },
    [data?.team, confirm, adminFetchJson, addToast, load, t]
  );

  // POST /api/admin/demandes — approve / reject a pending join demande.
  const processDemande = useCallback(
    async (demandeId: string, newStatus: 'approved' | 'rejected') => {
      const verb = newStatus === 'approved' ? t.verbApprove : t.verbReject;
      const ok = await confirm({
        title: format(t.confirmDemandeTitle, { verb }),
        variant: newStatus === 'approved' ? 'info' : 'warning',
        confirmLabel: verb,
      });
      if (!ok) return;
      setBusy(`demande-${demandeId}`);
      try {
        await adminFetchJson('/api/admin/demandes', {
          method: 'POST',
          body: JSON.stringify({
            action: 'updateStatus',
            demandeIds: [demandeId],
            newStatus,
          }),
        });
        addToast(
          newStatus === 'approved'
            ? t.toastDemandeApproved
            : t.toastDemandeRejected,
          'success'
        );
        await load();
      } catch (err) {
        addToast((err as Error)?.message || t.errDemandeProcess, 'error');
      } finally {
        setBusy(null);
      }
    },
    [confirm, adminFetchJson, addToast, load, t]
  );

  const memberCount = data?.team?.members.length ?? 0;
  const joinRequestCount = data?.joinRequests.length ?? 0;
  const scrimCount = data?.pendingScrims.length ?? 0;

  const demandeTypeLabels = useMemo(() => getDemandeTypeLabels(t), [t]);
  const demandeStatusLabels = useMemo(() => getDemandeStatusLabels(t), [t]);

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{format(t.headTitle, { name: headerName })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Back link + cross-link to the player view */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/users/manage"
              className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              {t.backLink}
            </Link>
            {userId && (
              <Link
                href={`/admin/users/${encodeURIComponent(userId)}/player-view`}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700/60 hover:text-white transition-colors"
              >
                {t.viewPlayerLink}
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
              </Link>
            )}
          </div>

          {/* Admin command-center banner */}
          <div
            role="status"
            className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-emerald-300 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-emerald-100">
                  {format(t.bannerTitle, { name: headerName })}
                </h1>
                <p className="text-sm text-emerald-100/80 mt-1">
                  {t.bannerDescBefore}
                  <strong>{t.bannerDescStrong}</strong>
                  {t.bannerDescAfter}
                </p>
              </div>
            </div>
          </div>

          {/* States */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 rounded-xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
            </div>
          ) : notFound ? (
            <EmptyState>
              <p className="text-lg font-semibold text-white">
                {t.notFoundTitle}
              </p>
              <p className="mt-2 text-sm">{t.notFoundDesc}</p>
            </EmptyState>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100"
            >
              {error}
            </div>
          ) : data ? (
            <>
              {/* Identity summary — quick glance, visible on every tab */}
              <div
                aria-label={t.identitySummaryLabel}
                className="mb-6 rounded-2xl border border-neutral-700/60 bg-neutral-800/40 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Who */}
                  <div className="flex items-center gap-3 min-w-0">
                    {data.user.avatarUrl ? (
                      <Image
                        src={data.user.avatarUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-xl object-cover border border-neutral-700 flex-shrink-0"
                        unoptimized
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-base font-bold text-emerald-200 flex-shrink-0">
                        {initials(data.user.displayName, data.user.email)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">
                          {data.user.displayName || t.noName}
                        </span>
                        <RoleBadge t={t} role={data.user.role} />
                      </div>
                      {data.team && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {data.team.logoUrl ? (
                            <Image
                              src={data.team.logoUrl}
                              alt=""
                              width={20}
                              height={20}
                              className="w-5 h-5 rounded object-cover border border-neutral-700"
                              unoptimized
                            />
                          ) : (
                            <span className="w-5 h-5 rounded bg-neutral-700/60 border border-neutral-600 flex items-center justify-center text-[9px] font-bold text-neutral-300">
                              {initials(data.team.name, null)}
                            </span>
                          )}
                          <span className="text-sm font-medium text-white truncate">
                            {data.team.name}
                          </span>
                          {data.isCaptain && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-600/20 text-emerald-200 border border-emerald-500/30">
                              {t.teamCaptainBadge}
                            </span>
                          )}
                          {data.isManager && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-600/20 text-sky-200 border border-sky-500/30">
                              {t.teamManagerBadge}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick KPIs — click to jump to the matching tab */}
                  {data.team && (
                    <div className="flex flex-wrap gap-2">
                      <StatPill
                        label={t.pillJoinRequests}
                        value={joinRequestCount}
                        onClick={() => setTab('joinRequests')}
                      />
                      <StatPill
                        label={t.pillPendingScrims}
                        value={scrimCount}
                        onClick={() => setTab('scrims')}
                      />
                      <StatPill
                        label={t.pillMembers}
                        value={memberCount}
                        onClick={() => setTab('team')}
                      />
                    </div>
                  )}
                </div>
              </div>

              {!data.team ? (
                <EmptyState>
                  <p className="text-lg font-semibold text-white">
                    {t.notCaptainTitle}
                  </p>
                  <p className="mt-2 text-sm">{t.notCaptainDesc}</p>
                </EmptyState>
              ) : (
                <>
                  {/* Tabs */}
                  <div
                    role="tablist"
                    aria-label={t.tablistLabel}
                    className="flex flex-wrap gap-2 mb-6 border-b border-neutral-700/50 pb-3"
                  >
                    {getTabs(t).map((tab_) => {
                      const active = tab === tab_.key;
                      let badge: number | null = null;
                      if (tab_.key === 'joinRequests' && joinRequestCount > 0) {
                        badge = joinRequestCount;
                      } else if (tab_.key === 'scrims' && scrimCount > 0) {
                        badge = scrimCount;
                      }
                      return (
                        <button
                          key={tab_.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTab(tab_.key)}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                            active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60'
                          }`}
                        >
                          {tab_.label}
                          {badge !== null && (
                            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-neutral-900">
                              {badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Équipe */}
                  {tab === 'team' && (
                    <section
                      role="tabpanel"
                      className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6"
                    >
                      <div className="flex items-center gap-4">
                        {data.team.logoUrl ? (
                          <Image
                            src={data.team.logoUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="w-14 h-14 rounded-xl object-cover border border-neutral-700"
                            unoptimized
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-neutral-700/50 border border-neutral-700 flex items-center justify-center text-neutral-300 font-bold">
                            {initials(data.team.name, null)}
                          </div>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-white">
                            {data.team.name}
                          </h2>
                          {data.team.slug && (
                            <p className="text-sm text-neutral-400 font-mono">
                              {data.team.slug}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Read-only team settings */}
                      <div className="mt-5">
                        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                          {t.teamInfoTitle}
                        </h3>
                        <div className="flex flex-wrap gap-x-6 gap-y-3">
                          <StateChip
                            label={t.recruitingLabel}
                            open={data.team.isJoinable}
                            openText={t.recruitingOpen}
                            closedText={t.recruitingClosed}
                          />
                          <StateChip
                            label={t.scrimLabel}
                            open={data.team.openForScrim}
                            openText={t.scrimOpen}
                            closedText={t.scrimClosed}
                          />
                        </div>
                        <p className="mt-2 text-xs text-neutral-500 italic">
                          {t.readOnlyNote}
                        </p>
                      </div>

                      {/* Roster */}
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                          {format(t.rosterTitle, {
                            count: data.team.members.length,
                          })}
                        </h3>
                        {data.team.members.length === 0 ? (
                          <p className="text-sm text-neutral-500">
                            {t.noMembers}
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-neutral-700/50">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-700/50">
                                  <th
                                    scope="col"
                                    className="px-4 py-2 font-medium"
                                  >
                                    {t.memberColName}
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-2 font-medium"
                                  >
                                    {t.memberColBattleTag}
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-2 font-medium"
                                  >
                                    {t.memberColRole}
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-2 font-medium"
                                  >
                                    {t.memberColStatus}
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-2 font-medium text-right"
                                  >
                                    {t.memberColActions}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-700/40">
                                {data.team.members.map((m) => (
                                  <tr key={m.id}>
                                    <td className="px-4 py-2.5 text-white">
                                      {m.displayName || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-emerald-300">
                                      {m.battleTag || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-300">
                                      {m.role || t.memberDefaultRole}
                                      {m.isSubstitute && (
                                        <span className="ml-2 text-xs text-amber-300">
                                          {t.substituteInline}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {m.isCaptain ? (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-600/20 text-emerald-200 border border-emerald-500/30">
                                          {t.captainBadge}
                                        </span>
                                      ) : m.isSubstitute ? (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-600/20 text-amber-200 border border-amber-500/30">
                                          {t.substitute}
                                        </span>
                                      ) : (
                                        <span className="text-neutral-500">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      {!m.isCaptain && m.userId ? (
                                        <button
                                          type="button"
                                          onClick={() => promoteMember(m)}
                                          disabled={busy === `captain-${m.id}`}
                                          className="px-3 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-700 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          {busy === `captain-${m.id}`
                                            ? t.promoting
                                            : t.promoteCaptainBtn}
                                        </button>
                                      ) : (
                                        <span className="text-neutral-600">
                                          —
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className="mt-3 text-xs text-neutral-500 italic">
                          {t.rosterManageNote}
                        </p>
                      </div>
                    </section>
                  )}

                  {/* Demandes de join */}
                  {tab === 'joinRequests' && (
                    <section role="tabpanel">
                      {data.joinRequests.length === 0 ? (
                        <EmptyState>
                          <p className="text-lg font-semibold text-white">
                            {t.noJoinRequestsTitle}
                          </p>
                          <p className="mt-2 text-sm">{t.noJoinRequestsDesc}</p>
                        </EmptyState>
                      ) : (
                        <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 divide-y divide-neutral-700/40">
                          {data.joinRequests.map((r: JoinRequest) => (
                            <div key={r.id} className="p-4">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                  <span className="font-medium text-white">
                                    {r.user?.displayName || t.unknownRequester}
                                  </span>
                                  {r.user?.battleTag && (
                                    <span className="ml-2 font-mono text-xs text-emerald-300">
                                      {r.user.battleTag}
                                    </span>
                                  )}
                                  {r.desiredRole && (
                                    <span className="ml-2 text-xs text-neutral-400">
                                      · {t.desiredRoleLabel}: {r.desiredRole}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-neutral-500 flex-shrink-0">
                                  {formatDate(r.createdAt)}
                                </span>
                              </div>
                              {r.comment && (
                                <p className="mt-1.5 text-xs text-neutral-400 italic">
                                  &ldquo;{r.comment}&rdquo;
                                </p>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    processDemande(r.id, 'approved')
                                  }
                                  disabled={busy === `demande-${r.id}`}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {t.approve}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    processDemande(r.id, 'rejected')
                                  }
                                  disabled={busy === `demande-${r.id}`}
                                  className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {t.reject}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {/* Scrims (read-only) */}
                  {tab === 'scrims' && (
                    <section role="tabpanel">
                      {data.pendingScrims.length === 0 ? (
                        <EmptyState>
                          <p className="text-lg font-semibold text-white">
                            {t.noScrimsTitle}
                          </p>
                          <p className="mt-2 text-sm">{t.noScrimsDesc}</p>
                        </EmptyState>
                      ) : (
                        <div className="space-y-4">
                          {data.pendingScrims.map((s: Scrim) => (
                            <div
                              key={s.id}
                              className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-5"
                            >
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                                    {t.scrimOpponentLabel}
                                  </span>
                                  <p className="font-semibold text-white">
                                    {s.opponent || t.scrimUnknownOpponent}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    {s.status}
                                  </span>
                                  <span className="text-xs text-neutral-500">
                                    {formatDate(s.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-3">
                                <span className="text-xs uppercase tracking-wide text-neutral-500">
                                  {t.scrimSlotsLabel}
                                </span>
                                {s.slots.length === 0 ? (
                                  <p className="text-sm text-neutral-500">
                                    {t.scrimNoSlots}
                                  </p>
                                ) : (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {s.slots.map((slot, i) => (
                                      <span
                                        key={`${s.id}-${i}`}
                                        className="px-2 py-1 rounded-lg text-xs bg-neutral-700/60 border border-neutral-600 text-neutral-200"
                                      >
                                        {slot}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {/* Historique */}
                  {tab === 'history' && (
                    <section role="tabpanel">
                      {data.demandes.length === 0 ? (
                        <EmptyState>
                          <p className="text-lg font-semibold text-white">
                            {t.noHistoryTitle}
                          </p>
                          <p className="mt-2 text-sm">{t.noHistoryDesc}</p>
                        </EmptyState>
                      ) : (
                        <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 divide-y divide-neutral-700/40">
                          {data.demandes.map((d: Demande) => {
                            const teamName = d.team?.name || null;
                            return (
                              <div key={d.id} className="p-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="min-w-0">
                                    <span className="font-medium text-white">
                                      {demandeTypeLabels[d.type] || d.type}
                                    </span>
                                    {teamName && (
                                      <span className="text-neutral-400 ml-2">
                                        ({teamName})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                        DEMANDE_STATUS_STYLES[d.status] ||
                                        'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30'
                                      }`}
                                    >
                                      {demandeStatusLabels[d.status] ||
                                        d.status}
                                    </span>
                                    <span className="text-xs text-neutral-500">
                                      {formatDate(d.created_at)}
                                    </span>
                                  </div>
                                </div>
                                {d.comment && (
                                  <p className="mt-1.5 text-xs text-neutral-400 italic">
                                    &ldquo;{d.comment}&rdquo;
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default CaptainViewPage;
