// components/admin/tournament/VetoPanel.tsx
// Interactive map pick/ban (veto) flow for a match. Extracted from the former
// /admin/tournament/[id]/veto page; now the `veto` sub-tab of the merged
// bracket route. Client-only: reads the tournament id from the router, resolves
// the staff role via useStaffSession (for the admin-only unlock action), and
// fetches its own data (no gssp, no <Head>, no page wrapper, no
// TournamentTabsNav — the host route provides those).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useStaffSession } from '@/hooks/useStaffSession';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { VetoFlowStep, VetoStep, MatchVetoState } from '@/types/veto';
import nsAdminTournamentVeto from '@/lib/i18n/locales/admin-fr/adminTournamentVeto';
import { useMatchMapPool } from '@/components/admin/tournament/mapPool/useMatchMapPool';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import * as R from '@/features/admin/_shared/ui/ruban';

type Dict = typeof nsAdminTournamentVeto.fr;

type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
};

type MatchOption = {
  id: string;
  round_name: string | null;
  round_number: number | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_name: string | null;
  team2_name: string | null;
  status: string;
};

/**
 * Ligne telle que `/api/admin/tournament/[id]/matches` la rend.
 *
 * `team1` / `team2` sont les embeds PostgREST, optionnels : la route peut les
 * omettre. C'est précisément ce que le repli `m.team1?.name || m.team1_id`
 * couvre — le type le rend visible au lieu de le laisser deviner.
 */
type AdminMatchRow = {
  id: string;
  round_name: string | null;
  round_number: number | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  status: string;
  team1?: { name?: string | null } | null;
  team2?: { name?: string | null } | null;
};

function getTypeLabels(t: Dict): Record<string, string> {
  return {
    control: t.typeControl,
    hybrid: t.typeHybrid,
    escort: t.typeEscort,
    push: t.typePush,
    flashpoint: t.typeFlashpoint,
  };
}

function typeLabel(t: Dict, type: string | null | undefined) {
  if (!type) return '—';
  return getTypeLabels(t)[type] || type;
}

function actionLabel(action: string): string {
  switch (action) {
    case 'ban':
      return 'BAN';
    case 'pick':
      return 'PICK';
    case 'decider':
      return 'DECIDER';
    default:
      return action.toUpperCase();
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'ban':
      return 'bg-[rgba(255,107,107,.13)] border-[rgba(255,107,107,.4)] text-[#ffc2c2]';
    case 'pick':
      return 'bg-[rgba(127,202,101,.13)] border-[rgba(127,202,101,.36)] text-[var(--lf-200,#b3e7a3)]';
    case 'decider':
      return 'bg-[rgba(180,103,209,.12)] border-[rgba(180,103,209,.4)] text-[var(--or-200,#eec4ff)]';
    default:
      return 'bg-[var(--s2,#1d1520)] border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)]';
  }
}

function sideLabel(
  t: Dict,
  side: string | null,
  team1Name: string | null,
  team2Name: string | null
): string {
  if (side === 'team1') return team1Name || t.team1Fallback;
  if (side === 'team2') return team2Name || t.team2Fallback;
  return t.sideRemaining;
}

