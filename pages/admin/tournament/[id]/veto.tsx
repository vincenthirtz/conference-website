// pages/admin/tournament/[id]/veto.tsx
// Interactive map pick/ban (veto) flow for a match

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import type { VetoFlowStep, VetoStep, MatchVetoState } from '@/types/veto';

type StaffShape = { id: string; role: string; display_name: string | null };
type StaffProps = { staff: StaffShape };

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

const TYPE_LABEL: Record<string, string> = {
  control: 'Contrôle',
  hybrid: 'Hybride',
  escort: 'Convoi',
  push: 'Push',
  flashpoint: 'Flashpoint',
};

function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return TYPE_LABEL[t] || t;
}

function typeBadgeColor(t: string | null | undefined): string {
  switch (t) {
    case 'control': return 'border-blue-400/50 text-blue-200 bg-blue-600/20';
    case 'escort': return 'border-amber-400/50 text-amber-200 bg-amber-600/20';
    case 'hybrid': return 'border-emerald-400/50 text-emerald-200 bg-emerald-600/20';
    case 'push': return 'border-pink-400/50 text-pink-200 bg-pink-600/20';
    case 'flashpoint': return 'border-orange-400/50 text-orange-200 bg-orange-600/20';
    default: return 'border-gray-400/50 text-gray-200 bg-gray-600/20';
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case 'ban': return 'BAN';
    case 'pick': return 'PICK';
    case 'decider': return 'DECIDER';
    default: return action.toUpperCase();
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'ban': return 'bg-red-600/30 border-red-500/40 text-red-200';
    case 'pick': return 'bg-emerald-600/30 border-emerald-500/40 text-emerald-200';
    case 'decider': return 'bg-yellow-600/30 border-yellow-500/40 text-yellow-200';
    default: return 'bg-white/10 border-white/20 text-gray-200';
  }
}

function sideLabel(
  side: string | null,
  team1Name: string | null,
  team2Name: string | null
): string {
  if (side === 'team1') return team1Name || 'Équipe 1';
  if (side === 'team2') return team2Name || 'Équipe 2';
  return 'Restante';
}

export const getServerSideProps = withStaffPage('manager');

function AdminVetoPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournamentName, setTournamentName] = useState<string>('Tournoi');

  // Match selection
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');

  // Veto state
  const [vetoState, setVetoState] = useState<MatchVetoState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  useEffect(() => {
    if (selectedMatchId) {
      fetchVetoState(selectedMatchId);
    } else {
      setVetoState(null);
    }
     
  }, [selectedMatchId]);

  async function fetchData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Fetch maps
      const mapsRes = await fetch(`/api/tournament/${tournamentId}/maps`);
      if (mapsRes.ok) {
        const json = await mapsRes.json();
        setMaps((json.maps || []).filter((m: TournamentMapRow) => m.enabled));
        setTournamentName(json.tournament?.name || 'Tournoi');
      }

      // Fetch matches (pending or ongoing, with both teams assigned)
      const matchesRes = await fetch(
        `/api/admin/tournament/${tournamentId}/matches?limit=100`
      );
      if (matchesRes.ok) {
        const json = await matchesRes.json();
        const allMatches = (json.matches || [])
          .filter(
            (m: any) =>
              m.team1_id &&
              m.team2_id &&
              (m.status === 'pending' || m.status === 'ongoing')
          )
          .map((m: any) => ({
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
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  async function fetchVetoState(matchId: string) {
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/veto`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger le veto');
      }
      const state = await res.json();
      setVetoState(state as MatchVetoState);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur');
      setVetoState(null);
    }
  }

  const handleSelectMap = useCallback(
    async (mapName: string, mapType: string | null) => {
      if (!vetoState || !selectedMatchId || vetoState.isComplete) return;

      setSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

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
        const res = await fetch(`/api/admin/matches/${selectedMatchId}/veto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: currentFlowStep.action,
            team_id: teamId,
            map_name: mapName,
            map_type: mapType,
          }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Erreur lors du veto');
        }

        const result = await res.json();

        if (result.isComplete) {
          setSuccessMsg(
            result.gamesCreated
              ? 'Veto terminé ! Les games ont été créées automatiquement.'
              : 'Veto terminé !'
          );
        }

        // Refresh veto state
        await fetchVetoState(selectedMatchId);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Erreur');
      } finally {
        setSubmitting(false);
      }
    },
    [vetoState, selectedMatchId]
  );

  const handleReset = useCallback(async () => {
    if (!selectedMatchId) return;

    if (!window.confirm('Réinitialiser tous les vetos de ce match ?')) return;

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/matches/${selectedMatchId}/veto`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur');
      }

      await fetchVetoState(selectedMatchId);
      setSuccessMsg('Veto réinitialisé.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }, [selectedMatchId]);

  // Compute used maps in current veto
  const usedMapNames = new Set(
    (vetoState?.steps || []).map((s) => s.map_name)
  );

  // Current step info
  const currentFlowStep: VetoFlowStep | null =
    vetoState && !vetoState.isComplete
      ? vetoState.flow[vetoState.currentStepIndex] ?? null
      : null;

  return (
    <>
      <Head>
        <title>Admin · Veto de maps</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Veto de maps
              </p>
              <h1 className="text-2xl font-semibold">
                {tournamentName} · Pick / Ban
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/map-draw`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Tirage aléatoire
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/maps`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Pool de maps
              </Link>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-4 p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 p-4 rounded-lg bg-emerald-900/60 border border-emerald-500/40 text-emerald-100">
              {successMsg}
            </div>
          )}

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Chargement…
            </div>
          )}

          {!loading && (
            <>
              {/* Match selector */}
              <div className="mb-6 p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-300 font-medium whitespace-nowrap">
                    Match :
                  </label>
                  <select
                    value={selectedMatchId}
                    onChange={(e) => setSelectedMatchId(e.target.value)}
                    className="flex-1 max-w-lg px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                  >
                    <option value="">— Sélectionner un match —</option>
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
                  <p className="text-sm text-gray-400">
                    Aucun match éligible (il faut des matchs pending/ongoing avec
                    les deux équipes assignées).
                  </p>
                )}
              </div>

              {/* Veto flow */}
              {vetoState && (
                <>
                  {/* Current step indicator */}
                  {currentFlowStep && !vetoState.isComplete && (
                    <div className="mb-6 p-5 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">
                            Étape {vetoState.currentStepIndex + 1} /{' '}
                            {vetoState.flow.length}
                          </p>
                          <p className="text-lg font-semibold">
                            <span
                              className={`inline-block px-3 py-1 rounded-lg text-sm font-bold mr-2 border ${actionColor(currentFlowStep.action)}`}
                            >
                              {actionLabel(currentFlowStep.action)}
                            </span>
                            {sideLabel(
                              currentFlowStep.side,
                              vetoState.team1Name,
                              vetoState.team2Name
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Cliquez sur une map ci-dessous pour{' '}
                            {currentFlowStep.action === 'ban'
                              ? 'la bannir'
                              : currentFlowStep.action === 'pick'
                                ? 'la sélectionner'
                                : 'choisir le decider'}
                          </p>
                        </div>
                        <button
                          onClick={handleReset}
                          disabled={submitting}
                          className="px-3 py-1.5 rounded-lg bg-red-600/30 border border-red-500/40 text-red-200 text-sm hover:bg-red-600/50 disabled:opacity-50"
                        >
                          Réinitialiser
                        </button>
                      </div>
                    </div>
                  )}

                  {vetoState.isComplete && (
                    <div className="mb-6 p-5 rounded-xl bg-emerald-900/30 border border-emerald-500/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-semibold text-emerald-200">
                            Veto terminé
                          </p>
                          <p className="text-xs text-emerald-300/70 mt-1">
                            {vetoState.pickedMaps.length} maps sélectionnées
                            pour le {vetoState.format.toUpperCase()}
                          </p>
                        </div>
                        <button
                          onClick={handleReset}
                          disabled={submitting}
                          className="px-3 py-1.5 rounded-lg bg-red-600/30 border border-red-500/40 text-red-200 text-sm hover:bg-red-600/50 disabled:opacity-50"
                        >
                          Recommencer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Veto timeline */}
                  {vetoState.steps.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold mb-3">
                        Historique du veto
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {vetoState.steps.map((step: VetoStep, i: number) => {
                          const flowStep = vetoState.flow[i];
                          return (
                            <div
                              key={step.id}
                              className={`px-3 py-2 rounded-lg border text-sm ${actionColor(step.action)}`}
                            >
                              <span className="font-bold mr-1">
                                {i + 1}.
                              </span>
                              <span className="font-semibold mr-1">
                                {actionLabel(step.action)}
                              </span>
                              <span className="opacity-80">
                                {step.map_name}
                              </span>
                              {step.team_id && (
                                <span className="ml-1 text-xs opacity-60">
                                  (
                                  {step.team_id === vetoState.team1Id
                                    ? vetoState.team1Name || 'Éq. 1'
                                    : vetoState.team2Name || 'Éq. 2'}
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
                        Maps à jouer
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {vetoState.pickedMaps.map((pm, i) => {
                          const mapData = maps.find(
                            (m) => m.map_name === pm.map_name
                          );
                          return (
                            <div
                              key={i}
                              className="rounded-xl border border-emerald-500/30 overflow-hidden bg-emerald-900/10"
                            >
                              <div className="bg-emerald-600/30 border-b border-emerald-500/30 px-3 py-2 text-center">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                                  Map {i + 1}
                                </span>
                              </div>
                              {mapData?.image_url ? (
                                <div className="w-full h-28 bg-gradient-to-b from-emerald-900/20 to-transparent">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={mapData.image_url}
                                    alt={pm.map_name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-full h-28 flex items-center justify-center bg-gradient-to-b from-emerald-900/10 to-transparent text-gray-500 text-2xl">
                                  ?
                                </div>
                              )}
                              <div className="p-3 text-center">
                                <p className="text-sm font-semibold">
                                  {pm.map_name}
                                </p>
                                {pm.map_type && (
                                  <span
                                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs border ${typeBadgeColor(pm.map_type)}`}
                                  >
                                    {typeLabel(pm.map_type)}
                                  </span>
                                )}
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {pm.picked_by
                                    ? pm.picked_by === vetoState.team1Id
                                      ? `Pick ${vetoState.team1Name || 'Éq. 1'}`
                                      : `Pick ${vetoState.team2Name || 'Éq. 2'}`
                                    : 'Decider'}
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
                        Maps disponibles ({maps.length - usedMapNames.size})
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {maps
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
                                  handleSelectMap(m.map_name, m.map_type)
                                }
                                disabled={isUsed || submitting}
                                className={`rounded-lg border overflow-hidden text-left transition-all ${
                                  isUsed
                                    ? 'border-white/5 opacity-30 cursor-not-allowed'
                                    : 'border-white/10 hover:border-purple-400/60 hover:bg-white/5 cursor-pointer'
                                }`}
                              >
                                {m.image_url ? (
                                  <div className="w-full h-24 bg-gradient-to-b from-purple-900/20 to-transparent">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={m.image_url}
                                      alt={m.map_name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-full h-24 flex items-center justify-center bg-gradient-to-b from-purple-900/10 to-transparent text-gray-500 text-xl">
                                    ?
                                  </div>
                                )}
                                <div className="p-2">
                                  <p className="text-xs font-semibold truncate">
                                    {m.map_name}
                                  </p>
                                  <span
                                    className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] border ${typeBadgeColor(m.map_type)}`}
                                  >
                                    {typeLabel(m.map_type)}
                                  </span>
                                  {isUsed && (
                                    <p className="text-[10px] text-red-300 mt-0.5">
                                      Déjà utilisée
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
        </div>
      </div>
    </>
  );
}

export default AdminVetoPage;
