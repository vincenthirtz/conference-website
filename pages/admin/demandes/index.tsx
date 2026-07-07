// pages/admin/demandes/index.tsx

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminDemandesList'>>;

type DemandeType =
  | 'join'
  | 'leave'
  | 'captain_request'
  | 'team_registration'
  | 'scrim'
  | 'other';

type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type UserMini = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  battle_tag: string | null;
  discord: string | null;
};

type StaffMini = {
  id: string;
  display_name: string | null;
};

type Demande = {
  id: string;
  type: DemandeType | string;
  status: DemandeStatus;
  created_at: string;
  updated_at: string | null;
  tournament_id: string | null;
  team_id: string | null;
  user_id: string | null;
  comment: string | null;
  staff_note: string | null;
  source: string | null;
  payload: any | null;
  processed_at: string | null;
  processed_by_staff_id: string | null;

  tournament?: TournamentMini | null;
  team?: TeamMini | null;
  user?: UserMini | null;
  processed_by?: StaffMini | null;
};

type StatusCounts = {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
};

type Props = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
  initialDemandes: Demande[];
  initialTotal: number | null;
  tournaments: TournamentMini[];
  statusCounts: StatusCounts;
  initialError: string | null;
};

const D_FILTER_KEYS = [
  'type',
  'status',
  'tournamentId',
  'search',
  'from',
  'to',
  'offset',
  'orderBy',
  'orderDir',
] as const;
type FilterKey = (typeof D_FILTER_KEYS)[number];
const LIMIT = 50;

const EMPTY_COUNTS: StatusCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
  total: 0,
};

function sanitizeSearchInput(raw: string) {
  // Strip characters that break PostgREST `or(...)` parsing
  return raw.replace(/[,()*\\]/g, ' ').trim();
}

// Mirror of utils/teams/addMember.ts BATTLE_TAG_REGEX (that module imports
// supabase and is server-only, so we can't import it into the client bundle).
const BATTLE_TAG_REGEX = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;

// Only join / captain_request demandes carry a player BattleTag that gets
// written when the membership is created.
function demandeCarriesBattleTag(d: Demande) {
  return d.type === 'join' || d.type === 'captain_request';
}

// Resolve the BattleTag a demande would write: payload first (join stores
// `user_battle_tag`), falling back to the requester's auth metadata tag.
function resolveDemandeBattleTag(d: Demande): string | null {
  const fromPayload =
    typeof d.payload?.user_battle_tag === 'string'
      ? d.payload.user_battle_tag
      : null;
  return fromPayload || d.user?.battle_tag || null;
}

// A demande is flagged when it carries a BattleTag slot but the stored tag is
// missing or fails the format check.
function isBattleTagFlagged(d: Demande): boolean {
  if (!demandeCarriesBattleTag(d)) return false;
  const tag = resolveDemandeBattleTag(d);
  return !tag || !BATTLE_TAG_REGEX.test(tag.trim());
}

