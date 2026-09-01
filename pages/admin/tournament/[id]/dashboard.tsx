// pages/admin/tournament/[id]/dashboard.tsx
// Mega-dashboard "Centre de contrôle" du tournoi.
// Remplace l'ancienne vue lecture-seule par un hub actionnable :
// KPIs, alertes priorisées, status workflow, phases, équipes,
// matchs en cours / à venir / disputes, check-in du jour, accès rapide aux 15 sous-pages.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffProps, StaffRole } from '@/types/admin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { formatDateTimeTz, formatDateTz } from '@/utils/timezone';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import StatCard from '@/components/admin/dashboard/StatCard';
import TournamentAlerts from '@/components/admin/dashboard/TournamentAlerts';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import StageProgressBar from '@/components/admin/dashboard/StageProgressBar';
import UpcomingMatchRow from '@/components/admin/dashboard/UpcomingMatchRow';
import ScoreEntryModal from '@/components/admin/dashboard/ScoreEntryModal';
import DisputeResolveModal from '@/components/admin/dashboard/DisputeResolveModal';
import ConfirmAdvanceModal from '@/components/admin/dashboard/ConfirmAdvanceModal';
import SupportTicketsDonut from '@/components/admin/dashboard/SupportTicketsDonut';
import DiscordHealthGrid from '@/components/admin/dashboard/DiscordHealthGrid';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import AddTeamModal from '@/components/admin/tournament/overview/AddTeamModal';
import BulkAddTeamsModal from '@/components/admin/tournament/overview/BulkAddTeamsModal';
import NewStageModal from '@/components/admin/tournament/overview/NewStageModal';
import TeamRow from '@/components/admin/tournament/overview/TeamRow';
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

const STATUS_PILL_STYLE: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  published: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  running: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  completed: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  archived: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
};

type Dict = typeof nsAdminTournamentDashboard.fr;

function getStatusLabel(tx: Dict): Record<string, string> {
  return {
    draft: tx.statusDraft,
    published: tx.statusPublished,
    running: tx.statusRunning,
    completed: tx.statusCompleted,
    archived: tx.statusArchived,
  };
}

// Dictionnaire du namespace overview (statut cliquable + gestion d'équipes +
// création de phase). Les composants TeamRow/AddTeamModal/BulkAddTeamsModal/
// NewStageModal attendent CE dict, pas celui du dashboard.
type OverviewDict = typeof nsAdminTournamentOverview.fr;

// Ordre de progression du workflow — sert à détecter une régression de statut
// (retour en arrière) qui déclenche la confirmation.
const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  published: 1,
  running: 2,
  completed: 3,
  archived: 4,
};

function getStageTypeOptions(tov: OverviewDict) {
  return [
    { value: 'bracket', label: tov.stageTypeBracket },
    { value: 'swiss', label: tov.stageTypeSwiss },
    { value: 'group', label: tov.stageTypeGroupOption },
    { value: 'round_robin', label: tov.stageTypeRoundRobin },
    { value: 'showmatch', label: tov.stageTypeShowmatch },
    { value: 'other', label: tov.stageTypeOther },
  ];
}

/* -----------------------------------------------------------
 * Quick access grid — uniquement les destinations SANS onglet
 * dédié dans TournamentTabsNav (sinon on doublerait la nav).
 * ---------------------------------------------------------*/

type QuickLink = {
  label: string;
  href: (id: string) => string;
  icon: string;
  description: string;
  /** Rôle minimum requis par la page cible (défaut : admin, comme le dashboard). */
  role?: 'admin';
};

