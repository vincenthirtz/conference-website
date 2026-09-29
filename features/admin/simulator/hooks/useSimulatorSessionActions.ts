// features/admin/simulator/hooks/useSimulatorSessionActions.ts — actions de
// session du simulateur : import de configuration, copie / impression des
// résultats, édition des équipes (seeding, force), Monte Carlo, historique et
// création d'un vrai tournoi à partir de la simulation.
//
// Callbacks DÉPLACÉS À L'IDENTIQUE depuis pages/admin/tournament-simulator.tsx
// (mêmes corps, mêmes dépendances, mêmes payloads et ordre d'étapes) : seuls
// les accès à l'état de la page deviennent des paramètres. La page reste
// propriétaire de tous les useState et de `historyIdRef`.

import { useCallback, type RefObject } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import {
  bracketSeedOrder,
  runMonteCarlo,
  computeCompetitiveness,
} from '@/utils/simulator';
import type { SimTeam, SimStage, MonteCarloResult } from '@/utils/simulator';
import {
  type SimConfig,
  type OccurrenceData,
  importConfigFromFile,
  generateResultsSummary,
} from '@/utils/simulatorSerialization';
import type { SimHistoryEntry } from '@/components/admin/simulator/SimulatorHistoryTab';
import type {
  AddToast,
  Setter,
  SimMutate,
  SimulatorDict,
} from './simulatorHookTypes';

const MAX_HISTORY = 20;

export type SimulatorSessionActionsDeps = {
  tx: SimulatorDict;
  addToast: AddToast;
  simMutate: SimMutate;
  config: SimConfig;
  setConfig: Setter<SimConfig>;
  stages: SimStage[];
  teams: SimTeam[];
  generated: boolean;
  setGenerated: Setter<boolean>;
  activeOccurrence: number;
  setOccurrences: Setter<OccurrenceData[]>;
  setImportError: Setter<string | null>;
  monteCarloIterations: number;
  setMonteCarloRunning: Setter<boolean>;
  setMonteCarloResult: Setter<MonteCarloResult | null>;
  historyIdRef: RefObject<number>;
  setSimHistory: Setter<SimHistoryEntry[]>;
  setCreatingTournament: Setter<boolean>;
  setCreateTournamentError: Setter<string | null>;
  setCreateTournamentResult: Setter<{ id: string; name: string } | null>;
};

