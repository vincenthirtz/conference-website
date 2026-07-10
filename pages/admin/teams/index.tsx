import { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import {
  useIdempotentMutation,
  BgSyncQueuedError,
} from '@/hooks/useIdempotentMutation';
import EmptyState from '@/components/admin/EmptyState';
import Modal from '@/components/admin/Modal';
import { SkeletonListRow } from '@/components/admin/Skeleton';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import type { TeamRow } from '@/types/admin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../../utils/logger';
type AdminTeamsProps = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
  // SSR first-paint hydration — seeds the shared read hook so the list shows
  // instantly (no flash, gating/SEO preserved) while pagination/filters/search
  // are then driven CLIENT-side by useAdminResource.
  initialTeams: TeamRow[];
  initialTotal: number | null;
  initialOffset: number;
  errorMsg: string | null;
};

type TeamsApiResponse = {
  teams: TeamRow[];
  total: number | null;
};

function formatDate(d: string | null) {
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

// Filters (search / isActive / tournamentId) stay URL-driven for deep-linking
// and are passed as server params; pagination is owned by the hook (offset is
// no longer synced to the URL — mirrors PartnersListPanel).
const FILTER_KEYS = ['search', 'isActive', 'tournamentId'] as const;
const LIMIT = 25;

function AdminTeamsListPage({
  initialTeams,
  initialTotal,
  initialOffset,
  errorMsg: ssrError,
}: AdminTeamsProps) {
  const t = useAdminT('adminTeamsList');
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson: mutateDelete } = useIdempotentMutation();
  const { mutateJson: mutateBulk } = useIdempotentMutation();
  const { mutate: mutateImport } = useIdempotentMutation();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);

  const search = filters.search ?? '';
  const activeFilter = filters.isActive ?? '';
  const tournamentFilter = filters.tournamentId ?? '';

  // Client-side reads via the shared hook, seeded from SSR for the first paint.
  // Params mirror EXACTLY the SSR loader (isActive / tournamentId filters +
  // name/slug/short_name search + created_at desc order + limit 25) so the
  // hydrated page matches what the hook would fetch — no flash / incoherence.
  const {
    data: teams,
    total,
    loading,
    error: hookError,
    refresh: fetchTeams,
    offset,
    setOffset,
    resetOffset,
  } = useAdminResource<TeamRow, TeamsApiResponse>('/api/admin/teams', {
    limit: LIMIT,
    initialData: initialTeams,
    initialTotal,
    initialOffset,
    params: {
      isActive: activeFilter,
      tournamentId: tournamentFilter,
      search,
    },
    select: (res) => res.teams || [],
    selectTotal: (res) => (typeof res.total === 'number' ? res.total : null),
  });

  // Any server-filter change returns to the first page — but NOT on the very
  // first render (that would clobber a deep-linked SSR offset before the
  // hydrated data is shown).
  const skipFirstReset = useRef(true);
  useEffect(() => {
    if (skipFirstReset.current) {
      skipFirstReset.current = false;
      return;
    }
    resetOffset();
  }, [activeFilter, tournamentFilter, search, resetOffset]);

  const [errorMsg, setErrorMsg] = useState<string | null>(ssrError);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Tournament dropdown is loaded lazily on first focus (saves 200-row query
  // on every page load when filters aren't used).
  const [tournamentOptions, setTournamentOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false);

  const loadTournaments = useCallback(async () => {
    if (tournamentsLoaded) return;
    try {
      const res = await adminFetch('/api/admin/tournaments?limit=200');
      if (res.ok) {
        const json = await res.json();
        setTournamentOptions(
          (json.tournaments || []).map((tour: any) => ({
            id: tour.id,
            name: tour.name,
          }))
        );
      }
    } catch {
      // ignore
    } finally {
      setTournamentsLoaded(true);
    }
  }, [tournamentsLoaded, adminFetch]);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [assignTournamentId, setAssignTournamentId] = useState('');

  // Import modal (CSV + platform integrations)
  type ImportTab = 'csv' | 'toornament' | 'challonge' | 'startgg';
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ImportTab>('csv');
  const [csvText, setCsvText] = useState('');
  const [platformRef, setPlatformRef] = useState('');
  const [importTournamentId, setImportTournamentId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // API keys config sub-modal
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [apiKeys, setApiKeys] = useState<{
    toornament: string;
    challonge: string;
    startgg: string;
  }>({ toornament: '', challonge: '', startgg: '' });
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState<keyof typeof apiKeys | null>(
    null
  );

  // Local search input (synced to URL on submit)
  const [searchInput, setSearchInput] = useState(search);

  async function handleDelete(team: TeamRow) {
    if (!team?.id) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      // Idempotency-Key : un re-clic après timeout ne relance pas la
      // suppression (l'endpoint rejoue la 1ère réponse).
      const json = await mutateDelete<{ error?: string }>(
        `/api/admin/teams/${team.id}`,
        { method: 'DELETE' }
      );
      if (json?.error) {
        throw new Error(json.error);
      }
      setDeleteTarget(null);
      fetchTeams();
    } catch (err: unknown) {
      const msg =
        err instanceof BgSyncQueuedError
          ? t.offlineDelete
          : ((err as Error)?.message ?? t.errUnexpected);
      setErrorMsg(msg);
      addToast(msg, err instanceof BgSyncQueuedError ? 'info' : 'error');
    } finally {
      setDeleting(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFilters({ search: searchInput.trim() || null });
  }

  // Bulk selection helpers
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === teams.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(teams.map((t) => t.id)));
    }
  }

  async function handleBulkAction() {
    if (selected.size === 0 || !bulkAction) return;

    // Confirmation pour les actions destructives ou lourdes en consequences
    if (bulkAction === 'delete') {
      const ok = await confirm({
        title: format(t.confirmBulkDeleteTitle, { count: selected.size }),
        subtitle: t.confirmBulkDeleteSubtitle,
        variant: 'danger',
        confirmLabel: t.confirmBulkDeleteBtn,
      });
      if (!ok) return;
    } else if (bulkAction === 'deactivate') {
      const ok = await confirm({
        title: format(t.confirmBulkDeactivateTitle, { count: selected.size }),
        subtitle: t.confirmBulkDeactivateSubtitle,
        variant: 'warning',
        confirmLabel: t.confirmBulkDeactivateBtn,
      });
      if (!ok) return;
    }

    setBulkProcessing(true);
    setErrorMsg(null);

    try {
      const body: any = {
        action: bulkAction,
        teamIds: Array.from(selected),
      };
      if (bulkAction === 'assign' && assignTournamentId) {
        body.tournamentId = assignTournamentId;
      }

      // Idempotency-Key : un re-clic après timeout ne relance pas la
      // suppression/désactivation en masse (l'endpoint rejoue la 1ère réponse).
      const json = await mutateBulk<{ count: number }>(
        '/api/admin/teams/bulk',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );

      const labels: Record<string, string> = {
        delete: t.bulkLabelDeleted,
        activate: t.bulkLabelActivated,
        deactivate: t.bulkLabelDeactivated,
        assign: t.bulkLabelAssigned,
      };
      addToast(
        format(t.bulkToast, {
          count: json.count,
          label: labels[bulkAction] || bulkAction,
        }),
        'success'
      );
      setSelected(new Set());
      setBulkAction('');
      fetchTeams();
    } catch (err: unknown) {
      const msg =
        err instanceof BgSyncQueuedError
          ? t.offlineBulk
          : ((err as Error)?.message ?? t.errGeneric);
      setErrorMsg(msg);
      addToast(msg, err instanceof BgSyncQueuedError ? 'info' : 'error');
    } finally {
      setBulkProcessing(false);
    }
  }

  // Import (CSV ou plateforme)
  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    setErrorMsg(null);

    try {
      let res: Response;
      if (activeTab === 'csv') {
        if (!csvText.trim()) {
          setImporting(false);
          return;
        }
        res = await mutateImport('/api/admin/teams/import-csv', {
          method: 'POST',
          body: JSON.stringify({
            csv: csvText,
            tournamentId: importTournamentId || undefined,
          }),
        });
      } else {
        if (!platformRef.trim()) {
          setImporting(false);
          return;
        }
        res = await mutateImport('/api/admin/teams/import-platform', {
          method: 'POST',
          body: JSON.stringify({
            source: activeTab,
            sourceRef: platformRef,
            tournamentId: importTournamentId || undefined,
          }),
        });
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errImport);
      }

      const json = await res.json();
      setImportResult(json);
      if (json.created > 0) fetchTeams();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errImport);
    } finally {
      setImporting(false);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || '');
    };
    reader.readAsText(file);
  }

  // API keys config
  async function loadApiKeys() {
    setApiKeysLoading(true);
    try {
      const keys = [
        'toornament_api_key',
        'challonge_api_key',
        'startgg_api_key',
      ];
      const fetched = await Promise.all(
        keys.map((k) =>
          adminFetch(`/api/admin/site-settings/${k}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      );
      setApiKeys({
        toornament: fetched[0]?.value ?? '',
        challonge: fetched[1]?.value ?? '',
        startgg: fetched[2]?.value ?? '',
      });
    } finally {
      setApiKeysLoading(false);
    }
  }

  async function saveApiKeys() {
    setApiKeysSaving(true);
    setErrorMsg(null);
    try {
      const entries: { key: string; value: string; description: string }[] = [
        {
          key: 'toornament_api_key',
          value: apiKeys.toornament,
          description: t.descToornament,
        },
        {
          key: 'challonge_api_key',
          value: apiKeys.challonge,
          description: t.descChallonge,
        },
        {
          key: 'startgg_api_key',
          value: apiKeys.startgg,
          description: t.descStartgg,
        },
      ];

      for (const entry of entries) {
        await adminFetchJson('/api/admin/site-settings', {
          method: 'POST',
          body: JSON.stringify(entry),
        });
      }
      addToast(t.toastApiKeysSaved, 'success');
      setShowApiKeysModal(false);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errApiKeysSave);
    } finally {
      setApiKeysSaving(false);
    }
  }

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.headTitle}</title>
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
                  {total !== null
                    ? format(total > 1 ? t.teamCount_other : t.teamCount_one, {
                        count: total,
                      })
                    : t.loading}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(true);
                    setImportResult(null);
                    setCsvText('');
                    setPlatformRef('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-neutral-600 hover:bg-neutral-800 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  {t.import}
                </button>
                <Link
                  href="/admin/teams/new"
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
                  {t.newTeam}
                </Link>
              </div>
            </div>
          </div>

          {/* Messages */}
          {(errorMsg ?? hookError) && (
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
              <span className="flex-1">{errorMsg ?? hookError}</span>
              <button
                type="button"
                onClick={() => fetchTeams()}
                className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                {t.retry}
              </button>
            </div>
          )}

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleSearchSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.searchLabel}
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
                    aria-label={t.searchPlaceholder}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.statusLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={activeFilter}
                  onChange={(e) => {
                    setFilters({
                      isActive: e.target.value || null,
                    });
                  }}
                >
                  <option value="">{t.statusAll}</option>
                  <option value="true">{t.statusActive}</option>
                  <option value="false">{t.statusInactive}</option>
                </select>
              </div>

              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.tournamentLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={tournamentFilter}
                  onFocus={loadTournaments}
                  onChange={(e) => {
                    setFilters({
                      tournamentId: e.target.value || null,
                    });
                  }}
                >
                  <option value="">{t.allTournaments}</option>
                  {tournamentOptions.map((tour) => (
                    <option key={tour.id} value={tour.id}>
                      {tour.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                {t.search}
              </button>
            </form>
          </section>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3 flex-wrap">
              <span className="text-sm font-medium">
                {format(
                  selected.size > 1
                    ? t.selectedCount_other
                    : t.selectedCount_one,
                  { count: selected.size }
                )}
              </span>
              <div className="flex-1" />
              <select
                className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
              >
                <option value="">{t.bulkActionPlaceholder}</option>
                <option value="activate">{t.bulkActivate}</option>
                <option value="deactivate">{t.bulkDeactivate}</option>
                <option value="delete">{t.bulkDeleteSoft}</option>
                <option value="assign">{t.bulkAssign}</option>
              </select>
              {bulkAction === 'assign' && (
                <select
                  className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                  value={assignTournamentId}
                  onFocus={loadTournaments}
                  onChange={(e) => setAssignTournamentId(e.target.value)}
                >
                  <option value="">{t.chooseTournament}</option>
                  {tournamentOptions.map((tour) => (
                    <option key={tour.id} value={tour.id}>
                      {tour.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleBulkAction}
                disabled={
                  bulkProcessing ||
                  !bulkAction ||
                  (bulkAction === 'assign' && !assignTournamentId)
                }
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {bulkProcessing ? t.bulkProcessing : t.bulkApply}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setBulkAction('');
                }}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
              >
                {t.cancel}
              </button>
            </div>
          )}

          {/* Teams List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonListRow key={i} />
                ))}
              </div>
            ) : teams.length === 0 ? (
              <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {/* Select all header */}
                <div className="px-4 py-3 bg-neutral-800/80 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.size === teams.length && teams.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-900"
                  />
                  <span className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
                    {t.selectAll}
                  </span>
                </div>

                {teams.map((team) => (
                  <div
                    key={team.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                      selected.has(team.id) ? 'bg-blue-900/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selected.has(team.id)}
                        onChange={() => toggleSelect(team.id)}
                        className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 flex-shrink-0"
                      />

                      {/* Logo */}
                      <div className="flex-shrink-0">
                        {team.logo_url ? (
                          <Image
                            src={team.logo_url}
                            alt={team.name}
                            width={48}
                            height={48}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-neutral-700"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                            <svg
                              className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-500"
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
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-white truncate">
                            {team.name}
                          </h3>
                          {team.short_name && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-700 text-neutral-300">
                              {team.short_name}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              team.is_active
                                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-neutral-600/20 text-neutral-400 border border-neutral-500/30'
                            }`}
                          >
                            {team.is_active ? t.active : t.inactive}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-sm text-neutral-400 flex-wrap">
                          {team.slug && (
                            <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                              /{team.slug}
                            </span>
                          )}
                          {team.country && (
                            <>
                              <span>{team.country}</span>
                              <span className="hidden sm:inline">•</span>
                            </>
                          )}
                          <span>
                            {format(t.createdOn, {
                              date: formatDate(team.created_at),
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 pl-7 sm:pl-0">
                      <Link
                        href={`/admin/teams/${team.id}/edit`}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-1.5"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        {t.edit}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(team)}
                        className="p-2 rounded-lg hover:bg-red-900/50 text-red-400 transition-colors"
                        title={t.deleteTitle}
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
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
              {format(t.paginationRange, {
                from: offset + 1,
                to: offset + teams.length,
              })}
              {total ? format(t.paginationOf, { total }) : ''}
            </span>

            <button
              type="button"
              disabled={loading || (total !== null && offset + LIMIT >= total)}
              onClick={() => setOffset(offset + LIMIT)}
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

      {/* Delete Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        disableEscapeClose={deleting}
        disableBackdropClose={deleting}
        showCloseButton={false}
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold">{t.deleteModalTitle}</h3>
              <p className="text-sm text-neutral-400">
                {t.deleteModalSubtitle}
              </p>
            </div>
          </div>
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              disabled={deleting}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={deleting}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                deleting
                  ? 'bg-red-800 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {deleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.deleting}
                </>
              ) : (
                t.deleteTitle
              )}
            </button>
          </>
        }
      >
        {deleteTarget && (
          <>
            <p className="text-sm text-neutral-300 mb-4 bg-neutral-900/50 rounded-xl p-3">
              {t.deleteConfirmBefore}
              <span className="font-semibold text-white">
                {deleteTarget.name}
              </span>
              {t.deleteConfirmAfter}
            </p>

            {errorMsg && (
              <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-red-400 flex-shrink-0"
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
                  onClick={() => fetchTeams()}
                  className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
                >
                  {t.retry}
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
      {/* Import Modal (CSV + plateformes) */}
      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        size="2xl"
        title={
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{t.importModalTitle}</h3>
            <button
              type="button"
              onClick={() => {
                setShowApiKeysModal(true);
                loadApiKeys();
              }}
              title={t.configApiKeysTitle}
              aria-label={t.configApiKeysTitle}
              className="p-1.5 rounded-lg hover:bg-neutral-700 transition-colors"
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowImportModal(false)}
              className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.close}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                importing ||
                (activeTab === 'csv' ? !csvText.trim() : !platformRef.trim())
              }
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.importing}
                </>
              ) : (
                t.importAction
              )}
            </button>
          </>
        }
      >
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-5 border-b border-neutral-700">
              {(
                [
                  ['csv', 'CSV'],
                  ['toornament', 'Toornament'],
                  ['challonge', 'Challonge'],
                  ['startgg', 'start.gg'],
                ] as [ImportTab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveTab(key);
                    setImportResult(null);
                  }}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === key
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-neutral-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* CSV tab */}
            {activeTab === 'csv' && (
              <>
                <p className="text-sm text-neutral-400 mb-4">
                  {t.csvFormatPrefix}
                  <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                    name,short_name,country,joueurs
                  </code>
                  <br />
                  {t.csvPlayersSepBefore}{' '}
                  <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                    ;
                  </code>{' '}
                  {t.csvPlayersSepAfter}
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-neutral-400 mb-1">
                    {t.csvFileLabel}
                  </label>
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={handleCsvFile}
                    className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-700 file:text-white hover:file:bg-neutral-600 file:cursor-pointer"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-neutral-400 mb-1">
                    {t.csvContentLabel}
                  </label>
                  <textarea
                    className="w-full h-40 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    placeholder={`name,short_name,country,joueurs\nTeam Alpha,TA,FR,Player1#1234;Player2#5678\nTeam Beta,TB,BE,Player3#9999`}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Platform tabs */}
            {activeTab !== 'csv' && (
              <>
                <p className="text-sm text-neutral-400 mb-4">
                  {activeTab === 'toornament' && (
                    <>
                      {t.toornamentProseBefore}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        https://www.toornament.com/tournaments/12345/
                      </code>{' '}
                      {t.proseOr}{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        12345
                      </code>
                      {t.prosePeriod}
                    </>
                  )}
                  {activeTab === 'challonge' && (
                    <>
                      {t.challongeProseBefore}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        https://challonge.com/mon-tournoi
                      </code>{' '}
                      {t.proseOr}{' '}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        mon-tournoi
                      </code>
                      {t.prosePeriod}
                    </>
                  )}
                  {activeTab === 'startgg' && (
                    <>
                      {t.startggProseBefore}
                      <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                        https://www.start.gg/tournament/genesis-9/event/melee-singles
                      </code>
                      {t.prosePeriod}
                    </>
                  )}
                  <br />
                  {t.apiKeyRequiredBefore}
                  <span className="inline-block">⚙️</span>
                  {t.apiKeyRequiredAfter}
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-neutral-400 mb-1">
                    {t.urlOrIdLabel}
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={
                      activeTab === 'toornament'
                        ? 'https://www.toornament.com/tournaments/...'
                        : activeTab === 'challonge'
                          ? 'https://challonge.com/...'
                          : 'https://www.start.gg/tournament/.../event/...'
                    }
                    value={platformRef}
                    onChange={(e) => setPlatformRef(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Tournoi cible (commun) */}
            <div className="mb-4">
              <label className="block text-sm text-neutral-400 mb-1">
                {t.registerToTournamentLabel}
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
                value={importTournamentId}
                onFocus={loadTournaments}
                onChange={(e) => setImportTournamentId(e.target.value)}
              >
                <option value="">{t.none}</option>
                {tournamentOptions.map((tour) => (
                  <option key={tour.id} value={tour.id}>
                    {tour.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Result (commun) */}
            {importResult && (
              <div className="mb-4 rounded-xl bg-neutral-900/50 border border-neutral-700 p-4 text-sm">
                <div className="flex gap-4 mb-2">
                  <span className="text-emerald-400">
                    {format(t.resultCreated, { count: importResult.created })}
                  </span>
                  {importResult.skipped > 0 && (
                    <span className="text-amber-400">
                      {format(t.resultSkipped, {
                        count: importResult.skipped,
                      })}
                    </span>
                  )}
                  {importResult.errors.length > 0 && (
                    <span className="text-red-400">
                      {format(t.resultErrors, {
                        count: importResult.errors.length,
                      })}
                    </span>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <ul className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>
                        {e.row > 0
                          ? format(t.resultLinePrefix, { row: e.row })
                          : ''}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

        </>
      </Modal>

      {/* API keys config sub-modal */}
      <Modal
        open={showApiKeysModal}
        onClose={() => setShowApiKeysModal(false)}
        size="lg"
        zIndexClassName="z-[60]"
        disableBackdropClose={apiKeysSaving}
        disableEscapeClose={apiKeysSaving}
        title={<h3 className="text-lg font-semibold">{t.apiKeysModalTitle}</h3>}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowApiKeysModal(false)}
              disabled={apiKeysSaving}
              className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={saveApiKeys}
              disabled={apiKeysSaving || apiKeysLoading}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {apiKeysSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.saving}
                </>
              ) : (
                t.save
              )}
            </button>
          </>
        }
      >
        <>
          <p className="text-xs text-amber-300/80 mb-4">
              ⚠️ {t.apiKeysWarningBefore}
              <code className="bg-neutral-900 px-1 rounded">site_settings</code>
              {t.apiKeysWarningAfter}
            </p>

            {apiKeysLoading ? (
              <p className="text-sm text-neutral-400">{t.loading}</p>
            ) : (
              <div className="space-y-4">
                {(['toornament', 'challonge', 'startgg'] as const).map((k) => {
                  const labels: Record<typeof k, string> = {
                    toornament: t.labelToornament,
                    challonge: t.labelChallonge,
                    startgg: t.labelStartgg,
                  };
                  const isRevealed = revealedKey === k;
                  return (
                    <div key={k}>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {labels[k]}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type={isRevealed ? 'text' : 'password'}
                          className="flex-1 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                          value={apiKeys[k]}
                          onChange={(e) =>
                            setApiKeys((prev) => ({
                              ...prev,
                              [k]: e.target.value,
                            }))
                          }
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setRevealedKey(isRevealed ? null : k)}
                          className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
                        >
                          {isRevealed ? t.hide : t.reveal}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </>
      </Modal>
    </>
  );
}

export const getServerSideProps = withStaffPage(
  'manager',
  async (ctx, staffCtx) => {
    const { query } = ctx;
    const search = sanitizeSearch(query.search);
    const isActive = typeof query.isActive === 'string' ? query.isActive : '';
    const tournamentId =
      typeof query.tournamentId === 'string' ? query.tournamentId : '';
    const offset = Math.max(0, Number(query.offset) || 0);

    if (!supabaseAdmin) {
      return {
        initialTeams: [],
        initialTotal: null,
        initialOffset: offset,
        errorMsg: 'Service indisponible',
      };
    }

    const { tenantId } = staffCtx;

    let q = supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + LIMIT - 1);

    if (isActive === 'true') q = q.eq('is_active', true);
    if (isActive === 'false') q = q.eq('is_active', false);
    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      q = q.or(`name.ilike.${s},slug.ilike.${s},short_name.ilike.${s}`);
    }
    if (tournamentId) {
      const { data: regs } = await supabaseAdmin
        .from('tournament_teams')
        .select('team_id')
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId);
      const teamIds = (regs || []).map((r) => r.team_id).filter(Boolean);
      if (teamIds.length === 0) {
        return {
          initialTeams: [],
          initialTotal: 0,
          initialOffset: offset,
          errorMsg: null,
        };
      }
      q = q.in('id', teamIds);
    }

    const { data, error, count } = await q;

    if (error) {
      logger.error('admin teams SSR error:', error);
      return {
        initialTeams: [],
        initialTotal: null,
        initialOffset: offset,
        errorMsg: 'Erreur lors du chargement',
      };
    }

    return {
      initialTeams: (data || []) as TeamRow[],
      initialTotal: typeof count === 'number' ? count : null,
      initialOffset: offset,
      errorMsg: null,
    };
  }
);

export default AdminTeamsListPage;