function getQuickLinks(tx: Dict): QuickLink[] {
  return [
    {
      label: tx.quickBracketBuilderLabel,
      icon: '🛠️',
      href: (id) => `/admin/tournament/${id}/bracket?tab=builder`,
      description: tx.quickBracketBuilderDesc,
    },
    {
      label: tx.quickMapDrawLabel,
      icon: '🎲',
      href: (id) => `/admin/tournament/${id}/bracket?tab=map-draw`,
      description: tx.quickMapDrawDesc,
    },
    {
      label: tx.quickVetoLabel,
      icon: '🚫',
      href: (id) => `/admin/tournament/${id}/bracket?tab=veto`,
      description: tx.quickVetoDesc,
    },
    {
      label: tx.quickBulkOpsLabel,
      icon: '⚡',
      href: (id) => `/admin/tournament/${id}/bulk-ops`,
      description: tx.quickBulkOpsDesc,
    },
    {
      label: tx.quickAnalyticsLabel,
      icon: '📈',
      href: (id) => `/admin/tournament/${id}/stats?tab=analytics`,
      description: tx.quickAnalyticsDesc,
    },
    {
      label: tx.quickSupportLabel,
      icon: '🛂',
      href: () => `/admin/moderation?tab=support`,
      description: tx.quickSupportDesc,
    },
    {
      label: tx.quickTemplatesLabel,
      icon: '🧬',
      href: () => `/admin/tournament-templates`,
      description: tx.quickTemplatesDesc,
      role: 'admin',
    },
    {
      label: tx.quickSimulatorLabel,
      icon: '🧪',
      href: () => `/admin/tournament-simulator`,
      description: tx.quickSimulatorDesc,
      role: 'admin',
    },
  ];
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function jDayLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  try {
    const target = new Date(iso);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return null;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days >= 1) return `J-${days}`;
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    return `${hours}h`;
  } catch {
    return null;
  }
}

/* -----------------------------------------------------------
 * Page
 * ---------------------------------------------------------*/

type SsrProps = {
  initialData: DashboardData | null;
  initialError: string | null;
};

