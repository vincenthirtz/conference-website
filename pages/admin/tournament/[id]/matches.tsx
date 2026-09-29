// pages/admin/tournament/[id]/matches.ts
//
// Passe « Le Ruban » (lot 8A) : l'écran ne garde que l'état, les chargements
// et les écritures. Les blocs d'affichage vivent dans
// features/admin/tournaments/ui/TournamentMatches*.tsx ; la détection des
// conflits et l'import CSV, sortis tels quels, dans
// features/admin/tournaments/hooks/useTournamentMatches*.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAutoSchedule } from '@/hooks/useAutoSchedule';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { stageUrls } from '@/features/admin/stages/client';
import {
  tournamentMatchUrls,
  tournamentUrls,
} from '@/features/admin/tournaments/client';
import { useTournamentDetail } from '@/features/admin/tournaments/hooks/useTournamentDetail';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type {
  StaffProps,
  Match,
  StageSummary,
  TournamentMini,
} from '@/types/admin';
import nsAdminTournamentMatches from '@/lib/i18n/locales/admin-fr/adminTournamentMatches';
import { buildAdminMatchesQuery } from '@/utils/matches/adminMatchesQuery';
import {
  groupMatchesByTzDay,
  isoToTzInput,
  resolveTournamentTz,
  tzInputToIso,
} from '@/utils/matches/adminMatchesTz';
import { useTournamentMatchesConflicts } from '@/features/admin/tournaments/hooks/useTournamentMatchesConflicts';
import { useTournamentMatchesCsvImport } from '@/features/admin/tournaments/hooks/useTournamentMatchesCsvImport';
import TournamentMatchesHeader from '@/features/admin/tournaments/ui/TournamentMatchesHeader';
import TournamentMatchesFilters from '@/features/admin/tournaments/ui/TournamentMatchesFilters';
import TournamentMatchesViewBar from '@/features/admin/tournaments/ui/TournamentMatchesViewBar';
import {
  TournamentMatchesBulkBar,
  TournamentMatchesBulkEditPanel,
  TournamentMatchesBulkSchedulePanel,
} from '@/features/admin/tournaments/ui/TournamentMatchesBulk';
import TournamentMatchesCsvPanel from '@/features/admin/tournaments/ui/TournamentMatchesCsvPanel';
import TournamentMatchesCalendar from '@/features/admin/tournaments/ui/TournamentMatchesCalendar';
import TournamentMatchesList, {
  TournamentMatchesPagination,
} from '@/features/admin/tournaments/ui/TournamentMatchesList';

type MatchesApiResponse = {
  tournament: (TournamentMini & { timezone?: string | null }) | null;
  stages: StageSummary[];
  matches: Match[];
  total: number | null;
};

export const getServerSideProps = withStaffPage({
  permission: 'arbitrate_matches',
});