export function useSimulatorSessionActions(deps: SimulatorSessionActionsDeps) {
  const {
    tx,
    addToast,
    simMutate,
    config,
    setConfig,
    stages,
    teams,
    generated,
    setGenerated,
    activeOccurrence,
    setOccurrences,
    setImportError,
    monteCarloIterations,
    setMonteCarloRunning,
    setMonteCarloResult,
    historyIdRef,
    setSimHistory,
    setCreatingTournament,
    setCreateTournamentError,
    setCreateTournamentResult,
  } = deps;

  /** Import config from file */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleImportConfig = useCallback(
    async (file: File) => {
      try {
        setImportError(null);
        const imported = await importConfigFromFile(file);
        setConfig(imported);
        setGenerated(false);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : tx.errorUnknown);
      }
    },
    [tx]
  );

  /** Copy results summary to clipboard */
  const handleCopyResults = useCallback(async () => {
    const text = generateResultsSummary(stages, teams, config);
    try {
      await navigator.clipboard.writeText(text);
      addToast(tx.copied, 'success');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      addToast(tx.copied, 'success');
    }
  }, [stages, teams, config, addToast, tx]);

  /** Print bracket/results as PDF */
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  /** Reorder teams via drag & drop — swaps seeds and regenerates bracket */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleReorderTeams = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      setOccurrences((prev) =>
        prev.map((occ, occIdx) => {
          if (occIdx !== activeOccurrence) return occ;
          const newTeams = [...occ.teams];
          // Swap
          const temp = newTeams[fromIdx];
          newTeams[fromIdx] = newTeams[toIdx];
          newTeams[toIdx] = temp;
          // Re-assign seeds based on position
          const reseeded = newTeams.map((t, i) => ({ ...t, seed: i + 1 }));
          // Re-assign teams in first-round bracket matches
          const newStages = occ.stages.map((stage) => {
            if (
              stage.stage_type !== 'bracket' &&
              stage.stage_type !== 'showmatch'
            ) {
              // For non-bracket stages, just update team references
              const matches = stage.matches.map((m) => {
                const t1 = reseeded.find((t) => t.id === m.team1_id);
                const t2 = reseeded.find((t) => t.id === m.team2_id);
                return { ...m, team1: t1 ?? m.team1, team2: t2 ?? m.team2 };
              });
              return { ...stage, matches };
            }
            // For brackets, re-seed the first round
            const seedOrder = bracketSeedOrder(reseeded.length);
            let firstRoundIdx = 0;
            const matches = stage.matches.map((m) => {
              // First round matches have teams assigned
              if (m.round_number === 1 && m.bracket_side === 'wb') {
                const t1 = reseeded[seedOrder[firstRoundIdx * 2]] ?? null;
                const t2 = reseeded[seedOrder[firstRoundIdx * 2 + 1]] ?? null;
                firstRoundIdx++;
                return {
                  ...m,
                  team1: t1,
                  team1_id: t1?.id ?? null,
                  team2: t2,
                  team2_id: t2?.id ?? null,
                  // Reset results since seeding changed
                  status: 'pending' as MatchStatus,
                  team1_score: null,
                  team2_score: null,
                  winner_team_id: null,
                  locked: false,
                };
              }
              // Later rounds: clear propagated teams
              if (
                m.bracket_side === 'wb' ||
                m.bracket_side === 'lb' ||
                m.bracket_side === 'final'
              ) {
                return {
                  ...m,
                  team1: null,
                  team1_id: null,
                  team2: null,
                  team2_id: null,
                  status: 'pending' as MatchStatus,
                  team1_score: null,
                  team2_score: null,
                  winner_team_id: null,
                  locked: false,
                };
              }
              return m;
            });
            return { ...stage, matches };
          });
          return { ...occ, teams: reseeded, stages: newStages };
        })
      );
    },
    [activeOccurrence]
  );

  /** Update a team's strength rating */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleUpdateTeamStrength = useCallback(
    (teamId: string, strength: number) => {
      setOccurrences((prev) =>
        prev.map((occ, occIdx) => {
          if (occIdx !== activeOccurrence) return occ;
          const newTeams = occ.teams.map((t) =>
            t.id === teamId ? { ...t, strength } : t
          );
          // Also update team references inside matches
          const newStages = occ.stages.map((stage) => ({
            ...stage,
            matches: stage.matches.map((m) => ({
              ...m,
              team1:
                m.team1?.id === teamId ? { ...m.team1, strength } : m.team1,
              team2:
                m.team2?.id === teamId ? { ...m.team2, strength } : m.team2,
            })),
          }));
          return { ...occ, teams: newTeams, stages: newStages };
        })
      );
    },
    [activeOccurrence]
  );

  /** Run Monte Carlo simulation */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleMonteCarlo = useCallback(() => {
    if (!generated || teams.length === 0) return;
    setMonteCarloRunning(true);
    // Use setTimeout to let the UI update before the heavy computation
    setTimeout(() => {
      const result = runMonteCarlo(stages, teams, monteCarloIterations);
      setMonteCarloResult(result);
      setMonteCarloRunning(false);
    }, 50);
  }, [generated, stages, teams, monteCarloIterations]);

  /** Save current simulation to history */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setter et ref stables reçus en paramètre)
  const saveToHistory = useCallback(() => {
    const allMatches = stages.flatMap((s) => s.matches);
    const finished = allMatches.filter((m) => m.status === 'finished');
    if (finished.length === 0) return;

    const wins = new Map<string, number>();
    const losses = new Map<string, number>();
    for (const m of finished) {
      if (!m.winner_team_id) continue;
      wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
      const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
      if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }

    const standings = teams
      .map((t) => ({
        name: t.name,
        seed: t.seed,
        wins: wins.get(t.id) ?? 0,
        losses: losses.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

    const competitiveness = computeCompetitiveness(allMatches, teams);

    const entry: SimHistoryEntry = {
      id: ++historyIdRef.current,
      timestamp: Date.now(),
      formatType: config.formatType,
      teamCount: teams.length,
      bestOf: config.bestOf,
      standings,
      competitiveness,
    };

    setSimHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  }, [stages, teams, config]);

  /** Create a real tournament from the current simulation */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleCreateTournament = useCallback(async () => {
    if (!generated || teams.length === 0) return;
    setCreatingTournament(true);
    setCreateTournamentError(null);
    setCreateTournamentResult(null);

    try {
      const tournamentName = format(tx.simTournamentName, {
        date: new Date().toLocaleDateString('fr-FR'),
      });

      // Step 1: Create tournament
      const tRes = await simMutate('/api/admin/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name: tournamentName,
          format_type: config.formatType,
          max_teams: teams.length,
          min_players: config.playersPerTeam,
          max_players: config.playersPerTeam,
          status: 'draft',
          start_date: config.schedule.startDate || null,
          is_public: false,
        }),
      });
      if (!tRes.ok) {
        const errData = await tRes.json().catch(() => ({}));
        throw new Error(
          errData.error ??
            format(tx.errorCreateTournament, { status: tRes.status })
        );
      }
      const tournament = await tRes.json();
      const tournamentId = tournament.id;

      // Step 2: Register teams (only real teams with valid UUIDs)
      const realTeamIds = teams.filter((t) => !t.id.startsWith('sim-'));
      for (const t of realTeamIds) {
        await simMutate(`/api/admin/tournament/${tournamentId}/teams`, {
          method: 'POST',
          body: JSON.stringify({ team_id: t.id, seed: t.seed }),
        });
      }

      // Step 3: Create stages
      for (let sIdx = 0; sIdx < stages.length; sIdx++) {
        const simStage = stages[sIdx];
        const stageRes = await simMutate(
          `/api/admin/tournament/${tournamentId}/stages`,
          {
            method: 'POST',
            body: JSON.stringify({
              name: simStage.name,
              stage_type: simStage.stage_type,
              order_index: sIdx,
              is_active: sIdx === 0,
              is_public: false,
            }),
          }
        );
        if (!stageRes.ok) continue;
        const createdStage = await stageRes.json();
        const stageId = createdStage.id;

        // Step 4: Create matches for this stage (only use real team IDs)
        const matchPayloads = simStage.matches.map((m) => ({
          stage_id: stageId,
          status: 'pending',
          match_format: m.match_format,
          best_of: m.best_of,
          round_name: m.round_name,
          round_number: m.round_number,
          bracket_side: m.bracket_side === 'none' ? null : m.bracket_side,
          scheduled_at: m.scheduled_at,
          // Only set team IDs if they are real (not sim- prefixed)
          team1_id:
            m.team1_id && !m.team1_id.startsWith('sim-') ? m.team1_id : null,
          team2_id:
            m.team2_id && !m.team2_id.startsWith('sim-') ? m.team2_id : null,
        }));

        if (matchPayloads.length > 0) {
          await simMutate(`/api/admin/tournament/${tournamentId}/matches`, {
            method: 'POST',
            body: JSON.stringify({ matches: matchPayloads }),
          });
        }
      }

      setCreateTournamentResult({ id: tournamentId, name: tournamentName });
    } catch (err) {
      setCreateTournamentError(
        err instanceof Error ? err.message : tx.errorUnknown
      );
    } finally {
      setCreatingTournament(false);
    }
  }, [generated, teams, stages, config, simMutate, tx]);

  return {
    handleImportConfig,
    handleCopyResults,
    handlePrint,
    handleReorderTeams,
    handleUpdateTeamStrength,
    handleMonteCarlo,
    saveToHistory,
    handleCreateTournament,
  };
}
