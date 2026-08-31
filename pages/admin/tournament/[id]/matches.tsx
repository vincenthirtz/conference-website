// pages/admin/tournament/[id]/matches.ts

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type {
  StaffProps,
  Match,
  MatchStatus,
  StageSummary,
  TeamMini,
  TournamentMini,
} from '@/types/admin';
import PrintExportButton from '@/components/PrintExportButton';
import nsAdminTournamentMatches from '@/lib/i18n/locales/admin-fr/adminTournamentMatches';

type Dict = typeof nsAdminTournamentMatches.fr;

type MatchesApiResponse = {
  tournament: TournamentMini | null;
  stages: StageSummary[];
  matches: Match[];
  total: number | null;
};

export const getServerSideProps = withStaffPage('admin');

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatToInputDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function statusLabel(t: Dict, status: MatchStatus) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-600 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600 text-white';
    case 'finished':
      return 'bg-emerald-600 text-white';
    case 'cancelled':
      return 'bg-red-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}

function stageLabel(t: Dict, stage: StageSummary | null | undefined) {
  if (!stage) return '—';
  const base = stage.name;
  if (stage.stage_type === 'swiss') {
    return format(t.stageSwiss, { name: base });
  }
  if (stage.stage_type === 'bracket') {
    return format(t.stageBracket, { name: base });
  }
  if (stage.stage_type === 'group') {
    return format(t.stageGroup, { name: base });
  }
  return base;
}