function AdminTournamentMatchesPage(_props: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { mutate: csvImportMutate } = useIdempotentMutation();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const t = useAdminT(nsAdminTournamentMatches);

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [tournament, setTournament] =
    useState<MatchesApiResponse['tournament']>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fuseau du tournoi (cf. utils/matches/adminMatchesTz), lu sur la fiche : un
  // arbitre sans `manage_tournaments` (403) reste sur Europe/Paris.
  const tzQuery = useTournamentDetail<{ timezone?: string | null }>(
    String(id ?? '')
  );
  const tournamentTz = tzQuery.data?.tournament?.timezone ?? null;
  const timezone = resolveTournamentTz(tournament?.timezone ?? tournamentTz);

  // filters
  // stageFilter est hydraté depuis l'URL (?stageId=...) une fois le router
  // ready — filtersHydrated bloque le premier fetch tant que ce n'est pas fait
  // (évite un fetch sans filtre suivi d'un second avec).
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roundFilter, setRoundFilter] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  // auto-scheduler
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  // inline quick-score
  // L'état d'édition (score1/score2) vit dans <QuickScoreEditor> pour ne pas
  // re-render toute la page à chaque frappe ; ici on ne garde que la ligne en
  // cours d'édition (une seule à la fois) et l'état de sauvegarde.
  const [quickScoreId, setQuickScoreId] = useState<string | null>(null);
  const [qsSaving, setQsSaving] = useState(false);

  // Bulk selection
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(
    new Set()
  );

  // Bulk scheduling
  // Les valeurs par ligne vivent dans <BulkScheduleRow> (state local) et sont
  // remontées dans une ref (pas de state page) pour ne pas re-render toute la
  // page à chaque frappe. La ref est la source de vérité lue au submit.
  const [bulkScheduleMode, setBulkScheduleMode] = useState(false);
  const bulkScheduleValuesRef = useRef<Record<string, string>>({});
  const bulkScheduleInitialRef = useRef<Record<string, string>>({});
  // Diffusion « appliquer la même date/heure à tout » : le bump de nonce
  // pousse la valeur dans chaque ligne via un effet (action rare, pas frappe).
  const [bulkBroadcast, setBulkBroadcast] = useState<{
    value: string;
    nonce: number;
  }>({ value: '', nonce: 0 });
  const [bulkScheduleSaving, setBulkScheduleSaving] = useState(false);

  // Bulk delete
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [pendingBulkDeleteHard, setPendingBulkDeleteHard] = useState(false);

  // Bulk edit
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditFields, setBulkEditFields] = useState<{
    status?: string;
    best_of?: number | null;
    round_number?: number | null;
    notes?: string;
  }>({});
  const [bulkEditSaving, setBulkEditSaving] = useState(false);

  // View mode: list or calendar
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Conflits horaires (équipe ou stream sur des créneaux qui se chevauchent) :
  // calcul sorti tel quel dans useTournamentMatchesConflicts.
  const { conflicts, conflictMatchIds } = useTournamentMatchesConflicts(
    matches,
    timezone
  );

  // Calendar data: matchs groupés par jour DU TOURNOI (pas du navigateur).
  const calendarDays = useMemo(
    () => groupMatchesByTzDay(matches, timezone),
    [matches, timezone]
  );

  async function fetchMatches() {
    if (!id) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const query = buildAdminMatchesQuery({
        view: viewMode,
        limit,
        offset,
        stageId: stageFilter,
        status: statusFilter,
        roundNumber: roundFilter,
        result: resultFilter,
        dateFrom: dateFromFilter,
        dateTo: dateToFilter,
        timezone,
        search,
      });
      const json = await adminFetchJson<MatchesApiResponse>(
        tournamentUrls.matches(String(id), query)
      );
      setTournament(json.tournament);
      setStages(json.stages || []);
      setMatches(json.matches || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
      setSelectedMatchIds(new Set());
      setBulkScheduleMode(false);
      bulkScheduleValuesRef.current = {};
      bulkScheduleInitialRef.current = {};
      setBulkBroadcast({ value: '', nonce: 0 });
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  // Ref sur fetchMatches pour que les handlers mémoïsés (useCallback) puissent
  // rafraîchir sans dépendre des multiples filtres capturés par la closure.
  const fetchMatchesRef = useRef(fetchMatches);
  fetchMatchesRef.current = fetchMatches;

  // Hydratation des filtres depuis l'URL à l'arrivée sur la page.
  // Le router Next n'est pas ready au premier render : on attend router.isReady
  // avant de lire query.stageId, puis on débloque le fetch.
  useEffect(() => {
    if (!router.isReady) return;
    const rawStageId = router.query.stageId;
    const stageId = Array.isArray(rawStageId) ? rawStageId[0] : rawStageId;
    if (stageId) {
      setStageFilter(stageId);
      setOffset(0);
    }
    setFiltersHydrated(true);
  }, [router.isReady, router.query.stageId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: GARDÉ : deps curées à dessein. `search` est exclu (appliqué au submit) ; `fetchMatches` ne peut pas être mémoïsé/listé sans casse : il est appelé à la fois par cet effet (qui NE doit PAS dépendre de `search`) et par handleFilterSubmit/handlers (qui DOIVENT lire le `search` courant → closure fraîche à chaque render, cf. fetchMatchesRef). adminFetch* est stable mais n'y change rien.
  useEffect(() => {
    if (!id || !filtersHydrated) return;
    fetchMatches();
  }, [
    id,
    filtersHydrated,
    offset,
    stageFilter,
    statusFilter,
    roundFilter,
    resultFilter,
    dateFromFilter,
    dateToFilter,
    timezone,
    viewMode,
  ]);

  // Auto-scheduler : simulation, relecture, puis écriture. Le flux vit dans
  // `useAutoSchedule` — trois échanges avec le serveur et deux confirmations
  // n'ont pas leur place au milieu d'un écran de liste.
  const { running: autoSchedRunning, run: handleAutoSchedule } =
    useAutoSchedule({
      tournamentId: id ? String(id) : undefined,
      mutateIdempotent,
      confirm,
      addToast,
      onError: setErrorMsg,
      onDone: fetchMatches,
      labels: t,
    });

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchMatches();
  }

  // Toggle open/close de l'éditeur inline pour une ligne (une seule à la fois).
  const handleToggleQuickScore = useCallback((matchId: string) => {
    setQuickScoreId((prev) => (prev === matchId ? null : matchId));
  }, []);

  const handleQuickScoreCancel = useCallback(() => {
    setQuickScoreId(null);
  }, []);

  const handleQuickScore = useCallback(
    async (matchId: string, s1: string, s2: string) => {
      if (s1 === '' || s2 === '') return;
      setQsSaving(true);
      setErrorMsg(null);

      try {
        await adminFetchJson(tournamentMatchUrls.byId(matchId), {
          method: 'PUT',
          body: JSON.stringify({
            mode: 'score',
            team1Score: Number(s1),
            team2Score: Number(s2),
            propagate: true,
          }),
        });

        setQuickScoreId(null);
        fetchMatchesRef.current();
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errorQuickScore);
      } finally {
        setQsSaving(false);
      }
    },
    [adminFetchJson, t]
  );

  // --- Bulk selection ---
  const toggleMatchSelection = useCallback((matchId: string) => {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }, []);

  function toggleSelectAll() {
    if (selectedMatchIds.size === matches.length) {
      setSelectedMatchIds(new Set());
    } else {
      setSelectedMatchIds(new Set(matches.map((m) => m.id)));
    }
  }

  // --- Bulk scheduling ---
  function enterBulkScheduleMode() {
    setBulkScheduleMode(true);
    // Init inputs from current scheduled_at values for selected matches
    const inputs: Record<string, string> = {};
    matches.forEach((m) => {
      if (selectedMatchIds.has(m.id)) {
        inputs[m.id] = isoToTzInput(m.scheduled_at, timezone);
      }
    });
    bulkScheduleInitialRef.current = inputs;
    bulkScheduleValuesRef.current = { ...inputs };
    setBulkBroadcast({ value: '', nonce: 0 });
  }

  function setBulkScheduleForAll(dateTime: string) {
    const inputs: Record<string, string> = {};
    selectedMatchIds.forEach((matchId) => {
      inputs[matchId] = dateTime;
    });
    bulkScheduleValuesRef.current = inputs;
    setBulkBroadcast((prev) => ({ value: dateTime, nonce: prev.nonce + 1 }));
  }

  // Remontée d'une valeur de ligne dans la ref (aucun re-render page).
  const handleBulkInputChange = useCallback(
    (matchId: string, value: string) => {
      bulkScheduleValuesRef.current = {
        ...bulkScheduleValuesRef.current,
        [matchId]: value,
      };
    },
    []
  );

  async function handleBulkScheduleSave() {
    if (!stageFilter) {
      setErrorMsg(t.errorBulkScheduleNoStage);
      return;
    }

    const schedules = Object.entries(bulkScheduleValuesRef.current).map(
      ([matchId, dt]) => ({
        matchId,
        scheduled_at: tzInputToIso(dt, timezone),
      })
    );

    if (schedules.length === 0) return;

    setBulkScheduleSaving(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(stageUrls.bulkMatches(stageFilter), {
        method: 'PATCH',
        body: JSON.stringify({ schedules }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorBulkSchedule);
      }

      const json = await res.json();
      const successCount = json.successCount ?? 0;
      addToast(
        format(
          successCount > 1
            ? t.toastBulkScheduled_other
            : t.toastBulkScheduled_one,
          { count: successCount }
        ),
        'info'
      );
      setBulkScheduleMode(false);
      fetchMatches();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorBulkScheduleUnexpected);
    } finally {
      setBulkScheduleSaving(false);
    }
  }

  // --- Bulk delete/cancel ---
  function handleBulkDelete(hard: boolean) {
    if (!stageFilter) {
      setErrorMsg(t.errorBulkDeleteNoStage);
      return;
    }

    if (selectedMatchIds.size === 0) return;

    setPendingBulkDeleteHard(hard);
    setShowBulkDeleteConfirm(true);
  }

  async function executeBulkDelete() {
    const hard = pendingBulkDeleteHard;
    const count = selectedMatchIds.size;

    setBulkDeleting(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(stageUrls.bulkMatches(stageFilter), {
        method: 'DELETE',
        body: JSON.stringify({
          matchIds: Array.from(selectedMatchIds),
          hard,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorBulkDelete);
      }

      const verb = hard ? t.verbDeleted : t.verbCancelled;
      addToast(
        format(count > 1 ? t.toastBulkDeleted_other : t.toastBulkDeleted_one, {
          count,
          verb,
        }),
        'info'
      );
      fetchMatches();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorBulkDeleteUnexpected);
    } finally {
      setBulkDeleting(false);
    }
  }

  // --- Bulk edit ---
  async function handleBulkEditSave() {
    if (!stageFilter) {
      setErrorMsg(t.errorBulkEditNoStage);
      return;
    }
    if (selectedMatchIds.size === 0) return;

    const fields: Record<string, unknown> = {};
    if (bulkEditFields.status) fields.status = bulkEditFields.status;
    if (bulkEditFields.best_of !== undefined)
      fields.best_of = bulkEditFields.best_of;
    if (bulkEditFields.round_number !== undefined)
      fields.round_number = bulkEditFields.round_number;
    if (bulkEditFields.notes !== undefined) fields.notes = bulkEditFields.notes;

    if (Object.keys(fields).length === 0) {
      setErrorMsg(t.errorNoFieldToEdit);
      return;
    }

    setBulkEditSaving(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(stageUrls.bulkMatches(stageFilter), {
        method: 'PUT',
        body: JSON.stringify({
          matchIds: Array.from(selectedMatchIds),
          fields,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorBulkEdit);
      }

      const json = await res.json();
      addToast(
        format(t.toastBulkEdited, {
          count: json.count ?? selectedMatchIds.size,
        }),
        'info'
      );
      setBulkEditMode(false);
      setBulkEditFields({});
      fetchMatches();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorBulkEditUnexpected);
    } finally {
      setBulkEditSaving(false);
    }
  }

  // Import CSV : états et handlers sortis tels quels dans
  // useTournamentMatchesCsvImport.
  const {
    csvImportMode,
    setCsvImportMode,
    csvText,
    setCsvText,
    csvImporting,
    csvPreview,
    setCsvPreview,
    parseCsvPreview,
    handleCsvImport,
  } = useTournamentMatchesCsvImport({
    id,
    stageFilter,
    timezone,
    adminFetch,
    csvImportMutate,
    addToast,
    setErrorMsg,
    fetchMatches,
    t,
  });

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="print-document min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="print:hidden">
          <TournamentTabsNav tournamentId={String(id ?? '')} active="matches" />
        </div>

        <TournamentMatchesHeader
          t={t}
          tournament={tournament}
          timezone={timezone}
          total={total}
          tournamentId={id}
          autoSchedRunning={autoSchedRunning}
          onAutoSchedule={handleAutoSchedule}
          csvImportMode={csvImportMode}
          onToggleCsvImport={() => setCsvImportMode(!csvImportMode)}
        />

        {/* Messages */}
        {errorMsg && (
          <div
            className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
            role="alert"
          >
            {errorMsg}
          </div>
        )}

        <TournamentMatchesFilters
          t={t}
          stages={stages}
          onSubmit={handleFilterSubmit}
          stageFilter={stageFilter}
          setStageFilter={setStageFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          roundFilter={roundFilter}
          setRoundFilter={setRoundFilter}
          resultFilter={resultFilter}
          setResultFilter={setResultFilter}
          dateFromFilter={dateFromFilter}
          setDateFromFilter={setDateFromFilter}
          dateToFilter={dateToFilter}
          setDateToFilter={setDateToFilter}
          search={search}
          setSearch={setSearch}
          setOffset={setOffset}
        />

        <TournamentMatchesViewBar
          t={t}
          viewMode={viewMode}
          onViewMode={setViewMode}
          conflicts={conflicts}
        />

        {selectedMatchIds.size > 0 && (
          <TournamentMatchesBulkBar
            t={t}
            count={selectedMatchIds.size}
            showModeButtons={!bulkScheduleMode && !bulkEditMode}
            onBulkSchedule={enterBulkScheduleMode}
            onBulkEdit={() => setBulkEditMode(true)}
            bulkDeleting={bulkDeleting}
            onBulkDelete={handleBulkDelete}
            onClearSelection={() => {
              setSelectedMatchIds(new Set());
              setBulkScheduleMode(false);
              setBulkEditMode(false);
              setBulkEditFields({});
            }}
          />
        )}

        {bulkScheduleMode && selectedMatchIds.size > 0 && (
          <TournamentMatchesBulkSchedulePanel
            t={t}
            count={selectedMatchIds.size}
            timezone={timezone}
            selectedMatches={matches.filter((m) => selectedMatchIds.has(m.id))}
            initialValues={bulkScheduleInitialRef.current}
            broadcast={bulkBroadcast}
            onBroadcastAll={setBulkScheduleForAll}
            onRowChange={handleBulkInputChange}
            saving={bulkScheduleSaving}
            onSave={handleBulkScheduleSave}
            onClose={() => setBulkScheduleMode(false)}
            stageSelected={!!stageFilter}
          />
        )}

        {bulkEditMode && selectedMatchIds.size > 0 && (
          <TournamentMatchesBulkEditPanel
            t={t}
            count={selectedMatchIds.size}
            fields={bulkEditFields}
            setFields={setBulkEditFields}
            saving={bulkEditSaving}
            onSave={handleBulkEditSave}
            onClose={() => {
              setBulkEditMode(false);
              setBulkEditFields({});
            }}
            stageSelected={!!stageFilter}
          />
        )}

        {csvImportMode && (
          <TournamentMatchesCsvPanel
            t={t}
            csvText={csvText}
            onTextChange={(text) => {
              setCsvText(text);
              parseCsvPreview(text);
            }}
            preview={csvPreview}
            importing={csvImporting}
            onImport={handleCsvImport}
            onClose={() => {
              setCsvImportMode(false);
              setCsvText('');
              setCsvPreview([]);
            }}
          />
        )}

        {viewMode === 'calendar' && (
          <TournamentMatchesCalendar
            t={t}
            loading={loading}
            matches={matches}
            calendarDays={calendarDays}
            conflictMatchIds={conflictMatchIds}
            timezone={timezone}
          />
        )}

        {viewMode === 'list' && (
          <TournamentMatchesList
            t={t}
            loading={loading}
            matches={matches}
            selectedMatchIds={selectedMatchIds}
            onToggleSelectAll={toggleSelectAll}
            conflictMatchIds={conflictMatchIds}
            timezone={timezone}
            quickScoreId={quickScoreId}
            qsSaving={qsSaving}
            onToggleSelect={toggleMatchSelection}
            onToggleQuickScore={handleToggleQuickScore}
            onQuickScoreSubmit={handleQuickScore}
            onQuickScoreCancel={handleQuickScoreCancel}
          />
        )}

        {/* Pagination — liste seulement : le calendrier charge tout. */}
        {viewMode === 'list' && matches.length > 0 && (
          <TournamentMatchesPagination
            t={t}
            offset={offset}
            shown={matches.length}
            total={total}
            prevDisabled={offset === 0}
            nextDisabled={total !== null && offset + limit >= total}
            onPrev={() => setOffset(Math.max(0, offset - limit))}
            onNext={() => setOffset(offset + limit)}
          />
        )}
      </div>
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          variant="danger"
          title={
            pendingBulkDeleteHard
              ? format(
                  selectedMatchIds.size > 1
                    ? t.confirmHardDeleteTitle_other
                    : t.confirmHardDeleteTitle_one,
                  { count: selectedMatchIds.size }
                )
              : format(
                  selectedMatchIds.size > 1
                    ? t.confirmCancelTitle_other
                    : t.confirmCancelTitle_one,
                  { count: selectedMatchIds.size }
                )
          }
          subtitle={
            pendingBulkDeleteHard ? t.confirmHardDeleteSubtitle : undefined
          }
          confirmLabel={
            pendingBulkDeleteHard ? t.confirmDeleteLabel : t.confirmCancelLabel
          }
          confirmingLabel={
            pendingBulkDeleteHard
              ? t.confirmDeletingLabel
              : t.confirmCancellingLabel
          }
          loading={bulkDeleting}
          onConfirm={async () => {
            await executeBulkDelete();
            setShowBulkDeleteConfirm(false);
          }}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </>
  );
}

export default withAdminQuery(AdminTournamentMatchesPage);
