import TeamImportModal from '@/components/admin/teams/TeamImportModal';
import { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
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
import TeamExportActions from '@/components/admin/teams/TeamExportActions';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import type { TeamRow } from '@/types/admin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import TeamsListFilters from '@/features/admin/teams/ui/TeamsListFilters';
import TeamsListBulkBar from '@/features/admin/teams/ui/TeamsListBulkBar';
import TeamsListTable from '@/features/admin/teams/ui/TeamsListTable';
import TeamsListPagination from '@/features/admin/teams/ui/TeamsListPagination';
import {
  TeamsListApiKeysModal,
  TeamsListDeleteModal,
  TeamsListErrorBanner,
} from '@/features/admin/teams/ui/TeamsListModals';

import { logger } from '../../../utils/logger';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';
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

type TeamsApiResponse = { teams: TeamRow[]; total: number | null };

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
  const t = useAdminT(nsAdminTeamsList);
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
          ((json.tournaments || []) as { id: string; name: string }[]).map(
            (tour) => ({
              id: tour.id,
              name: tour.name,
            })
          )
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
      const body: {
        action: string;
        teamIds: string[];
        tournamentId?: string;
      } = {
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminPageHeader
          title={t.heading}
          subtitle={
            total !== null
              ? format(total > 1 ? t.teamCount_other : t.teamCount_one, {
                  count: total,
                })
              : t.loading
          }
          actions={
            <>
              <TeamExportActions filters={filters} />
              <AdminButton
                variant="ghost"
                onClick={() => {
                  setShowImportModal(true);
                  setImportResult(null);
                  setCsvText('');
                  setPlatformRef('');
                }}
              >
                {t.import}
              </AdminButton>
              <AdminButtonLink href="/admin/teams/new" variant="primary">
                {t.newTeam}
              </AdminButtonLink>
            </>
          }
        />

        {(errorMsg ?? hookError) && (
          <TeamsListErrorBanner
            className="mb-6"
            message={(errorMsg ?? hookError) as string}
            onRetry={() => fetchTeams()}
          />
        )}

        <TeamsListFilters
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSubmit={handleSearchSubmit}
          activeFilter={activeFilter}
          onActiveFilterChange={(v) => setFilters({ isActive: v })}
          tournamentFilter={tournamentFilter}
          onTournamentFilterChange={(v) => setFilters({ tournamentId: v })}
          tournamentOptions={tournamentOptions}
          onTournamentFocus={loadTournaments}
        />

        {selected.size > 0 && (
          <TeamsListBulkBar
            count={selected.size}
            bulkAction={bulkAction}
            onBulkActionChange={setBulkAction}
            assignTournamentId={assignTournamentId}
            onAssignTournamentChange={setAssignTournamentId}
            tournamentOptions={tournamentOptions}
            onTournamentFocus={loadTournaments}
            processing={bulkProcessing}
            onApply={handleBulkAction}
            onCancel={() => {
              setSelected(new Set());
              setBulkAction('');
            }}
          />
        )}

        <TeamsListTable
          teams={teams}
          loading={loading}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onDelete={setDeleteTarget}
        />

        <TeamsListPagination
          offset={offset}
          shown={teams.length}
          total={total}
          prevDisabled={offset === 0 || loading}
          nextDisabled={loading || (total !== null && offset + LIMIT >= total)}
          onPrev={() => setOffset(Math.max(0, offset - LIMIT))}
          onNext={() => setOffset(offset + LIMIT)}
        />
      </div>

      <TeamsListDeleteModal
        target={deleteTarget}
        deleting={deleting}
        errorMsg={errorMsg}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onRetry={() => fetchTeams()}
      />
      <TeamImportModal
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        csvText={csvText}
        setCsvText={setCsvText}
        platformRef={platformRef}
        setPlatformRef={setPlatformRef}
        importTournamentId={importTournamentId}
        setImportTournamentId={setImportTournamentId}
        tournamentOptions={tournamentOptions}
        importing={importing}
        importResult={importResult}
        setImportResult={setImportResult}
        setShowApiKeysModal={setShowApiKeysModal}
        handleImport={handleImport}
        handleCsvFile={handleCsvFile}
        loadTournaments={loadTournaments}
        loadApiKeys={loadApiKeys}
      />

      <TeamsListApiKeysModal
        open={showApiKeysModal}
        onClose={() => setShowApiKeysModal(false)}
        loading={apiKeysLoading}
        saving={apiKeysSaving}
        onSave={saveApiKeys}
        apiKeys={apiKeys}
        onApiKeyChange={(k, value) =>
          setApiKeys((prev) => ({ ...prev, [k]: value }))
        }
        revealedKey={revealedKey}
        onToggleReveal={(k) => setRevealedKey(revealedKey === k ? null : k)}
      />
    </>
  );
}

export const getServerSideProps = withStaffPage(
  { permission: 'manage_teams' },
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
      .is('deleted_at', null) // corbeille : cf. /api/admin/teams (même filtre)
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