export const getServerSideProps = withStaffPage(
  'manager',
  async (ctx, staffCtx) => {
    const { query } = ctx;
    const type = typeof query.type === 'string' ? query.type : '';
    const statusRaw =
      typeof query.status === 'string' ? query.status : 'pending';
    const tournamentId =
      typeof query.tournamentId === 'string' ? query.tournamentId : '';
    const searchRaw = typeof query.search === 'string' ? query.search : '';
    const search = sanitizeSearchInput(searchRaw);
    const from = typeof query.from === 'string' ? query.from : '';
    const to = typeof query.to === 'string' ? query.to : '';
    const offset = Math.max(0, Number(query.offset) || 0);
    const orderBy =
      query.orderBy === 'processed_at' ? 'processed_at' : 'created_at';
    const orderDir = query.orderDir === 'asc' ? 'asc' : 'desc';

    if (!supabaseAdmin) {
      return {
        initialDemandes: [],
        initialTotal: null,
        tournaments: [],
        statusCounts: EMPTY_COUNTS,
        initialError: 'Service indisponible',
      };
    }

    const { tenantId } = staffCtx;

    const baseColumns = `
    id, user_id, team_id, tournament_id, type, status,
    comment, staff_note, source, payload,
    processed_at, processed_by_staff_id,
    created_at, updated_at,
    team:teams!demandes_team_id_fkey(id, name, short_name, logo_url),
    tournament:tournaments!demandes_tournament_id_fkey(id, name, slug)
  `;

    let q = supabaseAdmin
      .from('demandes')
      .select(baseColumns, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order(orderBy, { ascending: orderDir === 'asc' })
      .range(offset, offset + LIMIT - 1);

    if (statusRaw) q = q.eq('status', statusRaw);
    if (type) q = q.eq('type', type);
    if (tournamentId) q = q.eq('tournament_id', tournamentId);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`comment.ilike.${s},staff_note.ilike.${s},source.ilike.${s}`);
    }

    // Stats: count rows per status, applying every filter EXCEPT status,
    // so each card shows how many match the rest of the filter set.
    function buildStatusQuery(targetStatus: DemandeStatus) {
      let sq = supabaseAdmin!
        .from('demandes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', targetStatus);
      if (type) sq = sq.eq('type', type);
      if (tournamentId) sq = sq.eq('tournament_id', tournamentId);
      if (from) sq = sq.gte('created_at', from);
      if (to) sq = sq.lte('created_at', to);
      if (search) {
        const s = `%${search}%`;
        sq = sq.or(
          `comment.ilike.${s},staff_note.ilike.${s},source.ilike.${s}`
        );
      }
      return sq;
    }

    const [
      demandesRes,
      tournamentsRes,
      pendingRes,
      approvedRes,
      rejectedRes,
      cancelledRes,
    ] = await Promise.all([
      q,
      supabaseAdmin
        .from('tournaments')
        .select('id, name, slug')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200),
      buildStatusQuery('pending'),
      buildStatusQuery('approved'),
      buildStatusQuery('rejected'),
      buildStatusQuery('cancelled'),
    ]);

    if (demandesRes.error) {
      logger.error('admin demandes SSR error:', demandesRes.error);
      return {
        initialDemandes: [],
        initialTotal: null,
        tournaments: (tournamentsRes.data || []) as TournamentMini[],
        statusCounts: EMPTY_COUNTS,
        initialError: 'Erreur lors du chargement',
      };
    }

    const rows = (demandesRes.data || []) as unknown as Demande[];

    // Enrich user info via Supabase Auth (parallel)
    const userIds = [
      ...new Set(rows.map((d) => d.user_id).filter(Boolean)),
    ] as string[];
    const userMap = new Map<string, UserMini>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data } = await supabaseAdmin!.auth.admin.getUserById(uid);
          if (data?.user) {
            const meta = (data.user.user_metadata ?? {}) as Record<string, any>;
            userMap.set(uid, {
              id: uid,
              email: data.user.email ?? null,
              display_name:
                (meta.display_name as string) ||
                (meta.full_name as string) ||
                data.user.email ||
                null,
              avatar_url: (meta.avatar_url as string) || null,
              battle_tag: (meta.battle_tag as string) || null,
              discord: (meta.discord as string) || null,
            });
          }
        } catch {
          // ignore individual failures
        }
      })
    );

    // Enrich staff handler info (single batched query)
    const staffIds = [
      ...new Set(rows.map((d) => d.processed_by_staff_id).filter(Boolean)),
    ] as string[];
    const staffMap = new Map<string, StaffMini>();
    if (staffIds.length > 0) {
      const { data: staffRows } = await supabaseAdmin
        .from('staff')
        .select('id, display_name')
        .in('id', staffIds);
      for (const s of staffRows || []) {
        staffMap.set(s.id, {
          id: s.id,
          display_name: s.display_name ?? null,
        });
      }
    }

    const enriched: Demande[] = rows.map((d) => ({
      ...d,
      user: d.user_id ? (userMap.get(d.user_id) ?? null) : null,
      processed_by: d.processed_by_staff_id
        ? (staffMap.get(d.processed_by_staff_id) ?? null)
        : null,
    }));

    const statusCounts: StatusCounts = {
      pending: pendingRes.count ?? 0,
      approved: approvedRes.count ?? 0,
      rejected: rejectedRes.count ?? 0,
      cancelled: cancelledRes.count ?? 0,
      total:
        (pendingRes.count ?? 0) +
        (approvedRes.count ?? 0) +
        (rejectedRes.count ?? 0) +
        (cancelledRes.count ?? 0),
    };

    return {
      initialDemandes: enriched,
      initialTotal:
        typeof demandesRes.count === 'number' ? demandesRes.count : null,
      tournaments: (tournamentsRes.data || []) as TournamentMini[],
      statusCounts,
      initialError: null,
    };
  }
);

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function typeLabel(type: DemandeType | string, t: Dict) {
  switch (type) {
    case 'join':
    case 'join_team':
      return t.chipJoin;
    case 'leave':
    case 'leave_team':
      return t.chipLeave;
    case 'captain_request':
      return t.chipCaptain;
    case 'team_registration':
      return t.chipTeamRegistration;
    case 'scrim':
      return t.chipScrim;
    case 'other':
      return t.chipOther;
    default:
      return String(type);
  }
}