export const getServerSideProps = withStaffPage<SsrProps>(
  'admin',
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
  const STATUS_LABEL = getStatusLabel(tx);
  const QUICK_LINKS = getQuickLinks(tx);
  const STAGE_TYPE_OPTIONS = getStageTypeOptions(tov);

  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch();
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
  type MatchTarget = {
    id: string;
    team1Name: string | null;
    team2Name: string | null;
    team1Score?: number | null;
    team2Score?: number | null;
    matchFormat?: string | null;
  };
  const [scoreTarget, setScoreTarget] = useState<MatchTarget | null>(null);
  const [disputeTarget, setDisputeTarget] = useState<
    (MatchTarget & { reason: string | null }) | null
  >(null);
  const [advanceTarget, setAdvanceTarget] = useState<{
    stageId: string;
    stageName: string;
  } | null>(null);

  /* -----------------------------------------------------------
   * State des sections gérées dans le dashboard (statut + équipes)
   * ---------------------------------------------------------*/

  // registration_fields absent du payload dashboard : nécessaire pour les
  // colonnes des cartes équipe (TeamRow). Chargé via une meta séparée.
  const [registrationFieldsMeta, setRegistrationFieldsMeta] = useState<
    RegistrationField[] | null
  >(null);

  // Erreur inline pour les actions statut/équipes (bannière rouge locale).
  const [actionError, setActionError] = useState<string | null>(null);

  // Gestion d'équipes
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
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
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/dashboard`
      );
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
   * Fetchers des sections gérées ici (registration_fields + équipes)
   * ---------------------------------------------------------*/

  // registration_fields absent du payload dashboard : requis pour les colonnes
  // des cartes équipe (TeamRow).
  const fetchRegistrationFields = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const json = await adminFetchJson<{
        tournament: { registration_fields: RegistrationField[] | null };
      }>(`/api/admin/tournament/${tournamentId}`);
      setRegistrationFieldsMeta(json.tournament.registration_fields ?? null);
    } catch {
      // Silencieux : complément non bloquant pour le dashboard.
    }
  }, [tournamentId, adminFetchJson]);

  const fetchTournamentTeams = useCallback(async () => {
    if (!tournamentId) return;
    setLoadingTeams(true);
    try {
      const res = await adminFetch(
        `/api/admin/tournament/${tournamentId}/teams`
      );
      if (res.ok) {
        const json = await res.json();
        setTournamentTeams(json.teams || []);
      }
    } catch {
      // Silencieux.
    } finally {
      setLoadingTeams(false);
    }
  }, [tournamentId, adminFetch]);

  const fetchAllTeams = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/teams?limit=200');
      if (res.ok) {
        const json = await res.json();
        setAllTeams(json.teams || []);
      }
    } catch {
      // Silencieux.
    }
  }, [adminFetch]);

  // Chargement mono-shot des colonnes d'inscription + des équipes (le payload
  // dashboard ne les porte pas). Borné à [tournamentId] : les fetchers sont
  // stables (adminFetch* à identité figée), aucun state mutable listé.
  useEffect(() => {
    if (!tournamentId) return;
    fetchRegistrationFields();
    fetchTournamentTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial mono-shot borné à [tournamentId]
  }, [tournamentId]);

  /* -----------------------------------------------------------
   * Handlers : statut, équipes, phase
   * ---------------------------------------------------------*/

  async function performStatusUpdate(newStatus: string) {
    if (!tournamentId) return;
    setUpdatingStatus(true);
    setActionError(null);
    try {
      await adminFetchJson(`/api/admin/tournament/${tournamentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
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
        const res = await addTeamMutate(
          `/api/admin/tournament/${tournamentId}/teams`,
          {
            method: 'POST',
            body: JSON.stringify({ team_id: teamId, seed }),
          }
        );
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
          const res = await addTeamMutate(
            `/api/admin/tournament/${tournamentId}/teams`,
            {
              method: 'POST',
              body: JSON.stringify({ team_id: teamIds[i] }),
            }
          );
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
        `/api/admin/tournament/${tournamentId}/teams/${pendingRemoveTeamId}`,
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
          `/api/admin/tournament/${tournamentId}/stages`,
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

  // Live roster lock countdown : recalculé à chaque tick de `nowMs` (60s).
  // Permet d'afficher minutes restantes quand on passe sous l'heure.
  const liveRosterLock = (() => {
    const lockedAt = t?.roster_locked_at;
    if (!lockedAt) return null;
    const diffMs = new Date(lockedAt).getTime() - nowMs;
    if (diffMs <= 0) return { passed: true, label: tx.rosterLocked };
    const minutes = Math.ceil(diffMs / 60_000);
    if (minutes < 60) return { passed: false, label: `${minutes} min` };
    const hours = Math.ceil(diffMs / 3_600_000);
    if (hours < 48) return { passed: false, label: `${hours}h` };
    const days = Math.floor(diffMs / (24 * 3_600_000));
    return { passed: false, label: `${days}j` };
  })();

  // ETA fin du tournoi : on recalcule l'écart depuis maintenant pour avoir
  // un libellé qui se rafraîchit (ex : "dans 2h" → "dans 1h" sans nouveau fetch).
  const liveEta = (() => {
    const etaIso = sig?.velocity.etaIso;
    if (!etaIso) return null;
    const diffMs = new Date(etaIso).getTime() - nowMs;
    if (diffMs <= 0) return { label: tx.etaImminent, iso: etaIso };
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 1) {
      const minutes = Math.round(diffMs / 60_000);
      return { label: format(tx.etaInMinutes, { n: minutes }), iso: etaIso };
    }
    if (hours < 36)
      return { label: format(tx.etaInHours, { n: hours }), iso: etaIso };
    const days = Math.round(hours / 24);
    return { label: format(tx.etaInDays, { n: days }), iso: etaIso };
  })();

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto max-w-[1500px] px-4 pb-14 pt-20 sm:px-6 lg:px-8">
          {/* ─── Header ────────────────────────────────────────────── */}
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="dashboard"
          />
          <div className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {t?.name ?? tx.loadingName}
                  </h1>
                  {t?.status && (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        STATUS_PILL_STYLE[t.status] ?? STATUS_PILL_STYLE.draft
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  )}
                  {sig && sig.liveMatches.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                      {format(tx.liveCount, { count: sig.liveMatches.length })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  {tx.controlCenter}
                  {jDayHeader && (
                    <>
                      {tx.nextKickoffBefore}
                      <span className="text-purple-300">{jDayHeader}</span>
                    </>
                  )}
                  {lastFetchedAt && (
                    <>
                      {' · '}
                      <span
                        className={
                          stale ? 'text-amber-300' : 'text-neutral-500'
                        }
                      >
                        {stale ? tx.stale : tx.upToDate} ·{' '}
                        {lastFetchedAt.toLocaleTimeString('fr-FR')}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-700"
                  >
                    <svg
                      className="h-4 w-4"
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
                    {tx.export}
                  </button>
                  <div className="invisible absolute right-0 z-10 mt-1 w-48 rounded-xl border border-neutral-700 bg-neutral-800 py-1 shadow-lg group-hover:visible">
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=csv`}
                      className="block px-4 py-2 text-sm transition-colors hover:bg-neutral-700"
                    >
                      {tx.resultsCsv}
                    </a>
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=json`}
                      className="block px-4 py-2 text-sm transition-colors hover:bg-neutral-700"
                    >
                      {tx.resultsJson}
                    </a>
                  </div>
                </div>
                <button
                  onClick={fetchDashboard}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-700"
                >
                  {tx.refresh}
                </button>
              </div>
            </div>
          </div>

          {/* ─── Loading / error initial ────────────────────────────── */}
          {loading && !data && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400">
              {tx.loadingDashboard}
            </div>
          )}
          {errorMsg && !data && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          {data && t && s && sig && (
            <>
              {/* Bannière d'erreur des actions à effet (statut/équipes/outils) */}
              {actionError && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-900/40 px-4 py-3 text-sm text-red-100">
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="flex-1">{actionError}</span>
                  <button
                    type="button"
                    onClick={() => setActionError(null)}
                    className="text-red-300 transition-colors hover:text-white"
                    aria-label="×"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* ─── KPIs ───────────────────────────────────────────── */}
              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
                <StatCard
                  label={tx.kpiTeams}
                  value={`${s.totalTeams}/${t.max_teams ?? '∞'}`}
                  hint={format(tx.kpiTeamsEliminated, {
                    count: s.eliminatedTeams,
                  })}
                  accent="pink"
                />
                <StatCard
                  label={tx.kpiMatches}
                  value={`${s.finishedMatches}/${s.totalMatches}`}
                  hint={format(tx.kpiMatchesDone, {
                    percent: s.completionPercent,
                  })}
                  accent="emerald"
                />
                <StatCard
                  label={tx.kpiOngoing}
                  value={s.ongoingMatches}
                  hint={s.ongoingMatches > 0 ? tx.kpiLive : '—'}
                  accent={s.ongoingMatches > 0 ? 'red' : 'gray'}
                />
                <StatCard
                  label={tx.kpiStages}
                  value={data.stages.length}
                  hint={
                    data.stages.find((st) => st.is_active)?.name ??
                    tx.kpiNoActiveStage
                  }
                  accent="blue"
                />
                <StatCard
                  label={tx.kpiCadence}
                  value={
                    sig.velocity.matchesPerHour > 0
                      ? `${sig.velocity.matchesPerHour}/h`
                      : '—'
                  }
                  hint={
                    sig.velocity.finishedInWindow > 0
                      ? format(tx.kpiCadenceHint, {
                          count: sig.velocity.finishedInWindow,
                          hours: sig.velocity.windowHours,
                        })
                      : tx.kpiNoRecentActivity
                  }
                  accent={sig.velocity.matchesPerHour > 0 ? 'emerald' : 'gray'}
                />
                <StatCard
                  label={tx.kpiEta}
                  value={
                    liveEta?.label ??
                    (sig.velocity.remainingMatches === 0
                      ? tx.kpiCompleted
                      : '—')
                  }
                  hint={
                    liveEta?.iso
                      ? formatDateTimeTz(liveEta.iso, t.timezone, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : sig.velocity.remainingMatches === 0
                        ? tx.kpiAllPlayed
                        : tx.kpiCadenceTooLow
                  }
                  accent={liveEta ? 'purple' : 'gray'}
                />
                <StatCard
                  label={tx.kpiStart}
                  value={
                    t.start_date ? formatDateTz(t.start_date, t.timezone) : '—'
                  }
                  accent="amber"
                />
                <StatCard
                  label={tx.kpiEnd}
                  value={
                    t.end_date ? formatDateTz(t.end_date, t.timezone) : '—'
                  }
                  accent="amber"
                />
              </div>

              {/* Alertes du centre de contrôle — extraites en panneau (lot A7).
                  Le dashboard garde ce qui APPELLE (fetch authentifié,
                  rafraîchissement) ; le panneau ne fait que le déclencher. */}
              <TournamentAlerts
                sig={sig}
                alerts={data.alerts}
                tournamentId={String(tournamentId ?? '')}
                liveRosterLock={liveRosterLock}
                onNudgeAllCheckins={async () => {
                  const json = await adminFetchJson<{ nudged: number }>(
                    `/api/admin/tournament/${tournamentId}/checkin-nudge-all`,
                    { method: 'POST' }
                  );
                  return json?.nudged ?? 0;
                }}
                onRunCheckinProcessor={async () => {
                  await adminFetchJson(
                    `/api/admin/tournament/${tournamentId}/checkin`,
                    { method: 'POST' }
                  );
                }}
                onRefresh={async () => {
                  await fetchDashboard();
                }}
              />

              {/* ─── Status workflow (stepper interactif) ───────────── */}
              <WidgetCard
                title={tx.workflowTitle}
                badge={
                  updatingStatus ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
                      {tov.updatingShort}
                    </span>
                  ) : undefined
                }
                className="mb-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {data.guards.guards.map((g, i) => {
                    const isCurrent = g.status === data.guards.current_status;
                    const clickable =
                      !isCurrent && g.allowed && !updatingStatus;
                    return (
                      <div key={g.status} className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => clickable && updateStatus(g.status)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                            isCurrent
                              ? (STATUS_PILL_STYLE[g.status] ??
                                STATUS_PILL_STYLE.draft)
                              : g.allowed
                                ? 'border-white/10 text-gray-300 hover:border-purple-500/40 hover:text-white cursor-pointer'
                                : 'border-red-500/20 text-red-400/70 cursor-not-allowed'
                          } ${updatingStatus && !isCurrent ? 'opacity-60' : ''}`}
                          title={
                            isCurrent
                              ? tov.currentStatus
                              : g.allowed
                                ? format(tov.switchTo, { label: g.label })
                                : (g.reason ?? undefined)
                          }
                        >
                          {isCurrent && '● '}
                          {g.label}
                          {!g.allowed && !isCurrent && (
                            <span className="text-red-400">🔒</span>
                          )}
                        </button>
                        {i < data.guards.guards.length - 1 && (
                          <span className="text-gray-600">→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {data.guards.guards
                  .filter((g) => !g.allowed && g.reason)
                  .map((g) => (
                    <p
                      key={g.status}
                      className="mt-2 text-[11px] text-red-300/80"
                    >
                      {format(tx.workflowBlocked, {
                        label: g.label,
                        reason: g.reason ?? '',
                      })}
                    </p>
                  ))}
              </WidgetCard>

              {/* ─── Main grid (2 colonnes desktop) ──────────────────── */}
              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* COLONNE GAUCHE */}
                <div className="space-y-6">
                  <WidgetCard
                    title={tx.phasesTitle}
                    badge={`${data.stages.length}`}
                    ctaHref={`/admin/tournament/${tournamentId}/stages`}
                    ctaLabel={tx.manage}
                  >
                    <div className="mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowNewStageModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500"
                      >
                        <svg
                          className="h-3.5 w-3.5"
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
                        {tov.newStage}
                      </button>
                    </div>
                    {data.stages.length === 0 ? (
                      <p className="text-sm text-gray-500">{tx.noStages}</p>
                    ) : (
                      <div className="space-y-2.5">
                        {data.stages.map((st) => (
                          <StageProgressBar
                            key={st.id}
                            stageId={st.id}
                            tournamentId={tournamentId!}
                            name={st.name}
                            stageType={st.stage_type}
                            totalMatches={st.totalMatches}
                            finishedMatches={st.finishedMatches}
                            pendingMatches={st.pendingMatches}
                            ongoingMatches={st.ongoingMatches}
                            isActive={st.is_active}
                            teamsCount={st.teamsCount}
                            hourlyBuckets={st.hourlyBuckets}
                            isReadyToAdvance={readyStageIds.has(st.id)}
                            onAdvance={
                              readyStageIds.has(st.id)
                                ? () =>
                                    setAdvanceTarget({
                                      stageId: st.id,
                                      stageName: st.name,
                                    })
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    )}
                  </WidgetCard>

                  <WidgetCard title={tx.teamsTitle} badge={`${s.totalTeams}`}>
                    <div className="mb-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddTeamModal(true);
                          fetchAllTeams();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                      >
                        <svg
                          className="h-3.5 w-3.5"
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
                        {tov.add}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowBulkAddModal(true);
                          fetchAllTeams();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {tov.bulkAdd}
                      </button>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-300">
                          {s.activeTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsActive}
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-gray-300">
                          {s.eliminatedTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsEliminated}
                        </div>
                      </div>
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-amber-300">
                          {sig.pendingTeamsCount}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsPending}
                        </div>
                      </div>
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-blue-300">
                          {s.totalTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsTotal}
                        </div>
                      </div>
                    </div>

                    {loadingTeams ? (
                      <p className="py-4 text-sm text-gray-500">
                        {tov.loading}
                      </p>
                    ) : tournamentTeams.length === 0 ? (
                      <p className="rounded-xl bg-white/[0.02] py-6 text-center text-sm text-gray-500">
                        {tov.noTeams}
                      </p>
                    ) : (
                      <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                        {[...tournamentTeams]
                          .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
                          .map((tt) => (
                            <TeamRow
                              key={tt.id}
                              tt={tt}
                              registrationFields={registrationFields}
                              onRemove={handleRemoveTeam}
                              tx={tov}
                            />
                          ))}
                      </div>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title={tx.checkinTitle}
                    ctaHref={`/admin/tournament/${tournamentId}/checkin`}
                    ctaLabel={tx.detail}
                  >
                    {sig.checkinNext24h.upcoming === 0 ? (
                      <p className="text-sm text-gray-500">{tx.noMatchIn24h}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-emerald-300">
                            ✅ {sig.checkinNext24h.bothCheckedIn}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinOk}
                          </div>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-amber-300">
                            ⏳ {sig.checkinNext24h.oneSide}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinPartial}
                          </div>
                        </div>
                        <div className="rounded-lg bg-red-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-red-300">
                            ❌ {sig.checkinNext24h.missing}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinNone}
                          </div>
                        </div>
                        <div className="rounded-lg bg-neutral-700/30 p-3 text-center">
                          <div className="text-xl font-bold text-neutral-300">
                            🚷 {sig.checkinNext24h.forfeited}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinForfeit}
                          </div>
                        </div>
                      </div>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title={tx.recentActivityTitle}
                    badge={sig.recentActivity.length}
                    ctaHref={`/admin/tournament/${tournamentId}/history`}
                    ctaLabel={tx.allHistory}
                  >
                    {sig.recentActivity.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {tx.noStaffAction}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sig.recentActivity.map((row) => {
                          const ageMs =
                            nowMs - new Date(row.createdAt).getTime();
                          const ageLabel =
                            ageMs < 60_000
                              ? tx.ageNow
                              : ageMs < 3_600_000
                                ? format(tx.ageMinutes, {
                                    n: Math.floor(ageMs / 60_000),
                                  })
                                : ageMs < 86_400_000
                                  ? format(tx.ageHours, {
                                      n: Math.floor(ageMs / 3_600_000),
                                    })
                                  : format(tx.ageDays, {
                                      n: Math.floor(ageMs / 86_400_000),
                                    });
                          return (
                            <li
                              key={row.id}
                              className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-white">
                                  <span className="font-medium text-purple-300">
                                    {row.staffName ?? tx.defaultStaffName}
                                  </span>
                                  <span className="mx-1.5 text-gray-500">
                                    ·
                                  </span>
                                  <span>{row.readableAction}</span>
                                  {row.entityType && (
                                    <span className="ml-1.5 text-gray-500">
                                      ({row.entityType}
                                      {row.entityId
                                        ? ` ${row.entityId.slice(0, 8)}`
                                        : ''}
                                      )
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-500">
                                {ageLabel}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title={tx.supportTicketsTitle}
                    badge={
                      sig.tickets.totalOpen > 0
                        ? sig.tickets.totalOpen
                        : undefined
                    }
                    ctaHref={`/admin/moderation?tab=support&tournament_id=${tournamentId}&status=open`}
                    ctaLabel={tx.open}
                  >
                    <SupportTicketsDonut tickets={sig.tickets} />
                  </WidgetCard>

                  <WidgetCard
                    title={tx.webhooksTitle}
                    badge={
                      sig.discordHealth.configuredCount > 0
                        ? `${sig.discordHealth.configuredCount}/${sig.discordHealth.channels.length}`
                        : undefined
                    }
                    ctaHref={`/admin/tournament/${tournamentId}/discord`}
                    ctaLabel={tx.configure}
                  >
                    <DiscordHealthGrid
                      health={sig.discordHealth}
                      nowMs={nowMs}
                    />
                  </WidgetCard>

                  <WidgetCard
                    title={tx.cronTitle}
                    badge={
                      sig.cronCheckin.isStale
                        ? '⚠'
                        : sig.cronCheckin.lastRunAt
                          ? 'OK'
                          : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p
                          className={`text-sm font-semibold ${
                            sig.cronCheckin.isStale
                              ? 'text-red-300'
                              : sig.cronCheckin.lastRunAt
                                ? 'text-emerald-300'
                                : 'text-gray-400'
                          }`}
                        >
                          {sig.cronCheckin.lastRunAt
                            ? sig.cronCheckin.minutesSince === 0
                              ? tx.cronNow
                              : sig.cronCheckin.minutesSince! < 60
                                ? format(tx.ageMinutes, {
                                    n: sig.cronCheckin.minutesSince ?? 0,
                                  })
                                : format(tx.ageHours, {
                                    n: Math.floor(
                                      sig.cronCheckin.minutesSince! / 60
                                    ),
                                  })
                            : tx.cronNever}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-500">
                          {sig.cronCheckin.isStale
                            ? tx.cronStaleHint
                            : tx.cronOkHint}
                        </p>
                      </div>
                      {sig.cronCheckin.lastRunAt && (
                        <span className="text-[10px] text-gray-500 tabular-nums">
                          {new Date(
                            sig.cronCheckin.lastRunAt
                          ).toLocaleTimeString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </WidgetCard>
                </div>

                {/* COLONNE DROITE */}
                <div className="space-y-6">
                  {sig.liveMatches.length > 0 && (
                    <WidgetCard
                      title={tx.liveTitle}
                      badge={
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                          {sig.liveMatches.length}
                        </span>
                      }
                    >
                      <div className="space-y-2">
                        {sig.liveMatches.slice(0, 5).map((m) => (
                          <UpcomingMatchRow
                            key={m.id}
                            matchId={m.id}
                            team1Name={m.team1Name}
                            team2Name={m.team2Name}
                            scheduledAt={m.scheduledAt}
                            team1Score={m.team1Score}
                            team2Score={m.team2Score}
                            streamUrl={m.streamUrl}
                            roundName={m.roundName}
                            stageName={m.stageName}
                            variant="live"
                            currentMap={m.currentMap}
                            matchFormat={m.matchFormat}
                            onScoreClick={() =>
                              setScoreTarget({
                                id: m.id,
                                team1Name: m.team1Name,
                                team2Name: m.team2Name,
                                team1Score: m.team1Score,
                                team2Score: m.team2Score,
                                matchFormat: m.matchFormat,
                              })
                            }
                          />
                        ))}
                      </div>
                    </WidgetCard>
                  )}

                  <WidgetCard
                    title={tx.upcomingTitle}
                    badge={data.upcomingMatches.length}
                    ctaHref={`/admin/tournament/${tournamentId}/matches?status=pending`}
                    ctaLabel={tx.seeAll}
                  >
                    {data.upcomingMatches.length === 0 ? (
                      <p className="text-sm text-gray-500">{tx.noUpcoming}</p>
                    ) : (
                      <div className="space-y-2">
                        {data.upcomingMatches.slice(0, 8).map((m) => (
                          <UpcomingMatchRow
                            key={m.id}
                            matchId={m.id}
                            team1Name={m.team1_name}
                            team2Name={m.team2_name}
                            scheduledAt={m.scheduled_at}
                            streamUrl={m.stream_url}
                            roundName={m.round_name}
                            stageName={m.stage_name}
                            onScoreClick={() =>
                              setScoreTarget({
                                id: m.id,
                                team1Name: m.team1_name,
                                team2Name: m.team2_name,
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </WidgetCard>

                  {sig.disputesOpen.count > 0 && (
                    <WidgetCard
                      title={tx.disputesTitle}
                      badge={sig.disputesOpen.count}
                      ctaHref={`/admin/tournament/${tournamentId}/matches?status=disputed`}
                      ctaLabel={tx.allFem}
                    >
                      <div className="space-y-2">
                        {sig.disputesOpen.matches.slice(0, 5).map((m) => (
                          <UpcomingMatchRow
                            key={m.id}
                            matchId={m.id}
                            team1Name={m.team1Name}
                            team2Name={m.team2Name}
                            scheduledAt={m.openedAt}
                            roundName={m.reason ? m.reason.slice(0, 60) : null}
                            variant="dispute"
                            onResolveClick={() =>
                              setDisputeTarget({
                                id: m.id,
                                team1Name: m.team1Name,
                                team2Name: m.team2Name,
                                reason: m.reason,
                              })
                            }
                          />
                        ))}
                      </div>
                    </WidgetCard>
                  )}
                </div>
              </div>

              {/* ─── Quick access grid ──────────────────────────────── */}
              <WidgetCard title={tx.quickAccessTitle}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {QUICK_LINKS.filter((link) =>
                    hasAtLeastRole(
                      staff.role as StaffRole,
                      link.role ?? 'admin'
                    )
                  ).map((link) => (
                    <Link
                      key={link.label}
                      href={link.href(tournamentId!)}
                      className="group rounded-xl border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-purple-500/30 hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{link.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white group-hover:text-purple-200">
                            {link.label}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-gray-500">
                            {link.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </WidgetCard>
            </>
          )}
        </div>
      </div>

      {/* ─── Modales d'actions inline ───────────────────────────────── */}
      <ScoreEntryModal
        key={scoreTarget?.id ?? 'score-modal'}
        open={!!scoreTarget}
        matchId={scoreTarget?.id ?? ''}
        team1Name={scoreTarget?.team1Name ?? null}
        team2Name={scoreTarget?.team2Name ?? null}
        initialTeam1Score={scoreTarget?.team1Score ?? null}
        initialTeam2Score={scoreTarget?.team2Score ?? null}
        matchFormat={scoreTarget?.matchFormat ?? null}
        onClose={() => setScoreTarget(null)}
        onSuccess={fetchDashboard}
      />
      <DisputeResolveModal
        key={disputeTarget?.id ?? 'dispute-modal'}
        open={!!disputeTarget}
        matchId={disputeTarget?.id ?? ''}
        team1Name={disputeTarget?.team1Name ?? null}
        team2Name={disputeTarget?.team2Name ?? null}
        reason={disputeTarget?.reason ?? null}
        initialTeam1Score={disputeTarget?.team1Score ?? null}
        initialTeam2Score={disputeTarget?.team2Score ?? null}
        onClose={() => setDisputeTarget(null)}
        onSuccess={fetchDashboard}
      />
      <ConfirmAdvanceModal
        open={!!advanceTarget}
        stageId={advanceTarget?.stageId ?? ''}
        stageName={advanceTarget?.stageName ?? ''}
        onClose={() => setAdvanceTarget(null)}
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

export default MegaDashboardPage;