function AdminTournamentMatchesPage({ staff }: StaffProps) {
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
  const [autoSchedRunning, setAutoSchedRunning] = useState(false);
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

  // CSV import
  const [csvImportMode, setCsvImportMode] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvPreview, setCsvPreview] = useState<
    Array<{
      team1: string;
      team2: string;
      round?: string;
      scheduled_at?: string;
      best_of?: string;
    }>
  >([]);

  // View mode: list or calendar
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Conflict detection: find teams and resources scheduled at overlapping times
  type Conflict = {
    matchIds: string[];
    label: string;
    type: 'team' | 'resource';
    time: string;
  };

  const conflicts = useMemo(() => {
    const scheduled = matches.filter(
      (m) => m.scheduled_at && m.status !== 'cancelled'
    );
    const found: Map<string, Conflict> = new Map();
    const OVERLAP_WINDOW = 30 * 60 * 1000;

    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i];
        const b = scheduled[j];
        const aStart = new Date(a.scheduled_at!).getTime();
        const bStart = new Date(b.scheduled_at!).getTime();
        if (Math.abs(aStart - bStart) >= OVERLAP_WINDOW) continue;

        // Team conflicts
        const sharedTeams: { id: string; name: string }[] = [];
        if (
          a.team1_id &&
          (a.team1_id === b.team1_id || a.team1_id === b.team2_id)
        ) {
          sharedTeams.push({
            id: a.team1_id,
            name: a.team1?.name || a.team1_id,
          });
        }
        if (
          a.team2_id &&
          (a.team2_id === b.team1_id || a.team2_id === b.team2_id)
        ) {
          sharedTeams.push({
            id: a.team2_id,
            name: a.team2?.name || a.team2_id,
          });
        }

        for (const team of sharedTeams) {
          const key = `team-${team.id}-${Math.min(aStart, bStart)}`;
          const existing = found.get(key);
          if (existing) {
            if (!existing.matchIds.includes(a.id)) existing.matchIds.push(a.id);
            if (!existing.matchIds.includes(b.id)) existing.matchIds.push(b.id);
          } else {
            found.set(key, {
              matchIds: [a.id, b.id],
              label: team.name,
              type: 'team',
              time: formatDateTime(a.scheduled_at),
            });
          }
        }

        // Resource (stream) conflicts — same stream_url at same time
        if (
          a.stream_url &&
          b.stream_url &&
          a.stream_url.trim().toLowerCase() ===
            b.stream_url.trim().toLowerCase()
        ) {
          const key = `stream-${a.stream_url.trim().toLowerCase()}-${Math.min(aStart, bStart)}`;
          const existing = found.get(key);
          if (existing) {
            if (!existing.matchIds.includes(a.id)) existing.matchIds.push(a.id);
            if (!existing.matchIds.includes(b.id)) existing.matchIds.push(b.id);
          } else {
            found.set(key, {
              matchIds: [a.id, b.id],
              label: a.stream_url,
              type: 'resource',
              time: formatDateTime(a.scheduled_at),
            });
          }
        }
      }
    }
    return found;
  }, [matches]);

  // Set of match IDs involved in conflicts (for highlighting)
  const conflictMatchIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach((c) => c.matchIds.forEach((id) => ids.add(id)));
    return ids;
  }, [conflicts]);

  // Calendar data: group matches by date
  const calendarDays = useMemo(() => {
    const scheduled = matches.filter((m) => m.scheduled_at);
    const unscheduled = matches.filter((m) => !m.scheduled_at);

    const byDate = new Map<string, Match[]>();
    for (const m of scheduled) {
      const d = new Date(m.scheduled_at!);
      const dateKey = d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const arr = byDate.get(dateKey) || [];
      arr.push(m);
      byDate.set(dateKey, arr);
    }

    // Sort matches within each day by time
    byDate.forEach((arr) => {
      arr.sort(
        (a, b) =>
          new Date(a.scheduled_at!).getTime() -
          new Date(b.scheduled_at!).getTime()
      );
    });

    // Sort days chronologically
    const sortedDays = Array.from(byDate.entries()).sort((a, b) => {
      const aTime = new Date(a[1][0].scheduled_at!).getTime();
      const bTime = new Date(b[1][0].scheduled_at!).getTime();
      return aTime - bTime;
    });

    return { sortedDays, unscheduled };
  }, [matches]);

  async function fetchMatches() {
    if (!id) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('includeStages', '1');
      params.set('includeTotal', '1');
      params.set('includeTeams', '1');
      if (stageFilter) params.set('stageId', stageFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (roundFilter) params.set('roundNumber', roundFilter);
      if (resultFilter) params.set('result', resultFilter);
      if (dateFromFilter)
        params.set('dateFrom', new Date(dateFromFilter).toISOString());
      if (dateToFilter)
        params.set(
          'dateTo',
          new Date(dateToFilter + 'T23:59:59').toISOString()
        );
      if (search.trim()) params.set('search', search.trim());

      const json = await adminFetchJson<MatchesApiResponse>(
        `/api/admin/tournament/${id}/matches?` + params.toString()
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

  useEffect(() => {
    if (!id || !filtersHydrated) return;
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- GARDÉ : deps curées à dessein. `search` est exclu (appliqué au submit) ; `fetchMatches` ne peut pas être mémoïsé/listé sans casse : il est appelé à la fois par cet effet (qui NE doit PAS dépendre de `search`) et par handleFilterSubmit/handlers (qui DOIVENT lire le `search` courant → closure fraîche à chaque render, cf. fetchMatchesRef). adminFetch* est stable mais n'y change rien.
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
  ]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchMatches();
  }

  async function handleAutoSchedule() {
    if (!id) return;
    setAutoSchedRunning(true);
    setErrorMsg(null);

    const callAutoSchedule = (acceptConflicts: boolean) =>
      mutateIdempotent(`/api/admin/tournament/${id}/auto-schedule`, {
        method: 'POST',
        body: JSON.stringify(acceptConflicts ? { acceptConflicts: true } : {}),
      });

    try {
      let res = await callAutoSchedule(false);

      // Le back refuse d'appliquer si des conflits ont ete detectes : on
      // demande une confirmation explicite avant de renvoyer la requete.
      if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        if (json.detail === 'SCHEDULE_CONFLICTS_REQUIRE_CONFIRMATION') {
          const count = json.conflicts?.length ?? 0;
          const ok = await confirm({
            title: format(t.autoConflictsTitle, { count }),
            subtitle: t.autoConflictsSubtitle,
            variant: 'warning',
            confirmLabel: t.autoApply,
          });
          if (!ok) {
            setAutoSchedRunning(false);
            return;
          }
          res = await callAutoSchedule(true);
        }
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorAutoSchedule);
      }

      const json = await res.json();
      const scheduledCount =
        json.scheduled?.length ?? json.scheduledMatchesCount ?? 0;
      const conflictCount = json.conflicts?.length ?? 0;
      const warnings: string[] = json.warnings ?? [];

      let toastMsg = format(t.autoDoneMsg, { count: scheduledCount });
      if (conflictCount > 0)
        toastMsg +=
          ' ' + format(t.autoConflictsAccepted, { count: conflictCount });
      if (warnings.length > 0) toastMsg += ` ${warnings.join(' ')}`;

      addToast(toastMsg, conflictCount > 0 ? 'info' : 'success');
      fetchMatches();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorAutoSchedule);
    } finally {
      setAutoSchedRunning(false);
    }
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
        await adminFetchJson(`/api/admin/matches/${matchId}`, {
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
        inputs[m.id] = formatToInputDateTime(m.scheduled_at);
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
        scheduled_at: dt ? new Date(dt).toISOString() : null,
      })
    );

    if (schedules.length === 0) return;

    setBulkScheduleSaving(true);
    setErrorMsg(null);

    try {
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageFilter}/bulk-matches`,
        {
          method: 'PATCH',
          body: JSON.stringify({ schedules }),
        }
      );

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
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageFilter}/bulk-matches`,
        {
          method: 'DELETE',
          body: JSON.stringify({
            matchIds: Array.from(selectedMatchIds),
            hard,
          }),
        }
      );

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
      const res = await mutateIdempotent(
        `/api/admin/stages/${stageFilter}/bulk-matches`,
        {
          method: 'PUT',
          body: JSON.stringify({
            matchIds: Array.from(selectedMatchIds),
            fields,
          }),
        }
      );

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

  // --- CSV import ---
  function parseCsvPreview(text: string) {
    const lines = text
      .trim()
      .split('\n')
      .filter((l) => l.trim());
    if (lines.length === 0) {
      setCsvPreview([]);
      return;
    }

    // Detect separator
    const sep = lines[0].includes('\t')
      ? '\t'
      : lines[0].includes(';')
        ? ';'
        : ',';

    const rows: typeof csvPreview = [];
    const headerLine = lines[0].toLowerCase();
    const hasHeader =
      headerLine.includes('team1') || headerLine.includes('equipe');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    for (const line of dataLines) {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 2) {
        rows.push({
          team1: cols[0],
          team2: cols[1],
          round: cols[2] || undefined,
          scheduled_at: cols[3] || undefined,
          best_of: cols[4] || undefined,
        });
      }
    }
    setCsvPreview(rows);
  }

  async function handleCsvImport() {
    if (!id || csvPreview.length === 0) return;

    setCsvImporting(true);
    setErrorMsg(null);

    try {
      // Resolve team names to IDs
      const teamsRes = await adminFetch(`/api/admin/tournament/${id}/teams`);
      if (!teamsRes.ok) throw new Error(t.errorTeamsLoad);
      const teamsJson = await teamsRes.json();
      const teams: Array<{
        id: string;
        name: string;
        short_name: string | null;
      }> = teamsJson.teams || [];

      const findTeam = (name: string) => {
        const lower = name.toLowerCase().trim();
        return teams.find(
          (team) =>
            team.name.toLowerCase() === lower ||
            (team.short_name && team.short_name.toLowerCase() === lower)
        );
      };

      const matchPayloads = csvPreview.map((row) => {
        const t1 = findTeam(row.team1);
        const t2 = findTeam(row.team2);

        return {
          stage_id: stageFilter || null,
          team1_id: t1?.id || null,
          team2_id: t2?.id || null,
          round_number: row.round ? parseInt(row.round, 10) || null : null,
          scheduled_at: row.scheduled_at
            ? new Date(row.scheduled_at).toISOString()
            : null,
          best_of: row.best_of ? parseInt(row.best_of, 10) || null : null,
          status: 'pending' as const,
        };
      });

      const unresolved = csvPreview.filter(
        (row, i) => !matchPayloads[i].team1_id || !matchPayloads[i].team2_id
      );

      if (unresolved.length > 0) {
        const names = unresolved
          .flatMap((r) => [r.team1, r.team2])
          .filter((n, i, arr) => arr.indexOf(n) === i && !findTeam(n));
        throw new Error(
          format(t.errorTeamsNotFound, {
            names: `${names.slice(0, 5).join(', ')}${names.length > 5 ? '...' : ''}`,
          })
        );
      }

      const res = await csvImportMutate(`/api/admin/tournament/${id}/matches`, {
        method: 'POST',
        body: JSON.stringify({ matches: matchPayloads }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorImport);
      }

      const json = await res.json();
      addToast(
        format(t.toastCsvImported, { count: json.matches?.length ?? 0 }),
        'info'
      );
      setCsvImportMode(false);
      setCsvText('');
      setCsvPreview([]);
      fetchMatches();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorCsvImport);
    } finally {
      setCsvImporting(false);
    }
  }

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="print-document min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="print:hidden">
              <TournamentTabsNav
                tournamentId={String(id ?? '')}
                active="matches"
              />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                {tournament && (
                  <p className="text-neutral-400 text-sm mt-1">
                    {tournament.name}
                    {tournament.slug && (
                      <span className="ml-2 font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded">
                        /{tournament.slug}
                      </span>
                    )}
                    {total !== null && (
                      <span className="ml-2">
                        {format(
                          total > 1 ? t.matchCount_other : t.matchCount_one,
                          { count: total }
                        )}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <PrintExportButton variant="admin" />
                <button
                  type="button"
                  onClick={handleAutoSchedule}
                  disabled={autoSchedRunning}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {autoSchedRunning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.planningInProgress}
                    </>
                  ) : (
                    <>
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
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {t.autoScheduler}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCsvImportMode(!csvImportMode)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                    csvImportMode
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-800 hover:bg-neutral-700 border border-neutral-700'
                  }`}
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  {t.importCsv}
                </button>

                <Link
                  href={`/admin/tournament/${id}/bulk-ops`}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
                  title={t.bulkOpsTitle}
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
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  {t.bulkOps}
                </Link>
              </div>
            </div>
          </div>

          {/* Messages */}
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
              {errorMsg}
            </div>
          )}
          {/* Filters — commandes d'écran : le PDF imprime la liste filtrée,
              pas les filtres. */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6 print:hidden">
            <form
              onSubmit={handleFilterSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterStage}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={stageFilter}
                  onChange={(e) => {
                    setStageFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t.allStages}</option>
                  {stages
                    .slice()
                    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {stageLabel(t, s)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterStatus}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t.allStatuses}</option>
                  <option value="pending">{t.statusPending}</option>
                  <option value="ongoing">{t.statusOngoing}</option>
                  <option value="finished">{t.statusFinished}</option>
                  <option value="cancelled">{t.statusCancelled}</option>
                </select>
              </div>

              <div className="w-24">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterRound}
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={roundFilter}
                  onChange={(e) => {
                    setRoundFilter(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="#"
                />
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterResult}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={resultFilter}
                  onChange={(e) => {
                    setResultFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t.resultAll}</option>
                  <option value="win">{t.resultWin}</option>
                  <option value="no_result">{t.resultNoResult}</option>
                  <option value="bye">{t.resultBye}</option>
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterDateFrom}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={dateFromFilter}
                  onChange={(e) => {
                    setDateFromFilter(e.target.value);
                    setOffset(0);
                  }}
                />
              </div>

              <div className="min-w-[140px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.filterDateTo}
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={dateToFilter}
                  onChange={(e) => {
                    setDateToFilter(e.target.value);
                    setOffset(0);
                  }}
                />
              </div>

              <div className="flex-1 min-w-[200px]">
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
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder={t.searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                  {t.filter}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStageFilter('');
                    setStatusFilter('');
                    setRoundFilter('');
                    setResultFilter('');
                    setDateFromFilter('');
                    setDateToFilter('');
                    setSearch('');
                    setOffset(0);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                >
                  {t.reset}
                </button>
              </div>
            </form>
          </section>

          {/* View toggle & conflict warnings */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex rounded-xl overflow-hidden border border-neutral-700">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
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
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                {t.viewList}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'calendar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
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
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {t.viewCalendar}
              </button>
            </div>

            {conflicts.size > 0 && (
              <div className="flex-1 rounded-xl bg-orange-900/40 border border-orange-500/50 px-4 py-3 text-sm flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <span className="font-semibold text-orange-300">
                    {format(
                      conflicts.size > 1
                        ? t.conflictsSummary_other
                        : t.conflictsSummary_one,
                      { count: conflicts.size }
                    )}
                  </span>
                  <ul className="mt-1 space-y-0.5">
                    {Array.from(conflicts.values()).map((c, i) => (
                      <li key={i} className="text-orange-200/80 text-xs">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-1 ${c.type === 'team' ? 'bg-orange-700/50' : 'bg-purple-700/50'}`}
                        >
                          {c.type === 'team'
                            ? t.conflictTeam
                            : t.conflictStream}
                        </span>
                        <span className="font-medium">{c.label}</span> —{' '}
                        {format(t.conflictDetail, {
                          count: c.matchIds.length,
                          time: c.time,
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Bulk actions bar */}
          {selectedMatchIds.size > 0 && (
            <section className="bg-blue-900/30 border border-blue-500/40 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {format(
                  selectedMatchIds.size > 1
                    ? t.selectedCount_other
                    : t.selectedCount_one,
                  { count: selectedMatchIds.size }
                )}
              </span>

              <div className="flex-1" />

              {!bulkScheduleMode && !bulkEditMode && (
                <>
                  <button
                    type="button"
                    onClick={enterBulkScheduleMode}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium transition-colors"
                  >
                    {t.bulkScheduleBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkEditMode(true)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs font-medium transition-colors"
                  >
                    {t.bulkEditBtn}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleBulkDelete(false)}
                disabled={bulkDeleting}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {bulkDeleting ? t.inProgress : t.bulkCancelBtn}
              </button>

              <button
                type="button"
                onClick={() => handleBulkDelete(true)}
                disabled={bulkDeleting}
                className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {bulkDeleting ? t.inProgress : t.bulkDeleteBtn}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMatchIds(new Set());
                  setBulkScheduleMode(false);
                  setBulkEditMode(false);
                  setBulkEditFields({});
                }}
                className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
              >
                {t.cancelSelection}
              </button>
            </section>
          )}

          {/* Bulk schedule panel */}
          {bulkScheduleMode && selectedMatchIds.size > 0 && (
            <section className="bg-neutral-800/50 backdrop-blur border border-blue-500/30 rounded-2xl p-5 mb-6">
              <h3 className="text-sm font-semibold mb-3">
                {format(
                  selectedMatchIds.size > 1
                    ? t.bulkScheduleTitle_other
                    : t.bulkScheduleTitle_one,
                  { count: selectedMatchIds.size }
                )}
              </h3>

              <div className="flex items-end gap-4 mb-4 flex-wrap">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.applySameDateTime}
                  </label>
                  <input
                    type="datetime-local"
                    className="px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => setBulkScheduleForAll(e.target.value)}
                  />
                </div>
                <div className="text-xs text-neutral-400 py-2">
                  {t.orAdjustIndividually}
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {matches
                  .filter((m) => selectedMatchIds.has(m.id))
                  .map((m) => (
                    <BulkScheduleRow
                      key={m.id}
                      match={m}
                      initialValue={bulkScheduleInitialRef.current[m.id] ?? ''}
                      broadcastValue={bulkBroadcast.value}
                      broadcastNonce={bulkBroadcast.nonce}
                      onChange={handleBulkInputChange}
                    />
                  ))}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleBulkScheduleSave}
                  disabled={bulkScheduleSaving}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                    bulkScheduleSaving
                      ? 'bg-blue-800 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {bulkScheduleSaving
                    ? t.bulkScheduleSaving
                    : t.bulkScheduleSave}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkScheduleMode(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
                >
                  {t.close}
                </button>
              </div>

              {!stageFilter && (
                <p className="mt-2 text-xs text-amber-400">
                  {t.bulkScheduleHint}
                </p>
              )}
            </section>
          )}

          {/* Bulk edit panel */}
          {bulkEditMode && selectedMatchIds.size > 0 && (
            <section className="bg-neutral-800/50 backdrop-blur border border-purple-500/30 rounded-2xl p-5 mb-6">
              <h3 className="text-sm font-semibold mb-3">
                {format(
                  selectedMatchIds.size > 1
                    ? t.bulkEditTitle_other
                    : t.bulkEditTitle_one,
                  { count: selectedMatchIds.size }
                )}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.filterStatus}
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={bulkEditFields.status ?? ''}
                    onChange={(e) =>
                      setBulkEditFields((prev) => ({
                        ...prev,
                        status: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">{t.dontModify}</option>
                    <option value="pending">{t.statusPending}</option>
                    <option value="ongoing">{t.statusOngoing}</option>
                    <option value="finished">{t.statusFinished}</option>
                    <option value="cancelled">{t.statusCancelled}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.bulkFormatLabel}
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={bulkEditFields.best_of ?? ''}
                    onChange={(e) =>
                      setBulkEditFields((prev) => ({
                        ...prev,
                        best_of: e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      }))
                    }
                  >
                    <option value="">{t.dontModify}</option>
                    <option value="1">BO1</option>
                    <option value="3">BO3</option>
                    <option value="5">BO5</option>
                    <option value="7">BO7</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.bulkRoundLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder={t.dontModify}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={bulkEditFields.round_number ?? ''}
                    onChange={(e) =>
                      setBulkEditFields((prev) => ({
                        ...prev,
                        round_number: e.target.value
                          ? parseInt(e.target.value, 10)
                          : undefined,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.bulkNotesLabel}
                  </label>
                  <input
                    type="text"
                    placeholder={t.dontModify}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={bulkEditFields.notes ?? ''}
                    onChange={(e) =>
                      setBulkEditFields((prev) => ({
                        ...prev,
                        notes: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBulkEditSave}
                  disabled={bulkEditSaving}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                    bulkEditSaving
                      ? 'bg-purple-800 cursor-wait'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {bulkEditSaving ? t.bulkEditSaving : t.bulkEditSave}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkEditMode(false);
                    setBulkEditFields({});
                  }}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
                >
                  {t.close}
                </button>
              </div>

              {!stageFilter && (
                <p className="mt-2 text-xs text-amber-400">{t.bulkEditHint}</p>
              )}
            </section>
          )}

          {/* CSV import panel */}
          {csvImportMode && (
            <section className="bg-neutral-800/50 backdrop-blur border border-emerald-500/30 rounded-2xl p-5 mb-6">
              <h3 className="text-sm font-semibold mb-3">{t.csvImportTitle}</h3>
              <p className="text-xs text-neutral-400 mb-3">
                {t.csvFormatPrefix}
                <code className="bg-neutral-900 px-1 rounded">
                  {t.csvFormatCode}
                </code>
                {t.csvFormatSuffix}
              </p>

              <textarea
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-600 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[120px]"
                placeholder={
                  'Team Alpha, Team Beta, 1, 2026-03-15T14:00, 3\nTeam Gamma, Team Delta, 1, 2026-03-15T15:00, 3'
                }
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  parseCsvPreview(e.target.value);
                }}
                rows={6}
              />

              {csvPreview.length > 0 && (
                <div className="mt-3 rounded-lg bg-neutral-900/50 border border-neutral-700 p-3">
                  <p className="text-xs text-neutral-400 mb-2">
                    {format(t.csvPreviewCount, { count: csvPreview.length })}
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {csvPreview.map((row, i) => (
                      <div key={i} className="text-xs flex items-center gap-2">
                        <span className="text-neutral-500 w-6">{i + 1}.</span>
                        <span className="font-medium">{row.team1}</span>
                        <span className="text-neutral-500">vs</span>
                        <span className="font-medium">{row.team2}</span>
                        {row.round && (
                          <span className="text-neutral-500">R{row.round}</span>
                        )}
                        {row.scheduled_at && (
                          <span className="text-neutral-500">
                            {row.scheduled_at}
                          </span>
                        )}
                        {row.best_of && (
                          <span className="text-neutral-500">
                            BO{row.best_of}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleCsvImport}
                  disabled={csvImporting || csvPreview.length === 0}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                    csvImporting
                      ? 'bg-emerald-800 cursor-wait'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  } disabled:opacity-50`}
                >
                  {csvImporting
                    ? t.csvImporting
                    : format(t.csvImportBtn, { count: csvPreview.length })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvImportMode(false);
                    setCsvText('');
                    setCsvPreview([]);
                  }}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
                >
                  {t.close}
                </button>
              </div>
            </section>
          )}

          {/* Calendar View */}
          {viewMode === 'calendar' && !loading && matches.length > 0 && (
            <section className="space-y-6 mb-6">
              {calendarDays.sortedDays.map(([dateLabel, dayMatches]) => (
                <div
                  key={dateLabel}
                  className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden"
                >
                  <div className="px-5 py-3 bg-neutral-900/50 border-b border-neutral-700/50">
                    <h3 className="text-sm font-semibold capitalize">
                      {dateLabel}
                    </h3>
                    <span className="text-xs text-neutral-400">
                      {format(
                        dayMatches.length > 1
                          ? t.dayMatchCount_other
                          : t.dayMatchCount_one,
                        { count: dayMatches.length }
                      )}
                    </span>
                  </div>

                  <div className="divide-y divide-neutral-700/30">
                    {dayMatches.map((m) => {
                      const time = new Date(m.scheduled_at!).toLocaleTimeString(
                        'fr-FR',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      );
                      const hasConflict = conflictMatchIds.has(m.id);

                      return (
                        <div
                          key={m.id}
                          className={`flex items-center gap-4 px-5 py-3 hover:bg-neutral-700/20 transition-colors ${
                            hasConflict
                              ? 'border-l-4 border-l-orange-500 bg-orange-900/10'
                              : ''
                          }`}
                        >
                          {/* Time slot */}
                          <div className="w-16 flex-shrink-0 text-center">
                            <div className="text-lg font-bold text-blue-400">
                              {time}
                            </div>
                          </div>

                          {/* Conflict icon */}
                          {hasConflict && (
                            <span
                              title={t.conflictTitle}
                              className="text-orange-400 flex-shrink-0"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </span>
                          )}

                          {/* Teams */}
                          <div className="flex-1 flex items-center gap-3 min-w-0">
                            <span className="font-medium text-sm truncate">
                              {m.team1?.short_name || m.team1?.name || 'TBD'}
                            </span>
                            <span className="text-neutral-500 text-xs">vs</span>
                            <span className="font-medium text-sm truncate">
                              {m.team2?.short_name || m.team2?.name || 'TBD'}
                            </span>
                          </div>

                          {/* Score / Status */}
                          <div className="flex-shrink-0 flex items-center gap-2">
                            {typeof m.team1_score === 'number' ||
                            typeof m.team2_score === 'number' ? (
                              <span className="font-£bold text-sm bg-neutral-900/50 px-3 py-1 rounded-lg">
                                {m.team1_score ?? 0} - {m.team2_score ?? 0}
                              </span>
                            ) : null}
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(m.status)}`}
                            >
                              {statusLabel(t, m.status)}
                            </span>
                          </div>

                          {/* Stage info */}
                          <div className="w-32 flex-shrink-0 text-right">
                            <div className="text-xs text-neutral-400 truncate">
                              {stageLabel(t, m.stage)}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              R{m.round_number ?? '?'}
                              {m.best_of ? ` • BO${m.best_of}` : ''}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1.5 flex-shrink-0">
                            <Link
                              href={`/admin/matches/${m.id}/edit`}
                              className="px-2.5 py-1 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
                            >
                              {t.edit}
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Unscheduled matches */}
              {calendarDays.unscheduled.length > 0 && (
                <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-neutral-900/50 border-b border-neutral-700/50">
                    <h3 className="text-sm font-semibold text-neutral-400">
                      {t.unscheduled}
                    </h3>
                    <span className="text-xs text-neutral-500">
                      {format(
                        calendarDays.unscheduled.length > 1
                          ? t.unscheduledCount_other
                          : t.unscheduledCount_one,
                        { count: calendarDays.unscheduled.length }
                      )}
                    </span>
                  </div>
                  <div className="divide-y divide-neutral-700/30">
                    {calendarDays.unscheduled.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-4 px-5 py-3"
                      >
                        <div className="w-16 flex-shrink-0 text-center">
                          <span className="text-neutral-600 text-sm">—</span>
                        </div>
                        <div className="flex-1 flex items-center gap-3 min-w-0">
                          <span className="font-medium text-sm truncate text-neutral-400">
                            {m.team1?.short_name || m.team1?.name || 'TBD'}
                          </span>
                          <span className="text-neutral-600 text-xs">vs</span>
                          <span className="font-medium text-sm truncate text-neutral-400">
                            {m.team2?.short_name || m.team2?.name || 'TBD'}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(m.status)}`}
                        >
                          {statusLabel(t, m.status)}
                        </span>
                        <div className="w-32 flex-shrink-0 text-right">
                          <div className="text-xs text-neutral-400 truncate">
                            {stageLabel(t, m.stage)}
                          </div>
                        </div>
                        <Link
                          href={`/admin/matches/${m.id}/edit`}
                          className="px-2.5 py-1 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
                        >
                          Editer
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Calendar loading / empty state */}
          {viewMode === 'calendar' && loading && (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            </section>
          )}
          {viewMode === 'calendar' && !loading && matches.length === 0 && (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-20 text-center text-neutral-400 mb-6">
              {t.emptyMatches}
            </section>
          )}

          {/* Matches List */}
          {viewMode === 'list' && (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                </div>
              ) : matches.length === 0 ? (
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
                      d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {t.emptyMatches}
                </div>
              ) : (
                <div className="divide-y divide-neutral-700/50">
                  {/* Select all row */}
                  <div className="px-4 py-2 bg-neutral-900/30 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={
                        selectedMatchIds.size === matches.length &&
                        matches.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-neutral-400">
                      {t.selectAll}
                    </span>
                  </div>

                  {matches.map((m) => (
                    <MatchRow
                      key={m.id}
                      t={t}
                      match={m}
                      selected={selectedMatchIds.has(m.id)}
                      hasConflict={conflictMatchIds.has(m.id)}
                      quickScoreOpen={quickScoreId === m.id}
                      qsSaving={qsSaving}
                      onToggleSelect={toggleMatchSelection}
                      onToggleQuickScore={handleToggleQuickScore}
                      onQuickScoreSubmit={handleQuickScore}
                      onQuickScoreCancel={handleQuickScoreCancel}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Pagination */}
          {matches.length > 0 && (
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
                {offset + 1} – {offset + matches.length}
                {total ? format(t.paginationTotal, { total }) : ''}
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

type TeamCellProps = {
  team: TeamMini | null | undefined;
  fallbackId: string | null | undefined;
  isWinner: boolean;
  align?: 'left' | 'right';
};

function TeamCell({
  team,
  fallbackId,
  isWinner,
  align = 'left',
}: TeamCellProps) {
  const label = team?.name || fallbackId || 'TBD';
  const short = team?.short_name || null;

  return (
    <div
      className={`flex items-center gap-3 w-40 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {team?.logo_url ? (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={40}
          height={40}
          className="w-10 h-10 rounded-xl object-cover border border-neutral-700"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-neutral-700/50 border border-neutral-700 flex items-center justify-center text-xs font-semibold uppercase">
          {(label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className={`font-semibold text-sm truncate ${isWinner ? 'text-emerald-400' : ''}`}
        >
          {label}
        </div>
        {short && (
          <div className="text-xs text-neutral-500 truncate">{short}</div>
        )}
      </div>
    </div>
  );
}

// --- Éditeur quick-score inline -------------------------------------------
// L'état d'édition (score1/score2) est LOCAL à ce composant : taper n'entraîne
// donc AUCUN re-render de la page ni des autres lignes. À l'ouverture, les
// valeurs initiales sont dérivées du match (le composant est monté/démonté par
// `quickScoreOpen` côté page, ce qui garantit un reset propre).
type QuickScoreEditorProps = {
  t: Dict;
  match: Match;
  saving: boolean;
  onSubmit: (matchId: string, s1: string, s2: string) => void;
  onCancel: () => void;
};

function QuickScoreEditor({
  t,
  match,
  saving,
  onSubmit,
  onCancel,
}: QuickScoreEditorProps) {
  const [score1, setScore1] = useState(
    match.team1_score != null ? String(match.team1_score) : ''
  );
  const [score2, setScore2] = useState(
    match.team2_score != null ? String(match.team2_score) : ''
  );

  return (
    <div className="mt-3 flex items-center gap-3 pl-40">
      <span className="text-xs text-neutral-400 w-20 text-right truncate">
        {match.team1?.short_name || match.team1?.name || t.team1Fallback}
      </span>
      <input
        type="number"
        min={0}
        className="w-16 px-2 py-1.5 rounded-lg bg-neutral-900 border border-neutral-600 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
        value={score1}
        onChange={(e) => setScore1(e.target.value)}
        autoFocus
      />
      <span className="text-neutral-500 font-bold">—</span>
      <input
        type="number"
        min={0}
        className="w-16 px-2 py-1.5 rounded-lg bg-neutral-900 border border-neutral-600 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
        value={score2}
        onChange={(e) => setScore2(e.target.value)}
      />
      <span className="text-xs text-neutral-400 w-20 truncate">
        {match.team2?.short_name || match.team2?.name || t.team2Fallback}
      </span>
      <button
        type="button"
        disabled={score1 === '' || score2 === '' || saving}
        onClick={() => onSubmit(match.id, score1, score2)}
        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? t.validating : t.validate}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-2 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
      >
        {t.cancel}
      </button>
    </div>
  );
}

// --- Ligne du panneau de planification groupée ----------------------------
// Valeur locale (pas de state page) → taper ne re-render que cette ligne. La
// valeur est remontée dans une ref via `onChange`. Le broadcast « même
// date/heure pour toutes » est appliqué via un effet piloté par un nonce.
type BulkScheduleRowProps = {
  match: Match;
  initialValue: string;
  broadcastValue: string;
  broadcastNonce: number;
  onChange: (matchId: string, value: string) => void;
};

function BulkScheduleRow({
  match,
  initialValue,
  broadcastValue,
  broadcastNonce,
  onChange,
}: BulkScheduleRowProps) {
  const [value, setValue] = useState(initialValue);
  const seenNonce = useRef(broadcastNonce);

  useEffect(() => {
    // On ignore le nonce initial (montage) ; on ne réagit qu'aux bumps.
    if (broadcastNonce === seenNonce.current) return;
    seenNonce.current = broadcastNonce;
    setValue(broadcastValue);
  }, [broadcastNonce, broadcastValue]);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-48 truncate text-neutral-300">
        {match.team1?.short_name || match.team1?.name || 'TBD'} vs{' '}
        {match.team2?.short_name || match.team2?.name || 'TBD'}
      </span>
      <span className="text-xs text-neutral-500 font-mono">
        R{match.round_number ?? '?'}
      </span>
      <input
        type="datetime-local"
        className="px-2 py-1.5 rounded-lg bg-neutral-900 border border-neutral-600 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(match.id, e.target.value);
        }}
      />
    </div>
  );
}

// --- Ligne de match (liste principale) ------------------------------------
// Mémoïsée : avec des props stables (handlers en useCallback côté page,
// `t`/`match` stables), une frappe dans le filtre de recherche ou l'ouverture
// d'un quick-score sur une AUTRE ligne ne re-render pas cette ligne.
type MatchRowProps = {
  t: Dict;
  match: Match;
  selected: boolean;
  hasConflict: boolean;
  quickScoreOpen: boolean;
  qsSaving: boolean;
  onToggleSelect: (matchId: string) => void;
  onToggleQuickScore: (matchId: string) => void;
  onQuickScoreSubmit: (matchId: string, s1: string, s2: string) => void;
  onQuickScoreCancel: () => void;
};

const MatchRow = memo(function MatchRow({
  t,
  match: m,
  selected,
  hasConflict,
  quickScoreOpen,
  qsSaving,
  onToggleSelect,
  onToggleQuickScore,
  onQuickScoreSubmit,
  onQuickScoreCancel,
}: MatchRowProps) {
  return (
    <div
      className={`p-4 hover:bg-neutral-700/30 transition-colors ${
        selected ? 'bg-blue-900/15' : ''
      } ${hasConflict ? 'border-l-4 border-l-orange-500' : ''}`}
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Conflict indicator */}
        {hasConflict && (
          <span
            title="Conflit horaire"
            className="text-orange-400 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(m.id)}
          className="accent-blue-500 flex-shrink-0"
        />

        {/* Stage & Round info */}
        <div className="w-40 flex-shrink-0">
          <div className="font-medium text-sm">{stageLabel(t, m.stage)}</div>
          <div className="text-xs text-neutral-400">
            {format(t.roundLabel, {
              round: m.round_number ?? '—',
            })}
            {m.best_of ? ` • BO${m.best_of}` : ''}
          </div>
          <div className="text-[10px] text-neutral-500 font-mono mt-1">
            #{m.id.slice(0, 8)}
          </div>
        </div>

        {/* Teams & Score */}
        <div className="flex-1 flex items-center justify-center gap-4 min-w-[300px]">
          <TeamCell
            team={m.team1}
            fallbackId={m.team1?.name || undefined}
            isWinner={m.winner_team_id === m.team1_id}
            align="right"
          />

          <div className="flex flex-col items-center">
            <div className="text-xl font-bold px-4 py-1 bg-neutral-900/50 rounded-lg">
              {typeof m.team1_score === 'number' ||
              typeof m.team2_score === 'number'
                ? `${m.team1_score ?? 0} - ${m.team2_score ?? 0}`
                : 'vs'}
            </div>
            <span
              className={`mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                m.status
              )}`}
            >
              {statusLabel(t, m.status)}
            </span>
          </div>

          <TeamCell
            team={m.team2}
            fallbackId={m.team2?.name || undefined}
            isWinner={m.winner_team_id === m.team2_id}
            align="left"
          />
        </div>

        {/* Schedule */}
        <div className="w-32 text-right flex-shrink-0">
          <div className="text-sm text-neutral-300">
            {formatDateTime(m.scheduled_at)}
          </div>
          {m.completed_at && (
            <div className="text-[10px] text-neutral-500">
              {format(t.finishedAt, {
                date: formatDateTime(m.completed_at),
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          {m.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => onToggleQuickScore(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                quickScoreOpen
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/40'
              }`}
            >
              {t.score}
            </button>
          )}
          <Link
            href={`/admin/matches/${m.id}/edit`}
            className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs font-medium transition-colors"
          >
            {t.edit}
          </Link>
          <Link
            href={`/match/${m.id}`}
            target="_blank"
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium transition-colors"
          >
            {t.view}
          </Link>
        </div>
      </div>

      {/* Inline Quick Score */}
      {quickScoreOpen && (
        <QuickScoreEditor
          t={t}
          match={m}
          saving={qsSaving}
          onSubmit={onQuickScoreSubmit}
          onCancel={onQuickScoreCancel}
        />
      )}
    </div>
  );
});

export default AdminTournamentMatchesPage;