function typeColor(type: DemandeType | string) {
  switch (type) {
    case 'join':
    case 'join_team':
      return 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30';
    case 'leave':
    case 'leave_team':
      return 'bg-amber-600/20 text-amber-300 border border-amber-500/30';
    case 'captain_request':
      return 'bg-purple-600/20 text-purple-300 border border-purple-500/30';
    case 'team_registration':
      return 'bg-blue-600/20 text-blue-300 border border-blue-500/30';
    case 'scrim':
      return 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30';
    case 'other':
      return 'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function statusLabel(status: DemandeStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'approved':
      return t.statusApproved;
    case 'rejected':
      return t.statusRejected;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: DemandeStatus) {
  switch (status) {
    case 'pending':
      return 'bg-blue-600 text-white';
    case 'approved':
      return 'bg-emerald-600 text-white';
    case 'rejected':
      return 'bg-red-600 text-white';
    case 'cancelled':
      return 'bg-neutral-600 text-neutral-200';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function AdminDemandesPage({
  initialDemandes,
  initialTotal,
  tournaments,
  statusCounts,
  initialError,
}: Props) {
  const t = useAdminT('adminDemandesList');
  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const router = useRouter();
  const { filters } = useUrlFilters(D_FILTER_KEYS);

  const typeFilter = filters.type ?? '';
  const statusFilter = filters.status ?? 'pending';
  const tournamentFilter = filters.tournamentId ?? '';
  const search = filters.search ?? '';
  const dateFrom = filters.from ?? '';
  const dateTo = filters.to ?? '';
  const offset = Math.max(0, Number(filters.offset) || 0);
  const orderBy =
    filters.orderBy === 'processed_at' ? 'processed_at' : 'created_at';
  const orderDir = filters.orderDir === 'asc' ? 'asc' : 'desc';
  const limit = LIMIT;

  const demandes = initialDemandes;
  const total = initialTotal;
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [searchInput, setSearchInput] = useState(search);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [singleProcessing, setSingleProcessing] = useState<string | null>(null);

  // Approval confirm modal for flagged (invalid/missing BattleTag) demandes:
  // staff can fix the tag inline before the membership is created.
  const [tagModal, setTagModal] = useState<{
    demande: Demande;
    value: string;
  } | null>(null);

  // "Demander plus d'infos" modal.
  const [infoModal, setInfoModal] = useState<{
    demande: Demande;
    note: string;
  } | null>(null);
  const [infoProcessing, setInfoProcessing] = useState(false);

  const hasActiveFilters =
    !!typeFilter ||
    !!tournamentFilter ||
    !!search ||
    !!dateFrom ||
    !!dateTo ||
    statusFilter !== 'pending' ||
    orderBy !== 'created_at' ||
    orderDir !== 'desc';

  // Apply filters with full SSR refresh (useUrlFilters does shallow routing,
  // which would leave the SSR-loaded list stale).
  function applyFilters(updates: Partial<Record<FilterKey, string | null>>) {
    const query: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(router.query)) {
      if (v !== undefined) query[k] = v;
    }
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === undefined || v === '') {
        delete query[k];
      } else {
        query[k] = v as string;
      }
    }
    router.push({ pathname: router.pathname, query }, undefined, {
      scroll: false,
    });
  }

  function applyFilter(key: FilterKey, value: string | null) {
    applyFilters({ [key]: value } as Partial<Record<FilterKey, string | null>>);
  }

  async function refresh() {
    await router.replace(router.asPath, undefined, { scroll: false });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === demandes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(demandes.map((d) => d.id)));
    }
  }

  async function postUpdateStatus(
    ids: string[],
    newStatus: 'approved' | 'rejected',
    battleTagOverrides?: Record<string, string>
  ) {
    return adminFetchJson<{ updatedCount: number }>('/api/admin/demandes', {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateStatus',
        demandeIds: ids,
        newStatus,
        ...(battleTagOverrides && Object.keys(battleTagOverrides).length > 0
          ? { battleTagOverrides }
          : {}),
      }),
    });
  }

  async function handleBatchAction(newStatus: 'approved' | 'rejected') {
    if (selected.size === 0) return;
    setBatchProcessing(true);
    setErrorMsg(null);
    try {
      const json = await postUpdateStatus(Array.from(selected), newStatus);
      addToast(
        format(
          newStatus === 'approved'
            ? t.toastBatchApproved
            : t.toastBatchRejected,
          { count: json.updatedCount }
        ),
        'success'
      );
      setSelected(new Set());
      refresh();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.error);
    } finally {
      setBatchProcessing(false);
    }
  }

  async function handleSingleAction(
    id: string,
    newStatus: 'approved' | 'rejected'
  ) {
    // Intercept approval of a flagged (invalid/missing BattleTag) demande:
    // open the confirm modal so staff can fix the tag inline first.
    if (newStatus === 'approved') {
      const d = demandes.find((x) => x.id === id);
      if (d && isBattleTagFlagged(d)) {
        setTagModal({
          demande: d,
          value: (resolveDemandeBattleTag(d) ?? '').trim(),
        });
        return;
      }
    }

    setSingleProcessing(id);
    setErrorMsg(null);
    try {
      await postUpdateStatus([id], newStatus);
      addToast(
        newStatus === 'approved' ? t.toastApproved : t.toastRejected,
        'success'
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setSingleProcessing(null);
    }
  }

  // Confirm approval from the BattleTag modal. The corrected tag (if any) is
  // sent as a per-demande override. We DON'T hard-block on an invalid tag —
  // staff can approve anyway (a warning toast surfaces the issue).
  async function confirmTagApproval() {
    if (!tagModal) return;
    const { demande, value } = tagModal;
    const trimmed = value.trim();
    const stillInvalid = !trimmed || !BATTLE_TAG_REGEX.test(trimmed);

    setSingleProcessing(demande.id);
    setErrorMsg(null);
    try {
      await postUpdateStatus(
        [demande.id],
        'approved',
        trimmed ? { [demande.id]: trimmed } : undefined
      );
      addToast(
        stillInvalid ? t.toastApprovedInvalidTag : t.toastApproved,
        stillInvalid ? 'error' : 'success'
      );
      setTagModal(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(demande.id);
        return next;
      });
      refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setSingleProcessing(null);
    }
  }

  async function submitRequestMoreInfo() {
    if (!infoModal) return;
    const note = infoModal.note.trim();
    if (!note) {
      addToast(t.errorNoteRequired, 'error');
      return;
    }
    setInfoProcessing(true);
    try {
      await adminFetchJson('/api/admin/demandes', {
        method: 'POST',
        body: JSON.stringify({
          action: 'requestMoreInfo',
          demandeId: infoModal.demande.id,
          note,
        }),
      });
      addToast(t.toastNoteSaved, 'success');
      setInfoModal(null);
      refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setInfoProcessing(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilters({ search: searchInput.trim() || null, offset: null });
  }

  function handleResetFilters() {
    setSearchInput('');
    setSelected(new Set());
    router.push({ pathname: router.pathname }, undefined, { scroll: false });
  }

  async function handleExportCsv() {
    const params = new URLSearchParams();
    params.set('limit', '10000');
    params.set('offset', '0');
    params.set('export', 'csv');
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (tournamentFilter) params.set('tournamentId', tournamentFilter);
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const url = '/api/admin/demandes?' + params.toString();
    try {
      const res = await adminFetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'demandes.csv';
      a.click();
    } catch (e) {
      logger.error('CSV export error', e);
      window.location.href = url;
    }
  }

  const statCards: Array<{
    key: string;
    label: string;
    value: number;
    accent: string;
    statusValue: string | null;
  }> = [
    {
      key: 'all',
      label: t.statTotal,
      value: statusCounts.total,
      accent: 'text-white',
      statusValue: '',
    },
    {
      key: 'pending',
      label: t.statPending,
      value: statusCounts.pending,
      accent: 'text-blue-300',
      statusValue: 'pending',
    },
    {
      key: 'approved',
      label: t.statApproved,
      value: statusCounts.approved,
      accent: 'text-emerald-300',
      statusValue: 'approved',
    },
    {
      key: 'rejected',
      label: t.statRejected,
      value: statusCounts.rejected,
      accent: 'text-red-300',
      statusValue: 'rejected',
    },
    {
      key: 'cancelled',
      label: t.statCancelled,
      value: statusCounts.cancelled,
      accent: 'text-neutral-300',
      statusValue: 'cancelled',
    },
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              {t.backToDashboard}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(
                        total > 1
                          ? t.countForFilter_other
                          : t.countForFilter_one,
                        { count: total }
                      )
                    : t.loading}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={refresh}
                  className="px-3 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
                  title={t.refresh}
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {t.refresh}
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {t.exportCsv}
                </button>
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {statCards.map((card) => {
              const active =
                (card.statusValue ?? '') === (statusFilter ?? 'pending') ||
                (card.statusValue === '' && statusFilter === '');
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() =>
                    applyFilters({
                      status: card.statusValue || null,
                      offset: null,
                    })
                  }
                  className={`text-left bg-neutral-800/50 backdrop-blur border rounded-2xl p-4 transition-colors hover:bg-neutral-800/80 ${
                    active
                      ? 'border-blue-500/60 ring-1 ring-blue-500/40'
                      : 'border-neutral-700/50'
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-neutral-500">
                    {card.label}
                  </div>
                  <div className={`mt-1 text-2xl font-bold ${card.accent}`}>
                    {card.value}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => refresh()}
                className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                {t.retry}
              </button>
            </div>
          )}

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleFilterSubmit}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 items-end"
            >
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterType}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={typeFilter}
                  onChange={(e) =>
                    applyFilters({
                      type: e.target.value || null,
                      offset: null,
                    })
                  }
                >
                  <option value="">{t.typeAll}</option>
                  <option value="captain_request">
                    {t.typeCaptainRequest}
                  </option>
                  <option value="join">{t.typeJoin}</option>
                  <option value="leave">{t.typeLeave}</option>
                  <option value="team_registration">
                    {t.typeTeamRegistration}
                  </option>
                  <option value="scrim">{t.typeScrim}</option>
                  <option value="other">{t.typeOther}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterStatus}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={statusFilter}
                  onChange={(e) =>
                    applyFilters({
                      status: e.target.value || null,
                      offset: null,
                    })
                  }
                >
                  <option value="">{t.statusAll}</option>
                  <option value="pending">{t.statusPending}</option>
                  <option value="approved">{t.statusApproved}</option>
                  <option value="rejected">{t.statusRejected}</option>
                  <option value="cancelled">{t.statusCancelled}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterTournament}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={tournamentFilter}
                  onChange={(e) =>
                    applyFilters({
                      tournamentId: e.target.value || null,
                      offset: null,
                    })
                  }
                >
                  <option value="">{t.tournamentAll}</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.slug ? ` (${t.slug})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterSearch}
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
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterFrom}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={dateFrom}
                  onChange={(e) =>
                    applyFilters({
                      from: e.target.value || null,
                      offset: null,
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterTo}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={dateTo}
                  onChange={(e) =>
                    applyFilters({ to: e.target.value || null, offset: null })
                  }
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterSort}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={`${orderBy}:${orderDir}`}
                  onChange={(e) => {
                    const [ob, od] = e.target.value.split(':');
                    applyFilters({
                      orderBy: ob === 'created_at' ? null : ob,
                      orderDir: od === 'desc' ? null : od,
                      offset: null,
                    });
                  }}
                >
                  <option value="created_at:desc">{t.sortDateRecent}</option>
                  <option value="created_at:asc">{t.sortDateOld}</option>
                  <option value="processed_at:desc">
                    {t.sortProcessedRecent}
                  </option>
                  <option value="processed_at:asc">{t.sortProcessedOld}</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  {t.searchBtn}
                </button>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    title={t.resetFiltersTitle}
                    className="px-3 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm transition-colors"
                  >
                    {t.reset}
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Batch action bar */}
          {selected.size > 0 && (
            <div className="mb-4 flex items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3">
              <span className="text-sm font-medium">
                {format(
                  selected.size > 1
                    ? t.selectedCount_other
                    : t.selectedCount_one,
                  { count: selected.size }
                )}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => handleBatchAction('approved')}
                disabled={batchProcessing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {t.approve}
              </button>
              <button
                type="button"
                onClick={() => handleBatchAction('rejected')}
                disabled={batchProcessing}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {t.reject}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
              >
                {t.deselect}
              </button>
            </div>
          )}

          {/* Demandes List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {demandes.length === 0 ? (
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                {t.emptyTitle}
                {hasActiveFilters && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="px-4 py-2 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors"
                    >
                      {t.resetFilters}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {/* Select all header */}
                <div className="px-4 py-3 bg-neutral-800/80 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={
                      selected.size === demandes.length && demandes.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-900"
                  />
                  <span className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                    {t.selectAll}
                  </span>
                </div>

                {demandes.map((d) => {
                  const isPending = d.status === 'pending';
                  const isProcessing = singleProcessing === d.id;
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                        selected.has(d.id) ? 'bg-blue-900/10' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggleSelect(d.id)}
                        className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 flex-shrink-0"
                      />

                      <Link
                        href={`/admin/demandes/${d.id}`}
                        className="flex items-center gap-4 flex-1 min-w-0"
                      >
                        {/* Icon / Avatar */}
                        <div className="flex-shrink-0">
                          {d.user?.avatar_url ? (
                            <Image
                              src={d.user.avatar_url}
                              alt={d.user.display_name || 'User'}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                              <svg
                                className="w-6 h-6 text-neutral-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                              {d.user?.display_name ||
                                d.user?.email ||
                                d.user_id ||
                                t.unknownUser}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                                d.status
                              )}`}
                            >
                              {statusLabel(d.status, t)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(
                                d.type
                              )}`}
                            >
                              {typeLabel(d.type, t)}
                            </span>
                            {d.source && d.source !== 'website' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-neutral-700/60 text-neutral-300 border border-neutral-600/50">
                                {d.source}
                              </span>
                            )}
                            {isBattleTagFlagged(d) && (
                              <span
                                title={t.battleTagWarnTitle}
                                data-testid="battletag-warning"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-600/20 text-orange-300 border border-orange-500/40"
                              >
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                                  />
                                </svg>
                                {t.battleTagLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-neutral-400 flex-wrap">
                            {d.type === 'scrim' &&
                              d.payload?.from_team_name && (
                                <>
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-cyan-300">
                                      {d.payload.from_team_name}
                                    </span>
                                    <span className="text-neutral-500">→</span>
                                    <span>
                                      {d.team?.name ||
                                        d.payload.target_team_name ||
                                        t.targetTeamFallback}
                                    </span>
                                  </span>
                                  {d.payload.preferred_date && (
                                    <>
                                      <span>•</span>
                                      <span className="text-cyan-300/80 text-xs">
                                        {new Date(
                                          d.payload.preferred_date
                                        ).toLocaleDateString('fr-FR', {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                        })}
                                      </span>
                                    </>
                                  )}
                                  <span>•</span>
                                </>
                              )}
                            {d.team && d.type !== 'scrim' && (
                              <>
                                <span className="flex items-center gap-1">
                                  {d.team.logo_url && (
                                    <Image
                                      src={d.team.logo_url}
                                      alt={d.team.name}
                                      width={16}
                                      height={16}
                                      className="w-4 h-4 rounded object-cover"
                                    />
                                  )}
                                  {d.team.name}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            {d.type === 'captain_request' &&
                              d.payload &&
                              !d.team && (
                                <>
                                  <span className="text-purple-300">
                                    {d.payload.request_type === 'existing_team'
                                      ? d.payload.existing_team_name
                                      : d.payload.team_name}
                                    {d.payload.request_type === 'new_team' &&
                                      t.toCreate}
                                  </span>
                                  <span>•</span>
                                </>
                              )}
                            {d.tournament && (
                              <>
                                <span>{d.tournament.name}</span>
                                <span>•</span>
                              </>
                            )}
                            <span className="text-xs">
                              {formatDateTime(d.created_at)}
                            </span>
                          </div>
                          {d.comment && (
                            <p className="text-xs text-neutral-500 mt-1 truncate max-w-xl">
                              {d.comment}
                            </p>
                          )}
                        </div>

                        {/* Handler info */}
                        {d.processed_by && (
                          <div className="hidden sm:block text-xs text-neutral-500 text-right flex-shrink-0">
                            <div>
                              {t.by}{' '}
                              <span className="text-neutral-300">
                                {d.processed_by.display_name ||
                                  d.processed_by.id}
                              </span>
                            </div>
                            {d.processed_at && (
                              <div className="text-neutral-600">
                                {formatDateTime(d.processed_at)}
                              </div>
                            )}
                          </div>
                        )}
                      </Link>

                      {/* Quick actions for pending demandes */}
                      {isPending && (
                        <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setInfoModal({ demande: d, note: '' })
                            }
                            disabled={isProcessing || batchProcessing}
                            title={t.requestMoreInfoTitle}
                            data-testid="request-more-info"
                            className="p-2 rounded-lg bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 hover:border-amber-500 text-xs transition-colors disabled:opacity-50"
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
                                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSingleAction(d.id, 'approved')}
                            disabled={isProcessing || batchProcessing}
                            title={t.approveTitle}
                            className="p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-emerald-500 text-xs transition-colors disabled:opacity-50"
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
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSingleAction(d.id, 'rejected')}
                            disabled={isProcessing || batchProcessing}
                            title={t.rejectTitle}
                            className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 hover:border-red-500 text-xs transition-colors disabled:opacity-50"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      )}

                      <Link
                        href={`/admin/demandes/${d.id}`}
                        className="flex-shrink-0"
                        aria-label={t.viewDetail}
                      >
                        <svg
                          className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
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
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() =>
                applyFilter(
                  'offset',
                  String(Math.max(0, offset - limit)) || null
                )
              }
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
              {demandes.length === 0 ? 0 : offset + 1} –{' '}
              {offset + demandes.length}
              {total ? format(t.paginationTotal, { total }) : ''}
            </span>

            <button
              type="button"
              disabled={total !== null && offset + limit >= total}
              onClick={() => applyFilter('offset', String(offset + limit))}
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
        </div>
      </div>

      {/* BattleTag fix / approve-confirm modal */}
      <Modal
        open={Boolean(tagModal)}
        onClose={() => setTagModal(null)}
        backdropClassName="bg-black/60"
        panelChromeClassName="rounded-2xl border border-neutral-700 bg-neutral-900 shadow-xl"
        dataTestId="battletag-modal"
        title={
          <h2 className="text-lg font-semibold text-white">
            {t.tagModalTitle}
          </h2>
        }
        subtitle={t.tagModalSubtitle}
        footer={
          <>
            <button
              type="button"
              onClick={() => setTagModal(null)}
              className="px-4 py-2 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              data-testid="battletag-confirm"
              disabled={singleProcessing === tagModal?.demande.id}
              onClick={confirmTagApproval}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t.approve}
            </button>
          </>
        }
      >
        {tagModal && (
          <>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.tagInputLabel}
            </label>
            <input
              type="text"
              data-testid="battletag-input"
              autoFocus
              value={tagModal.value}
              onChange={(e) =>
                setTagModal((m) => (m ? { ...m, value: e.target.value } : m))
              }
              placeholder={t.tagInputPlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            />
            {tagModal.value.trim() &&
              !BATTLE_TAG_REGEX.test(tagModal.value.trim()) && (
                <p className="mt-2 text-xs text-orange-300">
                  {t.tagFormatInvalid}
                </p>
              )}
          </>
        )}
      </Modal>

      {/* "Demander plus d'infos" modal */}
      <Modal
        open={Boolean(infoModal)}
        onClose={() => setInfoModal(null)}
        backdropClassName="bg-black/60"
        panelChromeClassName="rounded-2xl border border-neutral-700 bg-neutral-900 shadow-xl"
        dataTestId="info-modal"
        title={
          <h2 className="text-lg font-semibold text-white">
            {t.infoModalTitle}
          </h2>
        }
        subtitle={t.infoModalSubtitle}
        footer={
          <>
            <button
              type="button"
              onClick={() => setInfoModal(null)}
              className="px-4 py-2 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              data-testid="info-submit"
              disabled={infoProcessing}
              onClick={submitRequestMoreInfo}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t.send}
            </button>
          </>
        }
      >
        {infoModal && (
          <textarea
            data-testid="info-note"
            autoFocus
            rows={4}
            value={infoModal.note}
            onChange={(e) =>
              setInfoModal((m) => (m ? { ...m, note: e.target.value } : m))
            }
            placeholder={t.infoNotePlaceholder}
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-800 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
          />
        )}
      </Modal>
    </>
  );
}

export default AdminDemandesPage;
