// pages/admin/tournament/[id]/dashboard.tsx
// Mega-dashboard "Centre de contrôle" du tournoi.
// Remplace l'ancienne vue lecture-seule par un hub actionnable :
// KPIs, alertes priorisées, status workflow, phases, équipes,
// matchs en cours / à venir / disputes, check-in du jour, accès rapide aux 15 sous-pages.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { hasAtLeastRole } from '@/utils/staffRoles';
import type { StaffProps, StaffRole } from '@/types/admin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import {
  useTournamentDetail,
  useUpdateTournament,
} from '@/features/admin/tournaments/hooks/useTournamentDetail';
import {
  useTenantTeamsForEntry,
  useTournamentTeams,
} from '@/features/admin/tournaments/hooks/useTournamentTeams';
import { useToast } from '@/components/Toast';
import TournamentAlerts from '@/components/admin/dashboard/TournamentAlerts';
import TournamentDashboardMatchModals from '@/features/admin/tournaments/TournamentDashboardMatchModals';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import AddTeamModal from '@/components/admin/tournament/overview/AddTeamModal';
import BulkAddTeamsModal from '@/components/admin/tournament/overview/BulkAddTeamsModal';
import NewStageModal from '@/components/admin/tournament/overview/NewStageModal';
import type {
  Team,
  TournamentTeam,
} from '@/components/admin/tournament/overview/types';
import type { RegistrationField } from '@/utils/registrationFields';
import {
  fetchDashboardData,
  type DashboardData,
} from '@/utils/dashboard/buildTournamentDashboard';
import nsAdminTournamentDashboard from '@/lib/i18n/locales/admin-fr/adminTournamentDashboard';
import nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import TournamentDashboardHeader, {
  getTournamentStatusLabels,
  jDayLabel,
} from '@/features/admin/tournaments/ui/TournamentDashboardHeader';
import TournamentDashboardKpis, {
  computeLiveEta,
} from '@/features/admin/tournaments/ui/TournamentDashboardKpis';
import TournamentDashboardWorkflow from '@/features/admin/tournaments/ui/TournamentDashboardWorkflow';
import TournamentDashboardStages, {
  getStageTypeOptions,
} from '@/features/admin/tournaments/ui/TournamentDashboardStages';
import TournamentDashboardTeams from '@/features/admin/tournaments/ui/TournamentDashboardTeams';
import {
  TournamentDashboardActivity,
  TournamentDashboardCheckin,
  TournamentDashboardHealth,
} from '@/features/admin/tournaments/ui/TournamentDashboardOps';
import TournamentDashboardMatches, {
  type DashboardMatchTarget,
} from '@/features/admin/tournaments/ui/TournamentDashboardMatches';
import TournamentDashboardQuickLinks, {
  getQuickLinks,
} from '@/features/admin/tournaments/ui/TournamentDashboardQuickLinks';
import {
  TournamentDashboardActionError,
  TournamentDashboardLoadError,
  TournamentDashboardLoading,
} from '@/features/admin/tournaments/ui/TournamentDashboardStates';

/* -----------------------------------------------------------
 * Constantes UI
 * ---------------------------------------------------------*/

// Le realtime (canal `matches`) assure la fraîcheur immédiate. Le polling
// n'est qu'un filet de sécurité si la souscription tombe → intervalle large
// pour éviter les refetch complets redondants pendant un tournoi live.
const REFRESH_INTERVAL_MS = 90_000;

// Fenêtre de coalescing des rafales d'UPDATE de matchs (score → statut →
// scheduled_at…) : on regroupe les notifications realtime rapprochées en un
// seul refetch du payload dashboard.
const REALTIME_DEBOUNCE_MS = 400;
const EMPTY_TEAMS: TournamentTeam[] = [];
const EMPTY_ALL_TEAMS: Team[] = [];

// Ordre de progression du workflow — sert à détecter une régression de statut
// (retour en arrière) qui déclenche la confirmation.
const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  published: 1,
  running: 2,
  completed: 3,
  archived: 4,
};