export default function VetoPanel() {
  const t = useAdminT(nsAdminTournamentVeto);
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { staffRole } = useStaffSession();
  const canUnlockVeto = staffRole === 'owner' || staffRole === 'admin';

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { adminFetch } = useAdminFetch();
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournamentName, setTournamentName] = useState<string>(
    t.defaultTournamentName
  );

  // Match selection. Présélection par `?match=<id>` : c'est ce qui permet
  // d'arriver ici directement depuis l'écran d'arbitrage d'un match, au lieu
  // de rechercher le match dans la liste — le veto était invisible depuis
  // l'endroit où l'on saisit les scores, et n'a donc jamais servi.
  const matchFromQuery = Array.isArray(router.query.match)
    ? router.query.match[0]
    : router.query.match;
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    matchFromQuery ?? ''
  );
  // Pool EFFECTIF du match (date > journée > tournoi), sinon celui du tournoi.
  const poolMaps = useMatchMapPool(selectedMatchId, tournamentId) ?? maps;

  // Le premier rendu peut précéder l'hydratation du routeur : on rattrape la
  // présélection quand la query arrive, sans jamais écraser un choix manuel.
  const appliedQueryMatch = useRef(false);
  useEffect(() => {
    if (appliedQueryMatch.current || !matchFromQuery) return;
    appliedQueryMatch.current = true;
    setSelectedMatchId(matchFromQuery);
  }, [matchFromQuery]);

  // Veto state
  const [vetoState, setVetoState] = useState<MatchVetoState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Fetch maps
      const mapsRes = await adminFetch(`/api/tournament/${tournamentId}/maps`);
      if (mapsRes.ok) {
        const json = await mapsRes.json();
        setMaps((json.maps || []).filter((m: TournamentMapRow) => m.enabled));
        setTournamentName(json.tournament?.name || t.defaultTournamentName);
      }

      // Fetch matches (pending or ongoing, with both teams assigned)
      const matchesRes = await adminFetch(
        `/api/admin/tournament/${tournamentId}/matches?limit=100`
      );
      if (matchesRes.ok) {
        // Recopie des champs réellement lus plus bas. `any` laissait passer
        // `m.team1?.name` sans que rien ne garantisse que l'embed soit demandé
        // par la requête : le repli sur l'UUID brut se déclenchait alors
        // toujours, et le panneau affichait des identifiants au lieu des noms.
        const json = (await matchesRes.json()) as {
          matches?: AdminMatchRow[];
        };
        const allMatches: MatchOption[] = (json.matches || [])
          .filter(
            (m) =>
              m.team1_id &&
              m.team2_id &&
              (m.status === 'pending' || m.status === 'ongoing')
          )
          .map((m) => ({
            id: m.id,
            round_name: m.round_name,
            round_number: m.round_number,
            match_format: m.match_format,
            team1_id: m.team1_id,
            team2_id: m.team2_id,
            team1_name: m.team1?.name || m.team1_id,
            team2_name: m.team2?.name || m.team2_id,
            status: m.status,
          }));
        setMatches(allMatches);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, adminFetch, t]);

  const fetchVetoState = useCallback(
    async (matchId: string) => {
      try {
        const res = await adminFetch(`/api/admin/matches/${matchId}/veto`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || t.errorLoadVeto);
        }
        const state = await res.json();
        setVetoState(state as MatchVetoState);
        setErrorMsg(null);
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || t.error);
        setVetoState(null);
      }
    },
    [adminFetch, t]
  );

  useEffect(() => {
    if (!tournamentId) return;
    fetchData();
  }, [tournamentId, fetchData]);

  useEffect(() => {
    if (selectedMatchId) {
      fetchVetoState(selectedMatchId);
    } else {
      setVetoState(null);
    }
  }, [selectedMatchId, fetchVetoState]);

  const handleSelectMap = useCallback(
    async (mapName: string, mapType: string | null) => {
      if (!vetoState || !selectedMatchId || vetoState.isComplete) return;
      if (vetoState.vetoLockedAt) {
        addToast(t.toastVetoLockedModify, 'error');
        return;
      }

      setSubmitting(true);
      setErrorMsg(null);

      const currentFlowStep = vetoState.flow[vetoState.currentStepIndex];
      if (!currentFlowStep) {
        setSubmitting(false);
        return;
      }

      // Resolve team_id from side
      let teamId: string | null = null;
      if (currentFlowStep.side === 'team1') {
        teamId = vetoState.team1Id;
      } else if (currentFlowStep.side === 'team2') {
        teamId = vetoState.team2Id;
      }

      try {
        const res = await adminFetch(
          `/api/admin/matches/${selectedMatchId}/veto`,
          {
            method: 'POST',
            body: JSON.stringify({
              action: currentFlowStep.action,
              team_id: teamId,
              map_name: mapName,
              map_type: mapType,
            }),
          }
        );

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          // 409 VETO_LOCKED : le match a démarré pendant qu'on cliquait. On
          // refresh pour afficher le badge "verrouillé" et désactiver l'UI.
          if (res.status === 409 && json.code === 'VETO_LOCKED') {
            await fetchVetoState(selectedMatchId);
            addToast(json.error || t.errorVetoLockedStarted, 'error');
            return;
          }
          throw new Error(json.error || t.errorVetoAction);
        }

        const result = await res.json();

        if (result.isComplete) {
          addToast(
            result.gamesCreated
              ? t.toastVetoCompleteGames
              : t.toastVetoComplete,
            'success'
          );
        }

        // Refresh veto state
        await fetchVetoState(selectedMatchId);
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || t.error);
      } finally {
        setSubmitting(false);
      }
    },
    [vetoState, selectedMatchId, addToast, adminFetch, t, fetchVetoState]
  );

  const handleReset = useCallback(async () => {
    if (!selectedMatchId) return;

    const ok = await confirm({
      title: t.confirmResetTitle,
      subtitle: t.confirmResetSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmResetLabel,
    });
    if (!ok) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await adminFetch(
        `/api/admin/matches/${selectedMatchId}/veto`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 409 && json.code === 'VETO_LOCKED') {
          await fetchVetoState(selectedMatchId);
          addToast(json.error || t.errorVetoLockedStarted, 'error');
          return;
        }
        throw new Error(json.error || t.error);
      }

      await fetchVetoState(selectedMatchId);
      addToast(t.toastVetoReset, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.error);
    } finally {
      setSubmitting(false);
    }
  }, [selectedMatchId, addToast, confirm, adminFetch, t, fetchVetoState]);

  const handleUnlock = useCallback(async () => {
    if (!selectedMatchId || !canUnlockVeto) return;

    const ok = await confirm({
      title: t.confirmUnlockTitle,
      subtitle: t.confirmUnlockSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmUnlockLabel,
    });
    if (!ok) return;

    const reason = window.prompt(t.unlockReasonPrompt, '')?.trim();

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch(
        `/api/admin/matches/${selectedMatchId}/veto`,
        {
          method: 'PATCH',
          body: JSON.stringify({ unlock: true, reason: reason || undefined }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorUnlock);
      }
      await fetchVetoState(selectedMatchId);
      addToast(t.toastVetoUnlocked, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.error);
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedMatchId,
    addToast,
    confirm,
    canUnlockVeto,
    adminFetch,
    t,
    fetchVetoState,
  ]);

  // Compute used maps in current veto
  const usedMapNames = new Set((vetoState?.steps || []).map((s) => s.map_name));

  // Current step info
  const currentFlowStep: VetoFlowStep | null =
    vetoState && !vetoState.isComplete
      ? (vetoState.flow[vetoState.currentStepIndex] ?? null)
      : null;

  const isLocked = !!vetoState?.vetoLockedAt;
  const lockedLabel = vetoState?.vetoLockedAt
    ? new Date(vetoState.vetoLockedAt).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      {confirmDialog}
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className={R.rubanEyebrowSnug}>{t.eyebrow}</p>
          <h1 className="text-2xl font-semibold">
            {format(t.pageTitle, { name: tournamentName })}
          </h1>
        </div>
        <div className="flex gap-2">
          <AdminButtonLink
            href={`/admin/tournament/${tournamentId}/bracket?tab=map-draw`}
            size="sm"
          >
            {t.linkMapDraw}
          </AdminButtonLink>
          <AdminButtonLink
            href={`/admin/tournament/${tournamentId}/maps`}
            size="sm"
          >
            {t.linkMapPool}
          </AdminButtonLink>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && <div className={`mb-4 ${R.rubanErrBox}`}>{errorMsg}</div>}
      {loading && (
        <div className={`${R.rubanCardPadded} ${R.rubanMuted}`}>
          {t.loading}
        </div>
      )}

      {!loading && (
        <>
          {/* Match selector */}
          <div className={`mb-6 space-y-4 ${R.rubanCardPadded}`}>
            <div className="flex items-center gap-4">
              <label className={`whitespace-nowrap ${R.rubanEyebrowSnug}`}>
                {t.matchLabel}
              </label>
              <select
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className={`max-w-lg flex-1 ${R.rubanFormInput}`}
              >
                <option value="">{t.selectMatchPlaceholder}</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.team1_name} vs {m.team2_name}
                    {m.round_name ? ` (${m.round_name})` : ''}
                    {m.match_format ? ` · ${m.match_format.toUpperCase()}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {matches.length === 0 && (
              <p className={`text-sm ${R.rubanMuted}`}>{t.noEligibleMatch}</p>
            )}
          </div>

          {/* Veto flow */}
          {vetoState && (
            <>
              {/* Lock banner : visible des qu'un match a passe ongoing */}
              {isLocked && (
                <div className={`mb-6 !p-5 ${R.rubanWarnBox}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-2xl leading-none">🔒</span>
                      <div className="min-w-0">
                        <p className="text-base font-semibold">
                          {t.lockedTitle}
                        </p>
                        <p className="mt-0.5 text-sm opacity-80">
                          {t.lockedDesc}
                          {lockedLabel
                            ? format(t.lockedAtSuffix, {
                                date: lockedLabel,
                              })
                            : ''}
                        </p>
                      </div>
                    </div>
                    {canUnlockVeto && (
                      <AdminButton
                        size="sm"
                        onClick={handleUnlock}
                        disabled={submitting}
                        title={t.unlockButtonTitle}
                      >
                        {t.unlockButton}
                      </AdminButton>
                    )}
                  </div>
                </div>
              )}

              {/* Current step indicator */}
              {currentFlowStep && !vetoState.isComplete && (
                <div className={`mb-6 ${R.rubanCardPadded}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`mb-1 text-xs ${R.rubanMuted}`}>
                        {format(t.stepProgress, {
                          current: vetoState.currentStepIndex + 1,
                          total: vetoState.flow.length,
                        })}
                      </p>
                      <p className="text-lg font-semibold">
                        <span
                          className={`mr-2 inline-block rounded-[3px] border px-3 py-1 font-[family-name:var(--fd)] text-sm font-bold tracking-[0.1em] ${actionColor(currentFlowStep.action)}`}
                        >
                          {actionLabel(currentFlowStep.action)}
                        </span>
                        {sideLabel(
                          t,
                          currentFlowStep.side,
                          vetoState.team1Name,
                          vetoState.team2Name
                        )}
                      </p>
                      <p className={`mt-1 text-xs ${R.rubanMuted}`}>
                        {t.clickMapPrefix}
                        {currentFlowStep.action === 'ban'
                          ? t.actionBan
                          : currentFlowStep.action === 'pick'
                            ? t.actionPick
                            : t.actionDecider}
                      </p>
                    </div>
                    <AdminButton
                      variant="danger"
                      size="sm"
                      onClick={handleReset}
                      disabled={submitting || isLocked}
                      title={isLocked ? t.lockedShort : undefined}
                    >
                      {t.resetButton}
                    </AdminButton>
                  </div>
                </div>
              )}

              {vetoState.isComplete && (
                <div className={`mb-6 !p-5 ${R.rubanOkBox}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold">{t.completeTitle}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {format(t.completeSummary, {
                          count: vetoState.pickedMaps.length,
                          format: vetoState.format.toUpperCase(),
                        })}
                      </p>
                    </div>
                    <AdminButton
                      variant="danger"
                      size="sm"
                      onClick={handleReset}
                      disabled={submitting || isLocked}
                      title={isLocked ? t.lockedShort : undefined}
                    >
                      {t.restartButton}
                    </AdminButton>
                  </div>
                </div>
              )}

              {/* Veto timeline */}
              {vetoState.steps.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-3">
                    {t.historyTitle}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {vetoState.steps.map((step: VetoStep, i: number) => {
                      return (
                        <div
                          key={step.id}
                          className={`rounded-[var(--r-ctrl,4px)] border px-3 py-2 text-sm ${actionColor(step.action)}`}
                        >
                          <span className="font-bold mr-1">{i + 1}.</span>
                          <span className="font-semibold mr-1">
                            {actionLabel(step.action)}
                          </span>
                          <span className="opacity-80">{step.map_name}</span>
                          {step.team_id && (
                            <span className="ml-1 text-xs opacity-60">
                              (
                              {step.team_id === vetoState.team1Id
                                ? vetoState.team1Name || t.teamShort1
                                : vetoState.team2Name || t.teamShort2}
                              )
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Picked maps summary */}
              {vetoState.pickedMaps.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-3">
                    {t.mapsToPlayTitle}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {vetoState.pickedMaps.map((pm, i) => {
                      const mapData = poolMaps.find(
                        (m) => m.map_name === pm.map_name
                      );
                      return (
                        <div key={i} className={R.rubanCardFlush}>
                          <div className="border-b border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-3 py-2 text-center">
                            <span className={R.rubanEyebrowSnug}>
                              {format(t.mapSlot, { n: i + 1 })}
                            </span>
                          </div>
                          {mapData?.image_url ? (
                            <div className="h-28 w-full bg-[var(--s2,#1d1520)]">
                              {/* biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */}
                              <img
                                src={mapData.image_url}
                                alt={pm.map_name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-28 w-full items-center justify-center bg-[var(--s2,#1d1520)] text-2xl text-[var(--t4,#807984)]">
                              ?
                            </div>
                          )}
                          <div className="p-3 text-center">
                            <p className="text-sm font-semibold">
                              {pm.map_name}
                            </p>
                            {pm.map_type && (
                              <span className="mt-1 inline-block">
                                <Chip>{typeLabel(t, pm.map_type)}</Chip>
                              </span>
                            )}
                            <p className={`mt-1 text-[10px] ${R.rubanMuted}`}>
                              {pm.picked_by
                                ? pm.picked_by === vetoState.team1Id
                                  ? format(t.pickBy, {
                                      team: vetoState.team1Name || t.teamShort1,
                                    })
                                  : format(t.pickBy, {
                                      team: vetoState.team2Name || t.teamShort2,
                                    })
                                : t.decider}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available maps grid */}
              {!vetoState.isComplete && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">
                    {format(t.availableMapsTitle, {
                      count: poolMaps.length - usedMapNames.size,
                    })}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {[...poolMaps]
                      .sort(
                        (a, b) =>
                          (a.order_index ?? 0) - (b.order_index ?? 0) ||
                          a.map_name.localeCompare(b.map_name)
                      )
                      .map((m) => {
                        const isUsed = usedMapNames.has(m.map_name);
                        return (
                          <button
                            key={m.id}
                            onClick={() =>
                              !isUsed &&
                              !submitting &&
                              !isLocked &&
                              handleSelectMap(m.map_name, m.map_type)
                            }
                            disabled={isUsed || submitting || isLocked}
                            title={
                              isLocked
                                ? t.lockedShort
                                : isUsed
                                  ? t.mapUsedTitle
                                  : undefined
                            }
                            data-case="normal"
                            className={`overflow-hidden rounded-[var(--r-ctrl,4px)] border bg-[var(--s1,#100812)] text-left transition-all ${
                              isUsed || isLocked
                                ? 'cursor-not-allowed border-[var(--line,rgba(194,196,201,.12))] opacity-30'
                                : 'cursor-pointer border-[var(--line2,rgba(194,196,201,.2))] hover:border-[var(--or,#b467d1)]'
                            }`}
                          >
                            {m.image_url ? (
                              <div className="h-24 w-full bg-[var(--s2,#1d1520)]">
                                {/* biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */}
                                <img
                                  src={m.image_url}
                                  alt={m.map_name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-24 w-full items-center justify-center bg-[var(--s2,#1d1520)] text-xl text-[var(--t4,#807984)]">
                                ?
                              </div>
                            )}
                            <div className="p-2">
                              <p className="text-xs font-semibold truncate">
                                {m.map_name}
                              </p>
                              <span className="mt-0.5 inline-block">
                                <Chip>{typeLabel(t, m.map_type)}</Chip>
                              </span>
                              {isUsed && (
                                <p className="mt-0.5 text-[10px] text-[var(--err,#ff6b6b)]">
                                  {t.mapUsed}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