/* -----------------------------------------------------------
 * Page
 * ---------------------------------------------------------*/

type SsrProps = {
  initialData: DashboardData | null;
  initialError: string | null;
};

export const getServerSideProps = withStaffPage<SsrProps>(
  { permission: 'manage_tournaments' },
  async (ctx) => {
    const rawId = ctx.params?.id ?? ctx.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id)
      return { initialData: null, initialError: 'Invalid tournament id' };

    const result = await fetchDashboardData(String(id));
    if (!result.ok) {
      return { initialData: null, initialError: result.error };
    }
    return { initialData: result.data, initialError: null };
  }
);

type Props = StaffProps & SsrProps;

function MegaDashboardPage({ staff, initialData, initialError }: Props) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const tx = useAdminT(nsAdminTournamentDashboard);
  // Dict overview pour les sections restées dans le dashboard (statut cliquable,
  // gestion d'équipes, création de phase + leurs modales/composants).
  const tov = useAdminT(nsAdminTournamentOverview);
  const STATUS_LABEL = getTournamentStatusLabels(tx);
  const QUICK_LINKS = getQuickLinks(tx);
  const STAGE_TYPE_OPTIONS = getStageTypeOptions(tov);

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const updateTournament = useUpdateTournament(tournamentId ?? '');
  const { mutate: addTeamMutate } = useIdempotentMutation();
  const { mutate: createStageMutate } = useIdempotentMutation();

  const [loading, setLoading] = useState(initialData == null);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(
    initialData ? new Date() : null
  );
  const [stale, setStale] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Modales d'actions inline
  const [scoreTarget, setScoreTarget] = useState<DashboardMatchTarget | null>(
    null
  );
  const [disputeTarget, setDisputeTarget] = useState<
    (DashboardMatchTarget & { reason: string | null }) | null
  >(null);
  const [advanceTarget, setAdvanceTarget] = useState<{
    stageId: string;
    stageName: string;
  } | null>(null);

  /* -----------------------------------------------------------
   * State des sections gérées dans le dashboard (statut + équipes)
   * ---------------------------------------------------------*/

  // registration_fields absent du payload dashboard : nécessaire pour les
  // colonnes des cartes équipe (TeamRow). Lu sur la fiche (silencieux).
  const detailQuery = useTournamentDetail<{
    registration_fields: RegistrationField[] | null;
  }>(tournamentId ?? '');
  const registrationFieldsMeta =
    detailQuery.data?.tournament?.registration_fields ?? null;

  // Erreur inline pour les actions statut/équipes (bannière rouge locale).
  const [actionError, setActionError] = useState<string | null>(null);

  // Gestion d'équipes
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  // Échecs silencieux (la liste précédente reste), comme avant.
  const teamsQuery = useTournamentTeams(tournamentId ?? '');
  const tournamentTeams = teamsQuery.data ?? EMPTY_TEAMS;
  const loadingTeams = teamsQuery.isFetching;
  const fetchTournamentTeams = teamsQuery.refetch;
  const allTeams =
    useTenantTeamsForEntry(showAddTeamModal || showBulkAddModal).data ??
    EMPTY_ALL_TEAMS;
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [pendingRemoveTeamId, setPendingRemoveTeamId] = useState<string | null>(
    null
  );

  // Changement de statut (stepper interactif)
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [pendingStatusValue, setPendingStatusValue] = useState<string | null>(
    null
  );

  // Création de phase
  const [showNewStageModal, setShowNewStageModal] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(tournamentUrls.dashboard(tournamentId));
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || tx.errorLoad);
      }
      setData(await res.json());
      setLastFetchedAt(new Date());
      setStale(false);
      setErrorMsg(null);
    } catch (err: unknown) {
      // Garde le snapshot précédent et passe en mode stale.
      setStale(true);
      setErrorMsg((err as Error)?.message || tx.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, tx]);

  // Référence stable vers le dernier fetchDashboard : permet à la fonction
  // debouncée d'avoir des deps vides (référence stable, pas de re-souscription
  // realtime à chaque changement de `tx`) sans stale closure.
  const fetchDashboardRef = useRef(fetchDashboard);
  useEffect(() => {
    fetchDashboardRef.current = fetchDashboard;
  }, [fetchDashboard]);

  // Refetch coalescé : appelé par le realtime. Regroupe les rafales d'UPDATE
  // en un seul fetch après REALTIME_DEBOUNCE_MS d'inactivité.
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchDashboardRef.current();
    }, REALTIME_DEBOUNCE_MS);
  }, []);

  // Nettoyage du timer de debounce au démontage (évite fuite / setState sur
  // composant démonté).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Auto-refresh (pause si onglet caché). Pas de fetch initial : SSR a déjà
  // chargé les données via getServerSideProps. Sert aussi de filet de
  // securite si la souscription realtime tombe (cf. useRealtimeChannel).
  useEffect(() => {
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchDashboard();
    }
    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDashboard]);

  // Realtime : refresh immediat quand un match du tournoi change (score,
  // statut, scheduled_at, dispute…). Bien plus reactif que d'attendre 30s.
  // Le polling reste actif comme filet de securite.
  useRealtimeChannel({
    enabled: !!tournamentId,
    channel: `dashboard-matches-${tournamentId}`,
    table: 'matches',
    filter: tournamentId ? `tournament_id=eq.${tournamentId}` : undefined,
    onChange: debouncedFetch,
  });

  // Tick "now" toutes les 60s pour le compteur roster-lock et la fraîcheur de l'ETA.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* -----------------------------------------------------------
   * Handlers : statut, équipes, phase
   * ---------------------------------------------------------*/

  async function performStatusUpdate(newStatus: string) {
    if (!tournamentId) return;
    setUpdatingStatus(true);
    setActionError(null);
    try {
      await updateTournament.mutateAsync({ status: newStatus });
      addToast(
        format(tov.toastStatusChanged, {
          status: STATUS_LABEL[newStatus] ?? newStatus,
        }),
        'success'
      );
      // Rafraîchit tout le payload (guards, KPIs, alertes) d'un coup.
      fetchDashboard();
    } catch (err: unknown) {
      setActionError((err as Error)?.message ?? tov.errorUnexpected);
    } finally {
      setUpdatingStatus(false);
    }
  }

  function updateStatus(newStatus: string) {
    const currentStatus = data?.guards.current_status ?? 'draft';
    if (newStatus === currentStatus) return;
    const currentOrder = STATUS_ORDER[currentStatus] ?? 0;
    const newOrder = STATUS_ORDER[newStatus] ?? 0;
    // Régression (retour en arrière) → confirmation explicite.
    if (newOrder < currentOrder) {
      setPendingStatusValue(newStatus);
      setShowStatusConfirm(true);
      return;
    }
    performStatusUpdate(newStatus);
  }

  const handleAddTeamSubmit = useCallback(
    async (teamId: string, seed: number | null): Promise<boolean> => {
      if (!tournamentId) return false;
      setActionError(null);
      try {
        const res = await addTeamMutate(tournamentUrls.teams(tournamentId), {
          method: 'POST',
          body: JSON.stringify({ team_id: teamId, seed }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || tov.errorAddTeam);
        }
        addToast(tov.toastTeamAdded, 'success');
        fetchTournamentTeams();
        return true;
      } catch (err: unknown) {
        setActionError((err as Error)?.message ?? tov.errorUnexpected);
        return false;
      }
    },
    [tournamentId, addTeamMutate, tov, addToast, fetchTournamentTeams]
  );

  const handleBulkAddSubmit = useCallback(
    async (
      teamIds: string[],
      onProgress: (done: number, total: number) => void
    ): Promise<void> => {
      if (teamIds.length === 0 || !tournamentId) return;
      setActionError(null);
      let failCount = 0;
      for (let i = 0; i < teamIds.length; i++) {
        try {
          const res = await addTeamMutate(tournamentUrls.teams(tournamentId), {
            method: 'POST',
            body: JSON.stringify({ team_id: teamIds[i] }),
          });
          if (!res.ok) failCount++;
        } catch {
          failCount++;
        }
        onProgress(i + 1, teamIds.length);
      }
      if (failCount === 0) {
        addToast(
          format(tov.toastBulkTeamsAdded, { count: teamIds.length }),
          'success'
        );
      } else {
        addToast(
          format(tov.toastBulkTeamsPartial, {
            added: teamIds.length - failCount,
            total: teamIds.length,
            errors: failCount,
          }),
          'success'
        );
      }
      fetchTournamentTeams();
    },
    [tournamentId, addTeamMutate, tov, addToast, fetchTournamentTeams]
  );

  const handleRemoveTeam = useCallback((tournamentTeamId: string) => {
    setPendingRemoveTeamId(tournamentTeamId);
    setShowRemoveConfirm(true);
  }, []);

  async function performRemoveTeam() {
    if (!pendingRemoveTeamId || !tournamentId) return;
    try {
      await adminFetchJson(
        tournamentUrls.team(tournamentId, pendingRemoveTeamId),
        { method: 'DELETE' }
      );
      addToast(tov.toastTeamRemoved, 'success');
      fetchTournamentTeams();
    } catch (err: unknown) {
      setActionError((err as Error)?.message ?? tov.errorUnexpected);
    } finally {
      setShowRemoveConfirm(false);
      setPendingRemoveTeamId(null);
    }
  }

  const handleCreateStageSubmit = useCallback(
    async (name: string, stageType: string): Promise<boolean> => {
      if (!tournamentId) return false;
      setActionError(null);
      try {
        const res = await createStageMutate(
          tournamentUrls.stages(tournamentId),
          {
            method: 'POST',
            body: JSON.stringify({
              name,
              stage_type: stageType,
              order_index: data?.stages.length ?? 0,
            }),
          }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || tov.errorCreateStage);
        }
        addToast(tov.toastStageCreated, 'success');
        // Refetch global : les phases vivent dans le payload dashboard.
        fetchDashboard();
        return true;
      } catch (err: unknown) {
        setActionError((err as Error)?.message ?? tov.errorUnexpected);
        return false;
      }
    },
    [
      tournamentId,
      createStageMutate,
      data?.stages.length,
      tov,
      addToast,
      fetchDashboard,
    ]
  );

  // Équipes non encore inscrites (pour les modales add/bulk).
  const availableTeamsToAdd = useMemo(
    () =>
      allTeams.filter(
        (tt) => !tournamentTeams.some((x) => x.team_id === tt.id)
      ),
    [allTeams, tournamentTeams]
  );

  // Référence stable pour les colonnes de TeamRow (évite d'invalider les rows).
  const registrationFields = useMemo(
    () => registrationFieldsMeta ?? [],
    [registrationFieldsMeta]
  );

  const t = data?.tournament;
  const s = data?.summary;
  const sig = data?.signals;
  const now = new Date(nowMs);

  // ETA fin du tournoi, recalculée depuis maintenant (libellé qui se
  // rafraîchit sans nouveau fetch).
  const liveEta = computeLiveEta(sig?.velocity.etaIso, nowMs, tx);

  // Prochain match à venir (pour J-X header)
  const nextScheduled = data?.upcomingMatches.find(
    (m) => m.scheduled_at
  )?.scheduled_at;
  const jDayHeader =
    jDayLabel(nextScheduled ?? null, now) ??
    jDayLabel(t?.start_date ?? null, now) ??
    null;

  // Quels stages sont prêts à advance ?
  const readyStageIds = new Set(
    sig?.stagesReadyToAdvance.map((s) => s.stageId) ?? []
  );

  return (
    <>
      <Head>
        <title>
          {format(tx.pageTitle, { name: t?.name ?? tx.defaultTournamentName })}
        </title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-14 sm:px-6 lg:px-[30px]">
        <div className="mx-auto max-w-[1500px]">
          {/* ─── Header ────────────────────────────────────────────── */}
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="dashboard"
          />
          <TournamentDashboardHeader
            tx={tx}
            tournamentId={tournamentId}
            name={t?.name}
            status={t?.status}
            statusLabels={STATUS_LABEL}
            liveCount={sig?.liveMatches.length ?? 0}
            jDayHeader={jDayHeader}
            lastFetchedAt={lastFetchedAt}
            stale={stale}
            onRefresh={fetchDashboard}
          />

          {/* ─── Loading / error initial ────────────────────────────── */}
          {loading && !data && (
            <TournamentDashboardLoading label={tx.loadingDashboard} />
          )}
          {errorMsg && !data && (
            <TournamentDashboardLoadError message={errorMsg} />
          )}

          {data && t && s && sig && (
            <>
              {/* Bannière d'erreur des actions à effet (statut/équipes/outils) */}
              {actionError && (
                <TournamentDashboardActionError
                  message={actionError}
                  onDismiss={() => setActionError(null)}
                />
              )}

              {/* ─── KPIs ───────────────────────────────────────────── */}
              <TournamentDashboardKpis
                tx={tx}
                tournament={t}
                summary={s}
                stages={data.stages}
                velocity={sig.velocity}
                liveEta={liveEta}
              />

              {/* Alertes du centre de contrôle — extraites en panneau (lot A7).
                  Le dashboard garde ce qui APPELLE (fetch authentifié,
                  rafraîchissement) ; le panneau ne fait que le déclencher. */}
              <TournamentAlerts
                sig={sig}
                alerts={data.alerts}
                tournamentId={String(tournamentId ?? '')}
                rosterLockedAt={t.roster_locked_at ?? null}
                rosterUnlockedUntil={t.roster_unlocked_until ?? null}
                nowMs={nowMs}
                onNudgeAllCheckins={async () => {
                  const json = await adminFetchJson<{ nudged: number }>(
                    tournamentUrls.checkinNudgeAll(String(tournamentId)),
                    { method: 'POST' }
                  );
                  return json?.nudged ?? 0;
                }}
                onRunCheckinProcessor={async () => {
                  await adminFetchJson(
                    tournamentUrls.checkin(String(tournamentId)),
                    { method: 'POST' }
                  );
                }}
                onRefresh={async () => {
                  await fetchDashboard();
                }}
              />

              {/* ─── Status workflow (stepper interactif) ───────────── */}
              <TournamentDashboardWorkflow
                tx={tx}
                tov={tov}
                guards={data.guards}
                updatingStatus={updatingStatus}
                onSelect={updateStatus}
              />

              {/* ─── Main grid (2 colonnes desktop) ──────────────────── */}
              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* COLONNE GAUCHE */}
                <div className="min-w-0 space-y-6">
                  <TournamentDashboardStages
                    tx={tx}
                    tov={tov}
                    tournamentId={tournamentId!}
                    stages={data.stages}
                    readyStageIds={readyStageIds}
                    onNewStage={() => setShowNewStageModal(true)}
                    onAdvance={setAdvanceTarget}
                  />

                  <TournamentDashboardTeams
                    tx={tx}
                    tov={tov}
                    summary={s}
                    pendingTeamsCount={sig.pendingTeamsCount}
                    loadingTeams={loadingTeams}
                    tournamentTeams={tournamentTeams}
                    registrationFields={registrationFields}
                    onAdd={() => setShowAddTeamModal(true)}
                    onBulkAdd={() => setShowBulkAddModal(true)}
                    onRemove={handleRemoveTeam}
                  />

                  <TournamentDashboardCheckin
                    tx={tx}
                    sig={sig}
                    tournamentId={tournamentId}
                  />

                  <TournamentDashboardActivity
                    tx={tx}
                    sig={sig}
                    tournamentId={tournamentId}
                    nowMs={nowMs}
                  />

                  <TournamentDashboardHealth
                    tx={tx}
                    sig={sig}
                    tournamentId={tournamentId}
                    nowMs={nowMs}
                  />
                </div>

                {/* COLONNE DROITE */}
                <div className="min-w-0 space-y-6">
                  <TournamentDashboardMatches
                    tx={tx}
                    sig={sig}
                    upcomingMatches={data.upcomingMatches}
                    tournamentId={tournamentId}
                    onScore={setScoreTarget}
                    onResolve={setDisputeTarget}
                  />
                </div>
              </div>

              {/* ─── Quick access grid ──────────────────────────────── */}
              <TournamentDashboardQuickLinks
                tx={tx}
                tournamentId={tournamentId!}
                links={QUICK_LINKS.filter((link) =>
                  hasAtLeastRole(staff.role as StaffRole, link.role ?? 'admin')
                )}
              />
            </>
          )}
        </div>
      </div>

      {/* ─── Modales d'actions inline ───────────────────────────────── */}
      <TournamentDashboardMatchModals
        scoreTarget={scoreTarget}
        disputeTarget={disputeTarget}
        advanceTarget={advanceTarget}
        onCloseScore={() => setScoreTarget(null)}
        onCloseDispute={() => setDisputeTarget(null)}
        onCloseAdvance={() => setAdvanceTarget(null)}
        onSuccess={fetchDashboard}
      />

      {/* ─── Modales migrées depuis l'overview ───────────────────────── */}
      <AddTeamModal
        open={showAddTeamModal}
        availableTeams={availableTeamsToAdd}
        onClose={() => setShowAddTeamModal(false)}
        onSubmit={handleAddTeamSubmit}
        tx={tov}
      />

      <BulkAddTeamsModal
        open={showBulkAddModal}
        availableTeams={availableTeamsToAdd}
        onClose={() => setShowBulkAddModal(false)}
        onSubmit={handleBulkAddSubmit}
        tx={tov}
      />

      <NewStageModal
        open={showNewStageModal}
        stageTypeOptions={STAGE_TYPE_OPTIONS}
        onClose={() => setShowNewStageModal(false)}
        onSubmit={handleCreateStageSubmit}
        tx={tov}
      />

      {/* Confirmation de régression de statut */}
      {showStatusConfirm && pendingStatusValue && (
        <ConfirmDialog
          title={tov.demoteTitle}
          subtitle={format(tov.demoteSubtitle, {
            from:
              STATUS_LABEL[data?.guards.current_status ?? 'draft'] ??
              data?.guards.current_status ??
              '',
            to: STATUS_LABEL[pendingStatusValue] ?? pendingStatusValue,
          })}
          variant="warning"
          loading={updatingStatus}
          confirmLabel={tov.demote}
          confirmingLabel={tov.updatingShort}
          onCancel={() => {
            setShowStatusConfirm(false);
            setPendingStatusValue(null);
          }}
          onConfirm={() => {
            setShowStatusConfirm(false);
            performStatusUpdate(pendingStatusValue);
            setPendingStatusValue(null);
          }}
        />
      )}

      {/* Confirmation de retrait d'équipe */}
      {showRemoveConfirm && pendingRemoveTeamId && (
        <ConfirmDialog
          title={tov.removeTeamTitle}
          subtitle={tov.removeTeamSubtitle}
          variant="danger"
          loading={false}
          confirmLabel={tov.remove}
          onCancel={() => {
            setShowRemoveConfirm(false);
            setPendingRemoveTeamId(null);
          }}
          onConfirm={performRemoveTeam}
        />
      )}
    </>
  );
}

export default withAdminQuery(MegaDashboardPage);
