// pages/admin/tournament-simulator.tsx
// Simulateur visuel de tournoi avec données fictives pour tester les configurations

import { useState, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { MatchStatus, FormatType, StageType } from '@/types/admin';
import type { MatchForGraph } from '@/types/bracket';
import { buildBracketGraph } from '@/utils/bracket/buildGraph';
import { computeBracketLayout } from '@/utils/bracket/computePaths';
import {
  bracketSeedOrder,
  simulateMatch,
  propagateBracket,
  runMonteCarlo,
  computeCompetitiveness,
  computeHeadToHead,
} from '@/utils/simulator';
import type {
  SimTeam,
  SimMap,
  SimMatch,
  SimStage,
  ScheduleConfig,
  EscalationConfig,
  CompetitivenessMetrics,
  MonteCarloResult,
  H2HRecord,
} from '@/utils/simulator';
import {
  type OccurrenceConfig,
  FREQUENCY_LABELS,
  FREQUENCY_DAYS,
  formatMatchDate,
  FAKE_MAPS,
  generateTeams,
  resetFakeIdCounter,
} from '@/utils/simulatorFakeData';
import {
  generateSingleElim,
  generateDoubleElim,
  generateSwiss,
  generateRoundRobin,
} from '@/utils/simulatorBrackets';
import {
  type SimConfig,
  type OccurrenceData,
  FORMAT_LABELS,
  exportConfigAsJSON,
  importConfigFromFile,
  generateResultsSummary,
} from '@/utils/simulatorSerialization';
import { SEED_COLORS } from '@/components/admin/simulator/SimMatchCard';
import {
  EliminationView,
  groupByRound,
  type RoundGroup,
} from '@/components/admin/simulator/EliminationView';
import { SummaryCard } from '@/components/admin/simulator/SummaryCard';

export const getServerSideProps = withStaffPage('manager');

/* ------------------------------------------------------------------ */
/*  Simulation history                                                  */
/* ------------------------------------------------------------------ */

type SimHistoryEntry = {
  id: number;
  timestamp: number;
  formatType: FormatType;
  teamCount: number;
  bestOf: number;
  standings: { name: string; seed: number; wins: number; losses: number }[];
  competitiveness: CompetitivenessMetrics;
};

const MAX_HISTORY = 20;
function TournamentSimulatorPage() {
  const tx = useAdminT('adminTournamentSimulator');
  const { addToast } = useToast();
  const { mutate: simMutate } = useIdempotentMutation();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const animatingRef = useRef(false);
  const [dragSeedIdx, setDragSeedIdx] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareConfig, setCompareConfig] = useState<Partial<SimConfig> | null>(
    null
  );
  const [compareData, setCompareData] = useState<{
    stages: SimStage[];
    teams: SimTeam[];
  } | null>(null);
  const [monteCarloResult, setMonteCarloResult] =
    useState<MonteCarloResult | null>(null);
  const [monteCarloRunning, setMonteCarloRunning] = useState(false);
  const [monteCarloIterations, setMonteCarloIterations] = useState(500);
  const [simHistory, setSimHistory] = useState<SimHistoryEntry[]>([]);
  const historyIdRef = useRef(0);
  const [loadingRealTeams, setLoadingRealTeams] = useState(false);
  const [realTeamsError, setRealTeamsError] = useState<string | null>(null);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [createTournamentResult, setCreateTournamentResult] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [createTournamentError, setCreateTournamentError] = useState<
    string | null
  >(null);

  const [config, setConfig] = useState<SimConfig>({
    formatType: 'single_elim',
    teamCount: 8,
    playersPerTeam: 5,
    bestOf: 3,
    mapPoolSize: 7,
    swissRounds: 5,
    grandFinalReset: false,
    stageCount: 1,
    schedule: {
      startDate: '',
      matchDurationMin: 30,
      breakBetweenMatchesMin: 10,
      breakBetweenRoundsMin: 30,
      dayStartHour: 10,
      dayEndHour: 22,
      matchesPerDay: 0,
    },
    escalation: {
      enabled: false,
      earlyRoundsBo: 1,
      semiFinalsBo: 3,
      finalsBo: 5,
    },
    occurrence: {
      enabled: false,
      count: 4,
      frequency: 'weekly',
    },
  });

  const [occurrences, setOccurrences] = useState<OccurrenceData[]>([]);
  const [activeOccurrence, setActiveOccurrence] = useState(0);
  const [mapPool, setMapPool] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);

  // Undo / Redo
  const MAX_UNDO = 30;
  const [undoStack, setUndoStack] = useState<OccurrenceData[][]>([]);
  const [redoStack, setRedoStack] = useState<OccurrenceData[][]>([]);
  const [activeTab, setActiveTab] = useState<
    | 'bracket'
    | 'teams'
    | 'maps'
    | 'stats'
    | 'timeline'
    | 'compare'
    | 'monte-carlo'
    | 'history'
  >('bracket');
  const [configCollapsed, setConfigCollapsed] = useState(false);

  // Convenience accessors for current occurrence
  const stages = useMemo(
    () => occurrences[activeOccurrence]?.stages ?? [],
    [occurrences, activeOccurrence]
  );
  const teams = useMemo(
    () => occurrences[activeOccurrence]?.teams ?? [],
    [occurrences, activeOccurrence]
  );

  /** Push current occurrences to undo stack before mutating */
  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO - 1)), occurrences]);
    setRedoStack([]);
  }, [occurrences, MAX_UNDO]);

  const setStages = useCallback(
    (updater: (prev: SimStage[]) => SimStage[]) => {
      pushUndo();
      setOccurrences((prev) =>
        prev.map((occ, i) =>
          i === activeOccurrence ? { ...occ, stages: updater(occ.stages) } : occ
        )
      );
    },
    [activeOccurrence, pushUndo]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack((prev) => [...prev, occurrences]);
    const restored = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setOccurrences(restored);
  }, [undoStack, occurrences]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack((prev) => [...prev, occurrences]);
    const restored = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setOccurrences(restored);
  }, [redoStack, occurrences]);

  const validTeamCounts =
    config.formatType === 'single_elim' || config.formatType === 'double_elim'
      ? [4, 8, 16, 32]
      : [4, 6, 8, 10, 12, 16];

  const generateOneOccurrence = useCallback(
    (
      pool: string[],
      occSchedule: ScheduleConfig
    ): { stages: SimStage[]; teams: SimTeam[] } => {
      const newTeams = generateTeams(config.teamCount, config.playersPerTeam);
      const newStages: SimStage[] = [];

      if (config.stageCount >= 2 && config.formatType !== 'showmatch') {
        const groupStage = generateRoundRobin(
          newTeams,
          config.bestOf,
          pool,
          occSchedule
        );
        groupStage.name = tx.stageGroupName;
        groupStage.stage_type = 'group';
        newStages.push(groupStage);

        const topTeams = newTeams.slice(0, Math.min(newTeams.length, 8));
        const bracketStage = generateSingleElim(
          topTeams,
          config.bestOf,
          pool,
          occSchedule,
          config.escalation
        );
        bracketStage.name = tx.stageFinalName;
        newStages.push(bracketStage);
      } else {
        switch (config.formatType) {
          case 'single_elim':
            newStages.push(
              generateSingleElim(
                newTeams,
                config.bestOf,
                pool,
                occSchedule,
                config.escalation
              )
            );
            break;
          case 'double_elim':
            newStages.push(
              generateDoubleElim(
                newTeams,
                config.bestOf,
                pool,
                occSchedule,
                config.escalation,
                config.grandFinalReset
              )
            );
            break;
          case 'swiss':
            newStages.push(
              generateSwiss(
                newTeams,
                config.swissRounds,
                config.bestOf,
                pool,
                occSchedule
              )
            );
            break;
          case 'round_robin':
            newStages.push(
              generateRoundRobin(newTeams, config.bestOf, pool, occSchedule)
            );
            break;
          case 'showmatch': {
            const showmatch = generateSingleElim(
              newTeams.slice(0, 2),
              config.bestOf,
              pool,
              occSchedule,
              config.escalation
            );
            showmatch.name = tx.stageShowmatchName;
            showmatch.stage_type = 'showmatch';
            newStages.push(showmatch);
            break;
          }
        }
      }
      return { stages: newStages, teams: newTeams };
    },
    [config, tx]
  );

  const handleGenerate = useCallback(() => {
    resetFakeIdCounter();
    const pool = FAKE_MAPS.slice(0, config.mapPoolSize);

    const occCount = config.occurrence.enabled ? config.occurrence.count : 1;
    const newOccurrences: OccurrenceData[] = [];

    for (let i = 0; i < occCount; i++) {
      // Compute start date for this occurrence
      let occStartDate = config.schedule.startDate;
      if (occStartDate && i > 0) {
        const base = new Date(occStartDate);
        base.setDate(
          base.getDate() + i * FREQUENCY_DAYS[config.occurrence.frequency]
        );
        occStartDate = base.toISOString().slice(0, 16); // datetime-local format
      }

      const occSchedule: ScheduleConfig = {
        ...config.schedule,
        startDate: occStartDate,
      };
      const { stages: newStages, teams: newTeams } = generateOneOccurrence(
        pool,
        occSchedule
      );

      const label = config.occurrence.enabled
        ? `${format(tx.occurrenceLabel, { index: i + 1 })}${occStartDate ? ` — ${formatMatchDate(new Date(occStartDate).toISOString())}` : ''}`
        : tx.tournamentLabel;

      newOccurrences.push({
        index: i,
        label,
        startDate: occStartDate,
        stages: newStages,
        teams: newTeams,
      });
    }

    setMapPool(pool);
    setOccurrences(newOccurrences);
    setActiveOccurrence(0);
    setGenerated(true);
    setActiveTab('bracket');
  }, [config, generateOneOccurrence, tx]);

  const handleSimulateMatch = useCallback(
    (stageIdx: number, matchId: string) => {
      setStages((prev) => {
        const next = [...prev];
        const stage = {
          ...next[stageIdx],
          matches: [...next[stageIdx].matches],
        };
        const mIdx = stage.matches.findIndex((m) => m.id === matchId);
        if (mIdx === -1 || stage.matches[mIdx].locked) return prev;
        stage.matches[mIdx] = simulateMatch(stage.matches[mIdx]);
        if (stage.stage_type === 'bracket') {
          stage.matches = propagateBracket(stage.matches);
        }
        next[stageIdx] = stage;
        return next;
      });
    },
    [setStages]
  );

  const handleResetMatch = useCallback(
    (stageIdx: number, matchId: string) => {
      setStages((prev) => {
        const next = [...prev];
        const stage = {
          ...next[stageIdx],
          matches: [...next[stageIdx].matches],
        };
        const mIdx = stage.matches.findIndex((m) => m.id === matchId);
        if (mIdx === -1 || stage.matches[mIdx].locked) return prev;
        stage.matches[mIdx] = {
          ...stage.matches[mIdx],
          status: 'pending',
          team1_score: null,
          team2_score: null,
          winner_team_id: null,
        };
        next[stageIdx] = stage;
        return next;
      });
    },
    [setStages]
  );

  const handleSimulateAll = useCallback(() => {
    setStages((prev) =>
      prev.map((stage) => {
        let matches = [...stage.matches];
        if (stage.stage_type === 'bracket') {
          const roundNums = [
            ...new Set(matches.map((m) => m.round_number)),
          ].sort((a, b) => a - b);
          for (const rn of roundNums) {
            for (let i = 0; i < matches.length; i++) {
              if (
                matches[i].round_number === rn &&
                matches[i].status === 'pending' &&
                !matches[i].locked
              ) {
                matches[i] = simulateMatch(matches[i]);
              }
            }
            matches = propagateBracket(matches);
          }
        } else {
          matches = matches.map((m) =>
            m.status === 'pending' && !m.locked ? simulateMatch(m) : m
          );
        }
        return { ...stage, matches };
      })
    );
  }, [setStages]);

  /** Simulate only the next incomplete round across all stages (skips locked) */
  const handleSimulateNextRound = useCallback(() => {
    setStages((prev) =>
      prev.map((stage) => {
        let matches = [...stage.matches];
        const pendingRounds = [
          ...new Set(
            matches
              .filter(
                (m) => m.status === 'pending' && !m.locked && m.team1 && m.team2
              )
              .map((m) => m.round_number)
          ),
        ].sort((a, b) => a - b);
        if (pendingRounds.length === 0) return stage;
        const nextRound = pendingRounds[0];
        for (let i = 0; i < matches.length; i++) {
          if (
            matches[i].round_number === nextRound &&
            matches[i].status === 'pending' &&
            !matches[i].locked
          ) {
            matches[i] = simulateMatch(matches[i]);
          }
        }
        if (stage.stage_type === 'bracket') {
          matches = propagateBracket(matches);
        }
        return { ...stage, matches };
      })
    );
  }, [setStages]);

  const handleResetAll = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  /** Toggle lock on a match (What-if mode) */
  const handleToggleLock = useCallback(
    (stageIdx: number, matchId: string) => {
      setStages((prev) => {
        const next = [...prev];
        const stage = {
          ...next[stageIdx],
          matches: [...next[stageIdx].matches],
        };
        const mIdx = stage.matches.findIndex((m) => m.id === matchId);
        if (mIdx === -1) return prev;
        stage.matches[mIdx] = {
          ...stage.matches[mIdx],
          locked: !stage.matches[mIdx].locked,
        };
        next[stageIdx] = stage;
        return next;
      });
    },
    [setStages]
  );

  // --- Referentially stable props for EliminationView / SimMatchCard ---------
  // The match handlers above are re-created on every state change (their dep
  // chain reaches `occurrences` via setStages -> pushUndo). To keep the
  // memoized bracket cards from re-rendering on every interaction, we dispatch
  // through a ref: the per-stage handler objects below stay stable forever and
  // always call the latest handler.
  const matchActionsRef = useRef({
    simulate: handleSimulateMatch,
    reset: handleResetMatch,
    toggleLock: handleToggleLock,
  });
  matchActionsRef.current.simulate = handleSimulateMatch;
  matchActionsRef.current.reset = handleResetMatch;
  matchActionsRef.current.toggleLock = handleToggleLock;

  // Stable factory returning cached, per-stageIdx handler bundles. Empty deps:
  // the returned arrows only close over `stageIdx` and the (stable) ref.
  const getStageHandlers = useMemo(() => {
    const cache = new Map<
      number,
      {
        onSimulate: (id: string) => void;
        onReset: (id: string) => void;
        onToggleLock: (id: string) => void;
      }
    >();
    return (stageIdx: number) => {
      let entry = cache.get(stageIdx);
      if (!entry) {
        entry = {
          onSimulate: (id: string) =>
            matchActionsRef.current.simulate(stageIdx, id),
          onReset: (id: string) => matchActionsRef.current.reset(stageIdx, id),
          onToggleLock: (id: string) =>
            matchActionsRef.current.toggleLock(stageIdx, id),
        };
        cache.set(stageIdx, entry);
      }
      return entry;
    };
  }, []);

  // Stable no-op handlers for read-only bracket views (compare panel).
  const noopSimAction = useCallback((_id: string) => {}, []);

  // Memoized groupByRound: caches per (matches ref, side). Unchanged stages
  // keep the same `matches` reference across renders, so this returns the same
  // RoundGroup[] and lets memo(EliminationView) skip them.
  const groupByRoundMemo = useMemo(() => {
    const cache = new WeakMap<SimMatch[], Map<string, RoundGroup[]>>();
    return (matches: SimMatch[], side?: 'wb' | 'lb' | 'final') => {
      let bySide = cache.get(matches);
      if (!bySide) {
        bySide = new Map();
        cache.set(matches, bySide);
      }
      const key = side ?? '';
      let result = bySide.get(key);
      if (!result) {
        result = groupByRound(matches, side);
        bySide.set(key, result);
      }
      return result;
    };
  }, []);

  /** Import config from file */
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

  /** Animated simulation: reveal results one match at a time */
  const handleSimulateAnimated = useCallback(() => {
    if (animatingRef.current) {
      // Stop animation
      animatingRef.current = false;
      setAnimating(false);
      return;
    }
    animatingRef.current = true;
    setAnimating(true);

    const runNext = () => {
      if (!animatingRef.current) return;

      setStages((prev) => {
        // Find next playable match across all stages
        for (let sIdx = 0; sIdx < prev.length; sIdx++) {
          const stage = prev[sIdx];
          const roundNums = [
            ...new Set(
              stage.matches
                .filter(
                  (m) =>
                    m.status === 'pending' && !m.locked && m.team1 && m.team2
                )
                .map((m) => m.round_number)
            ),
          ].sort((a, b) => a - b);

          if (roundNums.length === 0) continue;
          const nextRound = roundNums[0];
          const mIdx = stage.matches.findIndex(
            (m) =>
              m.round_number === nextRound &&
              m.status === 'pending' &&
              !m.locked &&
              m.team1 &&
              m.team2
          );
          if (mIdx === -1) continue;

          const next = [...prev];
          const updatedStage = {
            ...next[sIdx],
            matches: [...next[sIdx].matches],
          };
          updatedStage.matches[mIdx] = simulateMatch(
            updatedStage.matches[mIdx]
          );
          if (updatedStage.stage_type === 'bracket') {
            updatedStage.matches = propagateBracket(updatedStage.matches);
          }
          next[sIdx] = updatedStage;

          // Schedule next match
          setTimeout(runNext, 400);
          return next;
        }

        // No more matches to simulate
        animatingRef.current = false;
        setAnimating(false);
        return prev;
      });
    };

    // Start first match immediately
    runNext();
  }, [setStages]);

  /** Generate comparison data with a different format */
  const handleCompare = useCallback(
    (altConfig: Partial<SimConfig>) => {
      const pool = FAKE_MAPS.slice(0, config.mapPoolSize);
      const mergedConfig = { ...config, ...altConfig };
      const currentTeams = occurrences[activeOccurrence]?.teams;
      if (!currentTeams) return;

      // Reuse same teams but adjust count if needed
      let compareTeams = [...currentTeams];
      if (mergedConfig.teamCount !== currentTeams.length) {
        if (mergedConfig.teamCount < currentTeams.length) {
          compareTeams = currentTeams.slice(0, mergedConfig.teamCount);
        } else {
          const extra = generateTeams(
            mergedConfig.teamCount - currentTeams.length,
            config.playersPerTeam
          );
          compareTeams = [
            ...currentTeams,
            ...extra.map((t, i) => ({
              ...t,
              seed: currentTeams.length + i + 1,
            })),
          ];
        }
      }

      const newStages: SimStage[] = [];
      const occSchedule = config.schedule;

      switch (mergedConfig.formatType) {
        case 'single_elim':
          newStages.push(
            generateSingleElim(
              compareTeams,
              mergedConfig.bestOf,
              pool,
              occSchedule,
              mergedConfig.escalation
            )
          );
          break;
        case 'double_elim':
          newStages.push(
            generateDoubleElim(
              compareTeams,
              mergedConfig.bestOf,
              pool,
              occSchedule,
              mergedConfig.escalation,
              mergedConfig.grandFinalReset
            )
          );
          break;
        case 'swiss':
          newStages.push(
            generateSwiss(
              compareTeams,
              mergedConfig.swissRounds,
              mergedConfig.bestOf,
              pool,
              occSchedule
            )
          );
          break;
        case 'round_robin':
          newStages.push(
            generateRoundRobin(
              compareTeams,
              mergedConfig.bestOf,
              pool,
              occSchedule
            )
          );
          break;
        case 'showmatch': {
          const s = generateSingleElim(
            compareTeams.slice(0, 2),
            mergedConfig.bestOf,
            pool,
            occSchedule,
            mergedConfig.escalation
          );
          s.name = tx.stageShowmatchName;
          s.stage_type = 'showmatch';
          newStages.push(s);
          break;
        }
      }

      setCompareConfig(altConfig);
      setCompareData({ stages: newStages, teams: compareTeams });
    },
    [config, occurrences, activeOccurrence, tx]
  );

  /** Run Monte Carlo simulation */
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

  /** Fetch real teams from Supabase and replace generated teams */
  const handleLoadRealTeams = useCallback(async () => {
    setLoadingRealTeams(true);
    setRealTeamsError(null);
    try {
      const res = await fetch(
        `/api/admin/teams?limit=${config.teamCount}&isActive=true`
      );
      if (!res.ok)
        throw new Error(format(tx.errorHttp, { status: res.status }));
      const data = await res.json();
      const apiTeams: {
        id: string;
        name: string;
        short_name: string | null;
        logo_url: string | null;
      }[] = data.teams ?? [];

      if (apiTeams.length === 0) {
        throw new Error(tx.errorNoActiveTeams);
      }

      // Convert to SimTeam format
      const realTeams: SimTeam[] = apiTeams
        .slice(0, config.teamCount)
        .map((t, i) => ({
          id: t.id,
          name: t.name,
          short_name:
            t.short_name ??
            t.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 3)
              .toUpperCase(),
          logo_url: null,
          seed: i + 1,
          strength: Math.round(
            75 - (i / Math.max(config.teamCount - 1, 1)) * 40
          ),
          players: [], // Real players would need another API call
        }));

      // If not enough real teams, pad with generated ones
      if (realTeams.length < config.teamCount) {
        const extra = generateTeams(
          config.teamCount - realTeams.length,
          config.playersPerTeam
        );
        for (let i = 0; i < extra.length; i++) {
          extra[i].seed = realTeams.length + i + 1;
        }
        realTeams.push(...extra);
      }

      // Regenerate bracket with real teams
      const pool = FAKE_MAPS.slice(0, config.mapPoolSize);
      const newStages: SimStage[] = [];
      const occSchedule = config.schedule;

      if (config.stageCount >= 2 && config.formatType !== 'showmatch') {
        const groupStage = generateRoundRobin(
          realTeams,
          config.bestOf,
          pool,
          occSchedule
        );
        groupStage.name = tx.stageGroupName;
        groupStage.stage_type = 'group';
        newStages.push(groupStage);
        const topTeams = realTeams.slice(0, Math.min(realTeams.length, 8));
        const bracketStage = generateSingleElim(
          topTeams,
          config.bestOf,
          pool,
          occSchedule,
          config.escalation
        );
        bracketStage.name = tx.stageFinalName;
        newStages.push(bracketStage);
      } else {
        switch (config.formatType) {
          case 'single_elim':
            newStages.push(
              generateSingleElim(
                realTeams,
                config.bestOf,
                pool,
                occSchedule,
                config.escalation
              )
            );
            break;
          case 'double_elim':
            newStages.push(
              generateDoubleElim(
                realTeams,
                config.bestOf,
                pool,
                occSchedule,
                config.escalation,
                config.grandFinalReset
              )
            );
            break;
          case 'swiss':
            newStages.push(
              generateSwiss(
                realTeams,
                config.swissRounds,
                config.bestOf,
                pool,
                occSchedule
              )
            );
            break;
          case 'round_robin':
            newStages.push(
              generateRoundRobin(realTeams, config.bestOf, pool, occSchedule)
            );
            break;
          case 'showmatch': {
            const s = generateSingleElim(
              realTeams.slice(0, 2),
              config.bestOf,
              pool,
              occSchedule,
              config.escalation
            );
            s.name = tx.stageShowmatchName;
            s.stage_type = 'showmatch';
            newStages.push(s);
            break;
          }
        }
      }

      setMapPool(pool);
      setOccurrences([
        {
          index: 0,
          label: tx.realTeamsLabel,
          startDate: config.schedule.startDate,
          stages: newStages,
          teams: realTeams,
        },
      ]);
      setActiveOccurrence(0);
      setGenerated(true);
      setActiveTab('bracket');
    } catch (err) {
      setRealTeamsError(err instanceof Error ? err.message : tx.errorUnknown);
    } finally {
      setLoadingRealTeams(false);
    }
  }, [config, tx]);

  /** Create a real tournament from the current simulation */
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

  /** Build bracket graph from SimMatches using production utils.
   *  Used for graph validation and layout computation. */
  const bracketGraphs = useMemo(() => {
    if (!generated)
      return new Map<string, ReturnType<typeof computeBracketLayout>>();
    const layouts = new Map<string, ReturnType<typeof computeBracketLayout>>();

    for (const stage of stages) {
      if (stage.stage_type !== 'bracket' && stage.stage_type !== 'showmatch')
        continue;

      // Convert SimMatch[] to MatchForGraph[]
      const matchesForGraph: MatchForGraph[] = stage.matches.map((m) => ({
        id: m.id,
        tournament_id: stage.id,
        bracket_side: m.bracket_side,
        round_number: m.round_number,
        group_key: null,
        next_match_win_id: m.next_match_win_id,
        next_match_lose_id: m.next_match_lose_id,
      }));

      const graph = buildBracketGraph(matchesForGraph);
      const layout = computeBracketLayout(graph);
      layouts.set(stage.id, layout);
    }

    return layouts;
  }, [stages, generated]);

  // Expose graph validation info for debugging
  const _bracketGraphs = bracketGraphs; // prevent unused warning in dev
  void _bracketGraphs;

  // Stats computation
  const stats = useMemo(() => {
    const allMatches = stages.flatMap((s) => s.matches);
    const total = allMatches.length;
    const finished = allMatches.filter((m) => m.status === 'finished').length;
    const pending = allMatches.filter((m) => m.status === 'pending').length;

    // Win counts + score differential
    const wins = new Map<string, number>();
    const losses = new Map<string, number>();
    const mapWins = new Map<string, number>(); // maps won (individual)
    const mapLosses = new Map<string, number>();
    for (const m of allMatches) {
      if (m.status !== 'finished' || !m.winner_team_id) continue;
      wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
      const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
      if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);

      // Per-team map score tracking
      if (m.team1_id && m.team1_score != null && m.team2_score != null) {
        mapWins.set(m.team1_id, (mapWins.get(m.team1_id) ?? 0) + m.team1_score);
        mapLosses.set(
          m.team1_id,
          (mapLosses.get(m.team1_id) ?? 0) + m.team2_score
        );
      }
      if (m.team2_id && m.team1_score != null && m.team2_score != null) {
        mapWins.set(m.team2_id, (mapWins.get(m.team2_id) ?? 0) + m.team2_score);
        mapLosses.set(
          m.team2_id,
          (mapLosses.get(m.team2_id) ?? 0) + m.team1_score
        );
      }
    }

    // Map usage
    const mapCount = new Map<string, number>();
    for (const m of allMatches) {
      for (const map of m.maps) {
        mapCount.set(map.name, (mapCount.get(map.name) ?? 0) + 1);
      }
    }

    // Next playable round
    const playableMatches = allMatches.filter(
      (m) => m.status === 'pending' && m.team1 && m.team2
    );
    const nextRound =
      playableMatches.length > 0
        ? Math.min(...playableMatches.map((m) => m.round_number))
        : null;
    const nextRoundName =
      playableMatches.find((m) => m.round_number === nextRound)?.round_name ??
      null;

    // Estimated duration
    const scheduledDates = allMatches
      .map((m) => m.scheduled_at)
      .filter(Boolean) as string[];
    let estimatedDuration: string | null = null;
    if (scheduledDates.length >= 2) {
      const sorted = scheduledDates.sort();
      const first = new Date(sorted[0]);
      const last = new Date(sorted[sorted.length - 1]);
      const diffMs = last.getTime() - first.getTime();
      const hours = Math.round(diffMs / (1000 * 60 * 60));
      if (hours < 24) estimatedDuration = `${hours}h`;
      else estimatedDuration = `${Math.ceil(hours / 24)}j ${hours % 24}h`;
    }

    const competitiveness = computeCompetitiveness(allMatches, teams);

    return {
      total,
      finished,
      pending,
      wins,
      losses,
      mapWins,
      mapLosses,
      mapCount,
      nextRound,
      nextRoundName,
      estimatedDuration,
      competitiveness,
    };
  }, [stages, teams]);

  return (
    <>
      <Head>
        <title>{tx.pageTitle}</title>
        <style>{`
          @media print {
            body { background: white !important; color: black !important; }
            .print\\:hidden { display: none !important; }
            .min-h-screen { min-height: auto !important; background: white !important; }
            * { color-adjust: exact; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white pt-24">
        <div className="max-w-[1600px] mx-auto px-6 py-10">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
            <div>
              <Link
                href="/admin"
                className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
              >
                &larr; {tx.backAdmin}
              </Link>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {tx.badgeAdmin}
              </p>
              <h1 className="text-2xl font-semibold">{tx.heading}</h1>
              <p className="text-sm text-neutral-400 mt-1">{tx.subtitle}</p>
            </div>
            {generated && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleSimulateNextRound}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold shadow transition-colors"
                  title={tx.nextRoundTitle}
                >
                  {tx.nextRound}
                </button>
                <button
                  onClick={handleSimulateAnimated}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors ${
                    animating
                      ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                  title={
                    animating ? tx.animatedStopTitle : tx.animatedStartTitle
                  }
                >
                  {animating ? tx.stop : tx.simulateAnimated}
                </button>
                <button
                  onClick={handleSimulateAll}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow transition-colors"
                >
                  {tx.simulateAll}
                </button>
                <button
                  onClick={handleResetAll}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-semibold shadow transition-colors"
                >
                  {tx.resetAll}
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold shadow transition-colors ${
                    undoStack.length > 0
                      ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  }`}
                  title={format(tx.undoTitle, { count: undoStack.length })}
                >
                  &#x21A9;
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold shadow transition-colors ${
                    redoStack.length > 0
                      ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  }`}
                  title={format(tx.redoTitle, { count: redoStack.length })}
                >
                  &#x21AA;
                </button>
                <div className="w-px bg-white/10 mx-1 print:hidden" />
                <button
                  onClick={saveToHistory}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-sm font-semibold shadow transition-colors print:hidden"
                  title={tx.saveHistoryTitle}
                >
                  {tx.save}
                </button>
                <button
                  onClick={handleCreateTournament}
                  disabled={creatingTournament}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors print:hidden ${
                    creatingTournament
                      ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                      : 'bg-sky-600 hover:bg-sky-700 text-white'
                  }`}
                  title={tx.createTournamentTitle}
                >
                  {creatingTournament ? tx.creating : tx.createTournament}
                </button>
                <button
                  onClick={handleCopyResults}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold shadow transition-colors print:hidden"
                  title={tx.copyResultsTitle}
                >
                  {tx.copyResults}
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold shadow transition-colors print:hidden"
                  title={tx.printTitle}
                >
                  PDF
                </button>
              </div>
            )}
          </div>

          {/* Tournament creation feedback */}
          {createTournamentResult && (
            <div className="mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  {format(tx.createdSuccess, {
                    name: createTournamentResult.name,
                  })}
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  {tx.createdDraftNote}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/admin/tournament/${createTournamentResult.id}`}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow transition-colors text-white"
                >
                  {tx.viewTournament}
                </Link>
                <button
                  type="button"
                  onClick={() => setCreateTournamentResult(null)}
                  className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm text-neutral-400 transition-colors"
                >
                  {tx.close}
                </button>
              </div>
            </div>
          )}
          {createTournamentError && (
            <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between">
              <p className="text-sm text-red-400">{createTournamentError}</p>
              <button
                type="button"
                onClick={() => setCreateTournamentError(null)}
                className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm text-neutral-400 transition-colors"
              >
                {tx.close}
              </button>
            </div>
          )}

          {/* Configuration panel */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 mb-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tx.configHeading}</h2>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Presets */}
                <div className="flex gap-1">
                  {[
                    {
                      label: tx.presetRapide,
                      cfg: {
                        formatType: 'single_elim' as FormatType,
                        teamCount: 4,
                        bestOf: 1,
                        stageCount: 1,
                      },
                    },
                    {
                      label: tx.presetStandard,
                      cfg: {
                        formatType: 'single_elim' as FormatType,
                        teamCount: 8,
                        bestOf: 3,
                        stageCount: 1,
                      },
                    },
                    {
                      label: tx.presetLan,
                      cfg: {
                        formatType: 'double_elim' as FormatType,
                        teamCount: 8,
                        bestOf: 3,
                        stageCount: 1,
                        grandFinalReset: true,
                        escalation: {
                          enabled: true,
                          earlyRoundsBo: 1,
                          semiFinalsBo: 3,
                          finalsBo: 5,
                        },
                      },
                    },
                    {
                      label: tx.presetLigue,
                      cfg: {
                        formatType: 'swiss' as FormatType,
                        teamCount: 16,
                        bestOf: 3,
                        swissRounds: 5,
                        stageCount: 1,
                      },
                    },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setConfig((c) => ({ ...c, ...preset.cfg }))
                      }
                      className="px-2.5 py-1 rounded text-[10px] font-semibold bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {/* Export / Import */}
                <div className="flex gap-1 print:hidden">
                  <button
                    type="button"
                    onClick={() => exportConfigAsJSON(config)}
                    className="px-2.5 py-1 rounded text-[10px] font-semibold bg-sky-900/50 hover:bg-sky-800/50 border border-sky-700/40 text-sky-300 transition-colors"
                    title={tx.exportTitle}
                  >
                    {tx.export}
                  </button>
                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    className="px-2.5 py-1 rounded text-[10px] font-semibold bg-sky-900/50 hover:bg-sky-800/50 border border-sky-700/40 text-sky-300 transition-colors"
                    title={tx.importTitle}
                  >
                    {tx.import}
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportConfig(file);
                      e.target.value = '';
                    }}
                  />
                </div>
                {importError && (
                  <span className="text-[10px] text-red-400">
                    {importError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setConfigCollapsed((c) => !c)}
                  className="text-neutral-400 hover:text-white transition-colors text-sm"
                >
                  {configCollapsed ? tx.show : tx.reduce}
                </button>
              </div>
            </div>

            {!configCollapsed && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {/* Format */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-200 mb-2">
                      {tx.formatLabel}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(FORMAT_LABELS) as FormatType[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            const tc =
                              (f === 'single_elim' || f === 'double_elim') &&
                              ![4, 8, 16, 32].includes(config.teamCount)
                                ? 8
                                : f === 'showmatch'
                                  ? 2
                                  : config.teamCount;
                            setConfig((c) => ({
                              ...c,
                              formatType: f,
                              teamCount: tc,
                            }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            config.formatType === f
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          {FORMAT_LABELS[f]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team count */}
                  {config.formatType !== 'showmatch' && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.teamCountLabel}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {validTeamCounts.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setConfig((c) => ({ ...c, teamCount: n }))
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              config.teamCount === n
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Players per team */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-200 mb-2">
                      {tx.playersPerTeamLabel}
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 5, 6].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, playersPerTeam: n }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            config.playersPerTeam === n
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Best of */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-200 mb-2">
                      {tx.matchFormatLabel}
                    </label>
                    <div className="flex gap-2">
                      {[1, 3, 5, 7].map((bo) => (
                        <button
                          key={bo}
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, bestOf: bo }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            config.bestOf === bo
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          BO{bo}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Map pool */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-200 mb-2">
                      {tx.mapPoolLabel}
                    </label>
                    <input
                      type="range"
                      min={3}
                      max={FAKE_MAPS.length}
                      value={config.mapPoolSize}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          mapPoolSize: parseInt(e.target.value),
                        }))
                      }
                      className="w-full accent-purple-500"
                    />
                    <span className="text-xs text-neutral-400">
                      {format(tx.mapPoolValue, { count: config.mapPoolSize })}
                    </span>
                  </div>

                  {/* Swiss rounds */}
                  {config.formatType === 'swiss' && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.swissRoundsLabel}
                      </label>
                      <div className="flex gap-2">
                        {[3, 5, 7, 9].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() =>
                              setConfig((c) => ({ ...c, swissRounds: r }))
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              config.swissRounds === r
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grand final reset */}
                  {config.formatType === 'double_elim' && (
                    <div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer mt-6">
                        <input
                          type="checkbox"
                          checked={config.grandFinalReset}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              grandFinalReset: e.target.checked,
                            }))
                          }
                          className="rounded border-neutral-500 bg-neutral-700"
                        />
                        <span className="font-medium text-neutral-200">
                          {tx.grandFinalReset}
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Multi-stage */}
                  {config.formatType !== 'showmatch' && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.stagesLabel}
                      </label>
                      <div className="flex gap-2">
                        {[1, 2].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setConfig((c) => ({ ...c, stageCount: n }))
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              config.stageCount === n
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                            }`}
                          >
                            {n === 1 ? tx.oneStage : tx.twoStages}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Scheduling section */}
                <div className="border-t border-white/10 pt-6">
                  <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4">
                    {tx.planningHeading}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.startDateLabel}
                      </label>
                      <input
                        type="datetime-local"
                        value={config.schedule.startDate}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            schedule: {
                              ...c.schedule,
                              startDate: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.matchDurationLabel}
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        step={5}
                        value={config.schedule.matchDurationMin}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            schedule: {
                              ...c.schedule,
                              matchDurationMin: parseInt(e.target.value) || 30,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.breakMatchesLabel}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        step={5}
                        value={config.schedule.breakBetweenMatchesMin}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            schedule: {
                              ...c.schedule,
                              breakBetweenMatchesMin:
                                parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.breakRoundsLabel}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={240}
                        step={5}
                        value={config.schedule.breakBetweenRoundsMin}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            schedule: {
                              ...c.schedule,
                              breakBetweenRoundsMin:
                                parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.dayStartLabel}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={config.schedule.dayStartHour}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              schedule: {
                                ...c.schedule,
                                dayStartHour: parseInt(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-20 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-neutral-500 text-sm">h</span>
                        <span className="text-neutral-600 text-xs">
                          {tx.hourSeparator}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={config.schedule.dayEndHour}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              schedule: {
                                ...c.schedule,
                                dayEndHour: parseInt(e.target.value) || 24,
                              },
                            }))
                          }
                          className="w-20 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-neutral-500 text-sm">h</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">
                        {tx.matchesPerDayLabel}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={config.schedule.matchesPerDay}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            schedule: {
                              ...c.schedule,
                              matchesPerDay: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Escalation section */}
                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.escalation.enabled}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            escalation: {
                              ...c.escalation,
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="rounded border-neutral-500 bg-neutral-700"
                      />
                      <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                        {tx.escalationLabel}
                      </span>
                    </label>
                  </div>
                  {config.escalation.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        {
                          label: tx.escEarlyRounds,
                          key: 'earlyRoundsBo' as const,
                        },
                        {
                          label: tx.escSemiFinals,
                          key: 'semiFinalsBo' as const,
                        },
                        { label: tx.escFinals, key: 'finalsBo' as const },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <label className="block text-sm font-medium text-neutral-200 mb-2">
                            {label}
                          </label>
                          <div className="flex gap-2">
                            {[1, 3, 5, 7].map((bo) => (
                              <button
                                key={bo}
                                type="button"
                                onClick={() =>
                                  setConfig((c) => ({
                                    ...c,
                                    escalation: { ...c.escalation, [key]: bo },
                                  }))
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  config.escalation[key] === bo
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                                }`}
                              >
                                BO{bo}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Occurrences section */}
                <div className="border-t border-white/10 pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.occurrence.enabled}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            occurrence: {
                              ...c.occurrence,
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="rounded border-neutral-500 bg-neutral-700"
                      />
                      <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                        {tx.recurringLabel}
                      </span>
                    </label>
                  </div>
                  {config.occurrence.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-200 mb-2">
                          {tx.frequencyLabel}
                        </label>
                        <div className="flex gap-2">
                          {(
                            Object.keys(
                              FREQUENCY_LABELS
                            ) as OccurrenceConfig['frequency'][]
                          ).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() =>
                                setConfig((c) => ({
                                  ...c,
                                  occurrence: { ...c.occurrence, frequency: f },
                                }))
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                config.occurrence.frequency === f
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                              }`}
                            >
                              {FREQUENCY_LABELS[f]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-200 mb-2">
                          {tx.occurrenceCountLabel}
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={52}
                          value={config.occurrence.count}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              occurrence: {
                                ...c.occurrence,
                                count: Math.max(
                                  2,
                                  parseInt(e.target.value) || 2
                                ),
                              },
                            }))
                          }
                          className="w-32 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleGenerate}
                className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold shadow transition-colors"
              >
                {tx.generate}
                {config.occurrence.enabled
                  ? format(tx.generateOccSuffix, {
                      count: config.occurrence.count,
                    })
                  : ''}
              </button>
              <button
                onClick={handleLoadRealTeams}
                disabled={loadingRealTeams}
                className={`px-6 py-3 rounded-lg text-sm font-semibold shadow transition-colors ${
                  loadingRealTeams
                    ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                    : 'bg-sky-600 hover:bg-sky-700 text-white'
                }`}
                title={tx.loadRealTeamsTitle}
              >
                {loadingRealTeams ? tx.loading : tx.loadRealTeams}
              </button>
              {realTeamsError && (
                <span className="text-xs text-red-400">{realTeamsError}</span>
              )}
            </div>
          </div>

          {/* Generated content */}
          {generated && (
            <>
              {/* Occurrence selector */}
              {occurrences.length > 1 && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-neutral-300 mb-2 uppercase tracking-wider">
                    {tx.occurrenceLabelHeading}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {occurrences.map((occ, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveOccurrence(i)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          activeOccurrence === i
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        {occ.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <SummaryCard label={tx.summaryTeams} value={teams.length} />
                <SummaryCard label={tx.summaryMatches} value={stats.total} />
                <SummaryCard
                  label={tx.summaryFinished}
                  value={stats.finished}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label={tx.summaryPending}
                  value={stats.pending}
                  color="text-amber-400"
                />
                {stats.estimatedDuration && (
                  <SummaryCard
                    label={tx.summaryDuration}
                    value={stats.estimatedDuration}
                    color="text-sky-400"
                  />
                )}
                {stats.nextRoundName && (
                  <SummaryCard
                    label={tx.summaryNextRound}
                    value={stats.nextRoundName}
                    color="text-blue-400"
                  />
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-6 border-b border-white/10 pb-px overflow-x-auto">
                {(
                  [
                    'bracket',
                    'teams',
                    'maps',
                    'stats',
                    'monte-carlo',
                    'history',
                    'compare',
                    ...(occurrences.length > 1 ? ['timeline' as const] : []),
                  ] as const
                ).map((tab) => {
                  const TAB_LABELS: Record<string, string> = {
                    bracket: tx.tabBracket,
                    teams: tx.tabTeams,
                    maps: tx.tabMaps,
                    stats: tx.tabStats,
                    'monte-carlo': tx.tabMonteCarlo,
                    history:
                      simHistory.length > 0
                        ? format(tx.tabHistoryCount, {
                            count: simHistory.length,
                          })
                        : tx.tabHistory,
                    compare: tx.tabCompare,
                    timeline: tx.tabTimeline,
                  };
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as typeof activeTab)}
                      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                        activeTab === tab
                          ? 'bg-white/10 text-white border-b-2 border-purple-500'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {TAB_LABELS[tab] ?? tab}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              {activeTab === 'bracket' && (
                <div className="space-y-8">
                  {stages.map((stage, stageIdx) => (
                    <div key={stage.id}>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {stage.stage_type}
                        </span>
                        {stage.name}
                        <span className="text-sm text-neutral-500 font-normal">
                          {format(tx.matchesCount, {
                            count: stage.matches.length,
                          })}
                        </span>
                      </h3>

                      {(stage.stage_type === 'bracket' ||
                        stage.stage_type === 'showmatch') && (
                        <>
                          {/* WB */}
                          <EliminationView
                            rounds={groupByRoundMemo(stage.matches, 'wb')}
                            onSimulate={getStageHandlers(stageIdx).onSimulate}
                            onReset={getStageHandlers(stageIdx).onReset}
                            onToggleLock={
                              getStageHandlers(stageIdx).onToggleLock
                            }
                            label={
                              stage.matches.some((m) => m.bracket_side === 'lb')
                                ? tx.winnersBracket
                                : undefined
                            }
                          />
                          {/* LB */}
                          {stage.matches.some(
                            (m) => m.bracket_side === 'lb'
                          ) && (
                            <div className="mt-6">
                              <EliminationView
                                rounds={groupByRoundMemo(stage.matches, 'lb')}
                                onSimulate={
                                  getStageHandlers(stageIdx).onSimulate
                                }
                                onReset={getStageHandlers(stageIdx).onReset}
                                onToggleLock={
                                  getStageHandlers(stageIdx).onToggleLock
                                }
                                label={tx.losersBracket}
                                accentColor="text-red-300"
                              />
                            </div>
                          )}
                          {/* Grand Final */}
                          {stage.matches.some(
                            (m) => m.bracket_side === 'final'
                          ) && (
                            <div className="mt-6">
                              <EliminationView
                                rounds={groupByRoundMemo(
                                  stage.matches,
                                  'final'
                                )}
                                onSimulate={
                                  getStageHandlers(stageIdx).onSimulate
                                }
                                onReset={getStageHandlers(stageIdx).onReset}
                                onToggleLock={
                                  getStageHandlers(stageIdx).onToggleLock
                                }
                                label={tx.grandFinal}
                                accentColor="text-amber-300"
                              />
                            </div>
                          )}
                        </>
                      )}

                      {(stage.stage_type === 'swiss' ||
                        stage.stage_type === 'round_robin' ||
                        stage.stage_type === 'group') && (
                        <EliminationView
                          rounds={groupByRoundMemo(stage.matches)}
                          onSimulate={getStageHandlers(stageIdx).onSimulate}
                          onReset={getStageHandlers(stageIdx).onReset}
                          onToggleLock={getStageHandlers(stageIdx).onToggleLock}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'teams' && (
                <div>
                  <p className="text-xs text-neutral-500 mb-4">
                    {tx.teamsDragHint}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {teams.map((team, teamIdx) => (
                      <div
                        key={team.id}
                        draggable
                        onDragStart={() => setDragSeedIdx(teamIdx)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragSeedIdx !== null && dragSeedIdx !== teamIdx) {
                            handleReorderTeams(dragSeedIdx, teamIdx);
                          }
                          setDragSeedIdx(null);
                        }}
                        onDragEnd={() => setDragSeedIdx(null)}
                        className={`rounded-xl border p-4 space-y-3 cursor-grab active:cursor-grabbing transition-all ${
                          dragSeedIdx === teamIdx
                            ? 'border-purple-500/50 bg-purple-500/10 opacity-50 scale-95'
                            : dragSeedIdx !== null
                              ? 'border-purple-500/20 bg-white/[0.02] hover:border-purple-500/40 hover:bg-purple-500/5'
                              : 'border-white/10 bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Drag handle */}
                          <div
                            className="flex flex-col gap-0.5 text-neutral-600 flex-shrink-0 cursor-grab"
                            title={tx.dragToReorder}
                          >
                            <div className="flex gap-0.5">
                              <span className="w-1 h-1 rounded-full bg-current" />
                              <span className="w-1 h-1 rounded-full bg-current" />
                            </div>
                            <div className="flex gap-0.5">
                              <span className="w-1 h-1 rounded-full bg-current" />
                              <span className="w-1 h-1 rounded-full bg-current" />
                            </div>
                            <div className="flex gap-0.5">
                              <span className="w-1 h-1 rounded-full bg-current" />
                              <span className="w-1 h-1 rounded-full bg-current" />
                            </div>
                          </div>
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border ${
                              SEED_COLORS[team.seed] ??
                              'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            {team.short_name}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">
                              {team.name}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {format(tx.seedLabel, { seed: team.seed })}
                            </div>
                          </div>
                          {stats.wins.has(team.id) && (
                            <div className="ml-auto text-right">
                              <div className="text-xs font-bold text-emerald-400">
                                {stats.wins.get(team.id)}W
                              </div>
                              <div className="text-xs font-bold text-red-400">
                                {stats.losses.get(team.id) ?? 0}L
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Strength slider */}
                        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
                          <span className="text-[10px] text-neutral-500 font-semibold w-10">
                            {tx.strengthLabel}
                          </span>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={team.strength}
                            onChange={(e) =>
                              handleUpdateTeamStrength(
                                team.id,
                                parseInt(e.target.value)
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex-1 accent-purple-500 h-1.5"
                            draggable={false}
                          />
                          <span
                            className={`text-xs font-bold tabular-nums w-8 text-right ${
                              team.strength >= 70
                                ? 'text-emerald-400'
                                : team.strength >= 45
                                  ? 'text-amber-400'
                                  : 'text-red-400'
                            }`}
                          >
                            {team.strength}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {team.players.map((p, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-neutral-300">{p.name}</span>
                              <span className="text-neutral-600 font-mono text-[10px]">
                                {p.battleTag}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'maps' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {mapPool.map((name) => {
                      const count = stats.mapCount.get(name) ?? 0;
                      const maxCount = Math.max(...stats.mapCount.values(), 1);
                      return (
                        <div
                          key={name}
                          className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2"
                        >
                          <div className="text-sm font-semibold">{name}</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full transition-all"
                                style={{
                                  width: `${(count / maxCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-neutral-400 tabular-nums w-8 text-right">
                              {count}x
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'stats' && (
                <div className="space-y-6">
                  {/* Standings with score diff */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                      {tx.standingsHeading}
                    </h3>
                    <div className="space-y-1">
                      <div className="grid grid-cols-[auto_1fr_50px_50px_50px_70px_50px] gap-2 text-[10px] uppercase tracking-wider text-neutral-600 font-bold px-3 pb-2">
                        <span className="w-6">#</span>
                        <span>{tx.thTeam}</span>
                        <span className="text-center">{tx.thWins}</span>
                        <span className="text-center">{tx.thLosses}</span>
                        <span className="text-center">{tx.thPct}</span>
                        <span className="text-center">{tx.thMaps}</span>
                        <span className="text-center">{tx.thDiff}</span>
                      </div>
                      {teams
                        .map((t) => ({
                          team: t,
                          wins: stats.wins.get(t.id) ?? 0,
                          losses: stats.losses.get(t.id) ?? 0,
                          mapsWon: stats.mapWins.get(t.id) ?? 0,
                          mapsLost: stats.mapLosses.get(t.id) ?? 0,
                        }))
                        .sort(
                          (a, b) =>
                            b.wins - a.wins ||
                            a.losses - b.losses ||
                            b.mapsWon - b.mapsLost - (a.mapsWon - a.mapsLost)
                        )
                        .map((row, i) => {
                          const total = row.wins + row.losses;
                          const pct =
                            total > 0
                              ? Math.round((row.wins / total) * 100)
                              : 0;
                          const diff = row.mapsWon - row.mapsLost;
                          return (
                            <div
                              key={row.team.id}
                              className={`grid grid-cols-[auto_1fr_50px_50px_50px_70px_50px] gap-2 items-center px-3 py-2 rounded-lg text-sm ${
                                i < 3
                                  ? 'bg-emerald-500/5 border border-emerald-500/10'
                                  : i % 2 === 0
                                    ? 'bg-white/[0.01]'
                                    : ''
                              }`}
                            >
                              <span className="w-6 text-xs font-bold text-neutral-500">
                                {i + 1}
                              </span>
                              <div className="flex items-center gap-2 truncate">
                                <span className="font-medium truncate">
                                  {row.team.name}
                                </span>
                                <span className="text-[9px] text-neutral-600">
                                  #{row.team.seed}
                                </span>
                              </div>
                              <span className="text-center font-bold text-emerald-400">
                                {row.wins}
                              </span>
                              <span className="text-center font-bold text-red-400">
                                {row.losses}
                              </span>
                              <span className="text-center text-neutral-400">
                                {pct}%
                              </span>
                              <span className="text-center text-[11px] text-neutral-500">
                                {row.mapsWon}-{row.mapsLost}
                              </span>
                              <span
                                className={`text-center font-bold text-xs ${
                                  diff > 0
                                    ? 'text-emerald-400'
                                    : diff < 0
                                      ? 'text-red-400'
                                      : 'text-neutral-500'
                                }`}
                              >
                                {diff > 0 ? '+' : ''}
                                {diff}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Progression */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                      {tx.progressionHeading}
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-4 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                          style={{
                            width: `${stats.total > 0 ? (stats.finished / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums text-neutral-300">
                        {stats.total > 0
                          ? Math.round((stats.finished / stats.total) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-neutral-500">
                        {format(tx.matchesFinishedProgress, {
                          finished: stats.finished,
                          total: stats.total,
                        })}
                      </p>
                      {stats.nextRoundName && (
                        <p className="text-xs text-blue-400">
                          {format(tx.nextPrefix, { name: stats.nextRoundName })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Competitiveness metrics */}
                  {stats.finished > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                      <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                        {tx.competitivenessHeading}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            {tx.closeMatches}
                          </div>
                          <div className="text-xl font-bold text-amber-400">
                            {stats.competitiveness.closeMatches}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {format(tx.statPctOfMatches, {
                              pct: stats.competitiveness.closeMatchPct,
                            })}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            {tx.upsets}
                          </div>
                          <div className="text-xl font-bold text-rose-400">
                            {stats.competitiveness.upsets}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {format(tx.statPctOfMatches, {
                              pct: stats.competitiveness.upsetPct,
                            })}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            {tx.mapsPerMatch}
                          </div>
                          <div className="text-xl font-bold text-sky-400">
                            {stats.competitiveness.avgMapsPerMatch}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {tx.average}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            {tx.longestStreak}
                          </div>
                          <div className="text-xl font-bold text-emerald-400">
                            {stats.competitiveness.maxWinStreak}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {tx.consecutiveWins}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            {tx.avgJourney}
                          </div>
                          <div className="text-xl font-bold text-purple-400">
                            {stats.competitiveness.avgTeamJourney}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {tx.matchesPerTeam}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            {tx.dominance}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xl font-bold text-neutral-300">
                              {stats.competitiveness.dominanceScore}%
                            </div>
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {stats.competitiveness.dominanceScore < 30
                              ? tx.domVeryBalanced
                              : stats.competitiveness.dominanceScore < 50
                                ? tx.domBalanced
                                : stats.competitiveness.dominanceScore < 70
                                  ? tx.domOneFavorite
                                  : tx.domDomination}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Round-by-round breakdown */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                      {tx.roundDetailHeading}
                    </h3>
                    <div className="space-y-2">
                      {(() => {
                        const allMatches = stages.flatMap((s) => s.matches);
                        const roundMap = new Map<
                          string,
                          { total: number; finished: number; name: string }
                        >();
                        for (const m of allMatches) {
                          const key = `${m.bracket_side}-${m.round_number}`;
                          const existing = roundMap.get(key) ?? {
                            total: 0,
                            finished: 0,
                            name: m.round_name,
                          };
                          existing.total++;
                          if (m.status === 'finished') existing.finished++;
                          roundMap.set(key, existing);
                        }
                        return Array.from(roundMap.entries()).map(
                          ([key, data]) => {
                            const pct =
                              data.total > 0
                                ? Math.round((data.finished / data.total) * 100)
                                : 0;
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-3"
                              >
                                <span className="text-xs text-neutral-400 w-32 truncate">
                                  {data.name}
                                </span>
                                <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pct === 100
                                        ? 'bg-emerald-500'
                                        : pct > 0
                                          ? 'bg-blue-500'
                                          : 'bg-neutral-700'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-neutral-500 tabular-nums w-16 text-right">
                                  {data.finished}/{data.total}
                                </span>
                              </div>
                            );
                          }
                        );
                      })()}
                    </div>
                  </div>

                  {/* Head-to-head matrix */}
                  {stats.finished > 0 &&
                    (() => {
                      const allMatches = stages.flatMap((s) => s.matches);
                      const h2hRecords = computeHeadToHead(allMatches);
                      if (h2hRecords.length === 0) return null;

                      // Build a lookup map: "id1-id2" → record
                      const h2hMap = new Map<string, H2HRecord>();
                      for (const rec of h2hRecords) {
                        h2hMap.set(`${rec.team1Id}-${rec.team2Id}`, rec);
                      }

                      // Sort teams by wins
                      const sortedTeams = [...teams].sort(
                        (a, b) =>
                          (stats.wins.get(b.id) ?? 0) -
                          (stats.wins.get(a.id) ?? 0)
                      );

                      return (
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                          <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                            {tx.h2hHeading}
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/10">
                                  <th className="text-left py-2 pr-2 text-neutral-500 font-semibold sticky left-0 bg-[#0a0a12] z-10">
                                    {tx.vs}
                                  </th>
                                  {sortedTeams.map((t) => (
                                    <th
                                      key={t.id}
                                      className="text-center py-2 px-1 text-neutral-500 font-semibold min-w-[50px]"
                                    >
                                      <span title={t.name}>{t.short_name}</span>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {sortedTeams.map((t1) => (
                                  <tr
                                    key={t1.id}
                                    className="border-b border-white/[0.03]"
                                  >
                                    <td className="py-1.5 pr-2 font-medium text-neutral-300 sticky left-0 bg-[#0a0a12] z-10">
                                      {t1.short_name}
                                    </td>
                                    {sortedTeams.map((t2) => {
                                      if (t1.id === t2.id) {
                                        return (
                                          <td
                                            key={t2.id}
                                            className="text-center py-1.5 px-1 text-neutral-800"
                                          >
                                            —
                                          </td>
                                        );
                                      }
                                      const key = [t1.id, t2.id]
                                        .sort()
                                        .join('-');
                                      const rec = h2hMap.get(key);
                                      if (!rec) {
                                        return (
                                          <td
                                            key={t2.id}
                                            className="text-center py-1.5 px-1 text-neutral-700"
                                          >
                                            -
                                          </td>
                                        );
                                      }
                                      const isFirst = t1.id === rec.team1Id;
                                      const w = isFirst
                                        ? rec.team1Wins
                                        : rec.team2Wins;
                                      const l = isFirst
                                        ? rec.team2Wins
                                        : rec.team1Wins;
                                      return (
                                        <td
                                          key={t2.id}
                                          className="text-center py-1.5 px-1"
                                        >
                                          <span
                                            className={`tabular-nums font-semibold ${
                                              w > l
                                                ? 'text-emerald-400'
                                                : w < l
                                                  ? 'text-red-400'
                                                  : 'text-neutral-400'
                                            }`}
                                          >
                                            {w}-{l}
                                          </span>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                </div>
              )}

              {activeTab === 'monte-carlo' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                      {tx.monteCarloHeading}
                    </h3>
                    <p className="text-xs text-neutral-500 mb-4">
                      {tx.monteCarloDesc}
                      {stages
                        .flatMap((s) => s.matches)
                        .some((m) => m.locked) && (
                        <span className="text-amber-400 ml-1">
                          {tx.lockedPreserved}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-4 mb-6">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
                          {tx.iterationsLabel}
                        </label>
                        <div className="flex gap-2">
                          {[100, 500, 1000, 5000].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setMonteCarloIterations(n)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                monteCarloIterations === n
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                              }`}
                            >
                              {n >= 1000 ? `${n / 1000}k` : n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleMonteCarlo}
                        disabled={monteCarloRunning}
                        className={`px-6 py-3 rounded-lg text-sm font-semibold shadow transition-colors ${
                          monteCarloRunning
                            ? 'bg-neutral-700 text-neutral-400 cursor-wait animate-pulse'
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                      >
                        {monteCarloRunning
                          ? tx.calcInProgress
                          : format(tx.runSimulations, {
                              count: monteCarloIterations,
                            })}
                      </button>
                    </div>

                    {monteCarloResult && (
                      <div className="space-y-6">
                        <p className="text-xs text-neutral-500">
                          {format(tx.iterationsCompleted, {
                            count: monteCarloResult.iterations,
                          })}
                        </p>

                        {/* Win probability ranking */}
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">
                            {tx.winProbability}
                          </h4>
                          <div className="space-y-2">
                            {teams
                              .map((t) => ({
                                team: t,
                                prob:
                                  monteCarloResult.winProbability.get(t.id) ??
                                  0,
                                wins: monteCarloResult.winCounts.get(t.id) ?? 0,
                              }))
                              .sort((a, b) => b.prob - a.prob)
                              .map((row, i) => (
                                <div
                                  key={row.team.id}
                                  className="flex items-center gap-3"
                                >
                                  <span className="w-6 text-xs font-bold text-neutral-500">
                                    {i + 1}
                                  </span>
                                  <span
                                    className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
                                      SEED_COLORS[row.team.seed] ??
                                      'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
                                    }`}
                                  >
                                    {row.team.seed}
                                  </span>
                                  <span className="text-sm font-medium w-40 truncate">
                                    {row.team.name}
                                  </span>
                                  <div className="flex-1 h-3 bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all bg-gradient-to-r from-purple-600 to-emerald-500"
                                      style={{ width: `${row.prob * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-bold tabular-nums w-16 text-right text-white">
                                    {(row.prob * 100).toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-neutral-500 tabular-nums w-16 text-right">
                                    {row.wins}/{monteCarloResult.iterations}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Placement distribution for top 4 */}
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">
                            {tx.placementDist}
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/10">
                                  <th className="text-left py-2 pr-4 text-neutral-500 font-semibold">
                                    {tx.thTeam}
                                  </th>
                                  {Array.from(
                                    { length: Math.min(teams.length, 8) },
                                    (_, i) => (
                                      <th
                                        key={i}
                                        className="text-center py-2 px-2 text-neutral-500 font-semibold"
                                      >
                                        {i === 0
                                          ? tx.placement1st
                                          : i === 1
                                            ? tx.placement2nd
                                            : format(tx.placementNth, {
                                                n: i + 1,
                                              })}
                                      </th>
                                    )
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {teams
                                  .map((t) => ({
                                    team: t,
                                    dist:
                                      monteCarloResult.placementDist.get(
                                        t.id
                                      ) ?? [],
                                  }))
                                  .sort(
                                    (a, b) =>
                                      (b.dist[0] ?? 0) - (a.dist[0] ?? 0)
                                  )
                                  .slice(0, 8)
                                  .map((row) => (
                                    <tr
                                      key={row.team.id}
                                      className="border-b border-white/[0.03]"
                                    >
                                      <td className="py-2 pr-4 font-medium">
                                        {row.team.short_name}
                                      </td>
                                      {Array.from(
                                        { length: Math.min(teams.length, 8) },
                                        (_, i) => {
                                          const count = row.dist[i] ?? 0;
                                          const pct =
                                            monteCarloResult.iterations > 0
                                              ? Math.round(
                                                  (count /
                                                    monteCarloResult.iterations) *
                                                    100
                                                )
                                              : 0;
                                          return (
                                            <td
                                              key={i}
                                              className="text-center py-2 px-2"
                                            >
                                              <span
                                                className={`tabular-nums ${
                                                  pct > 30
                                                    ? 'text-emerald-400 font-bold'
                                                    : pct > 15
                                                      ? 'text-sky-400'
                                                      : pct > 5
                                                        ? 'text-neutral-300'
                                                        : 'text-neutral-600'
                                                }`}
                                              >
                                                {pct > 0 ? `${pct}%` : '-'}
                                              </span>
                                            </td>
                                          );
                                        }
                                      )}
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                        {tx.historyHeading}
                      </h3>
                      {simHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSimHistory([])}
                          className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                        >
                          {tx.clearHistory}
                        </button>
                      )}
                    </div>
                    {simHistory.length === 0 ? (
                      <p className="text-sm text-neutral-500">
                        {tx.historyEmpty}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {simHistory.map((entry, idx) => (
                          <div
                            key={entry.id}
                            className="rounded-lg border border-white/10 bg-white/[0.01] p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-neutral-500">
                                  #{simHistory.length - idx}
                                </span>
                                <span className="text-xs text-neutral-400">
                                  {new Date(entry.timestamp).toLocaleString(
                                    'fr-FR',
                                    {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    }
                                  )}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                  {FORMAT_LABELS[entry.formatType]}
                                </span>
                                <span className="text-[10px] text-neutral-500">
                                  {format(tx.teamsBoLabel, {
                                    count: entry.teamCount,
                                    bo: entry.bestOf,
                                  })}
                                </span>
                              </div>
                              <div className="flex gap-4 text-[10px]">
                                <span
                                  className="text-amber-400"
                                  title={tx.closeMatches}
                                >
                                  {format(tx.closePct, {
                                    pct: entry.competitiveness.closeMatchPct,
                                  })}
                                </span>
                                <span
                                  className="text-rose-400"
                                  title={tx.upsets}
                                >
                                  {format(tx.upsetsCount, {
                                    count: entry.competitiveness.upsets,
                                  })}
                                </span>
                              </div>
                            </div>
                            {/* Top 5 standings */}
                            <div className="flex gap-4 flex-wrap">
                              {entry.standings.slice(0, 5).map((s, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-1.5"
                                >
                                  <span
                                    className={`text-xs font-bold ${
                                      i === 0
                                        ? 'text-amber-400'
                                        : i === 1
                                          ? 'text-neutral-300'
                                          : i === 2
                                            ? 'text-orange-400'
                                            : 'text-neutral-500'
                                    }`}
                                  >
                                    {i + 1}.
                                  </span>
                                  <span className="text-xs text-neutral-300">
                                    {s.name}
                                  </span>
                                  <span className="text-[10px] text-neutral-600">
                                    {s.wins}V-{s.losses}D
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'compare' && (
                <div className="space-y-6">
                  {/* Config selector for comparison */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                      {tx.compareHeading}
                    </h3>
                    <p className="text-xs text-neutral-500 mb-4">
                      {format(tx.compareDesc, {
                        format: FORMAT_LABELS[config.formatType],
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(Object.keys(FORMAT_LABELS) as FormatType[])
                        .filter(
                          (f) => f !== config.formatType && f !== 'showmatch'
                        )
                        .map((f) => {
                          const tc =
                            f === 'single_elim' || f === 'double_elim'
                              ? [4, 8, 16, 32].includes(config.teamCount)
                                ? config.teamCount
                                : 8
                              : config.teamCount;
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() =>
                                handleCompare({
                                  formatType: f,
                                  teamCount: tc,
                                  ...(f === 'double_elim'
                                    ? { grandFinalReset: true }
                                    : {}),
                                })
                              }
                              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                compareConfig?.formatType === f
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                              }`}
                            >
                              {tx.vs} {FORMAT_LABELS[f]}
                            </button>
                          );
                        })}
                    </div>
                    {compareConfig && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCompare(compareConfig)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
                        >
                          {tx.regenerate}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompareData(null);
                            setCompareConfig(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
                        >
                          {tx.clear}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Side-by-side display */}
                  {compareData && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {/* Current config */}
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {tx.badgeCurrent}
                          </span>
                          <span className="text-sm font-semibold">
                            {FORMAT_LABELS[config.formatType]}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {format(tx.teamsBoLabel, {
                              count: teams.length,
                              bo: config.bestOf,
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400 space-y-1">
                          <div>
                            {format(tx.matchesColon, {
                              count: stages.flatMap((s) => s.matches).length,
                            })}
                          </div>
                          <div>
                            {format(tx.roundsColon, {
                              count: new Set(
                                stages
                                  .flatMap((s) => s.matches)
                                  .map(
                                    (m) => `${m.bracket_side}-${m.round_number}`
                                  )
                              ).size,
                            })}
                          </div>
                        </div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          {stages.map((stage, stageIdx) => (
                            <div key={stage.id} className="mb-4">
                              <p className="text-xs font-semibold text-purple-300 mb-2">
                                {stage.name}
                              </p>
                              <EliminationView
                                rounds={groupByRoundMemo(
                                  stage.matches,
                                  stage.stage_type === 'bracket'
                                    ? 'wb'
                                    : undefined
                                )}
                                onSimulate={
                                  getStageHandlers(stageIdx).onSimulate
                                }
                                onReset={getStageHandlers(stageIdx).onReset}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Compare config */}
                      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.02] p-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/20">
                            {tx.badgeComparison}
                          </span>
                          <span className="text-sm font-semibold">
                            {
                              FORMAT_LABELS[
                                compareConfig?.formatType ?? config.formatType
                              ]
                            }
                          </span>
                          <span className="text-xs text-neutral-500">
                            {format(tx.teamsBoLabel, {
                              count: compareData.teams.length,
                              bo: config.bestOf,
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400 space-y-1">
                          <div>
                            {format(tx.matchesColon, {
                              count: compareData.stages.flatMap(
                                (s) => s.matches
                              ).length,
                            })}
                          </div>
                          <div>
                            {format(tx.roundsColon, {
                              count: new Set(
                                compareData.stages
                                  .flatMap((s) => s.matches)
                                  .map(
                                    (m) => `${m.bracket_side}-${m.round_number}`
                                  )
                              ).size,
                            })}
                          </div>
                        </div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          {compareData.stages.map((stage) => (
                            <div key={stage.id} className="mb-4">
                              <p className="text-xs font-semibold text-sky-300 mb-2">
                                {stage.name}
                              </p>
                              <EliminationView
                                rounds={groupByRoundMemo(
                                  stage.matches,
                                  stage.stage_type === 'bracket'
                                    ? 'wb'
                                    : undefined
                                )}
                                onSimulate={noopSimAction}
                                onReset={noopSimAction}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeline' && occurrences.length > 1 && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-6 uppercase tracking-wider text-neutral-400">
                      {tx.calendarHeading}
                    </h3>
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-purple-500/20" />

                      <div className="space-y-6">
                        {occurrences.map((occ, i) => {
                          const allMatches = occ.stages.flatMap(
                            (s) => s.matches
                          );
                          const finished = allMatches.filter(
                            (m) => m.status === 'finished'
                          ).length;
                          const total = allMatches.length;
                          const firstDate = allMatches.find(
                            (m) => m.scheduled_at
                          )?.scheduled_at;
                          const lastDate = [...allMatches]
                            .reverse()
                            .find((m) => m.scheduled_at)?.scheduled_at;
                          const pct =
                            total > 0
                              ? Math.round((finished / total) * 100)
                              : 0;

                          return (
                            <div key={i} className="flex gap-4 items-start">
                              {/* Dot on the line */}
                              <div
                                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs font-bold ${
                                  activeOccurrence === i
                                    ? 'bg-purple-600 border-purple-400 text-white'
                                    : pct === 100
                                      ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                                      : 'bg-neutral-800 border-neutral-600 text-neutral-400'
                                }`}
                              >
                                {i + 1}
                              </div>

                              {/* Card */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveOccurrence(i);
                                  setActiveTab('bracket');
                                }}
                                className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                                  activeOccurrence === i
                                    ? 'border-purple-500/30 bg-purple-500/5'
                                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold">
                                    {occ.label}
                                  </span>
                                  <span
                                    className={`text-xs font-bold tabular-nums ${
                                      pct === 100
                                        ? 'text-emerald-400'
                                        : pct > 0
                                          ? 'text-amber-400'
                                          : 'text-neutral-500'
                                    }`}
                                  >
                                    {pct}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-neutral-400">
                                  {firstDate && (
                                    <span>
                                      {format(tx.startLabel, {
                                        date: formatMatchDate(firstDate),
                                      })}
                                    </span>
                                  )}
                                  {lastDate && lastDate !== firstDate && (
                                    <span>
                                      {format(tx.endLabel, {
                                        date: formatMatchDate(lastDate),
                                      })}
                                    </span>
                                  )}
                                  <span>
                                    {format(tx.matchesInline, { count: total })}
                                  </span>
                                  <span>
                                    {format(tx.teamsInline, {
                                      count: occ.teams.length,
                                    })}
                                  </span>
                                </div>
                                {/* Progress bar */}
                                <div className="mt-2 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Summary across all occurrences */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">
                      {tx.globalSummary}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                          {tx.totalMatches}
                        </div>
                        <div className="text-2xl font-bold mt-1">
                          {occurrences.reduce(
                            (sum, occ) =>
                              sum + occ.stages.flatMap((s) => s.matches).length,
                            0
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                          {tx.summaryFinished}
                        </div>
                        <div className="text-2xl font-bold mt-1 text-emerald-400">
                          {occurrences.reduce(
                            (sum, occ) =>
                              sum +
                              occ.stages
                                .flatMap((s) => s.matches)
                                .filter((m) => m.status === 'finished').length,
                            0
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                          {tx.totalDuration}
                        </div>
                        <div className="text-2xl font-bold mt-1 text-purple-400">
                          {(() => {
                            const allDates = occurrences.flatMap(
                              (occ) =>
                                occ.stages
                                  .flatMap((s) => s.matches)
                                  .map((m) => m.scheduled_at)
                                  .filter(Boolean) as string[]
                            );
                            if (allDates.length < 2) return '—';
                            const sorted = allDates.sort();
                            const first = new Date(sorted[0]);
                            const last = new Date(sorted[sorted.length - 1]);
                            const days = Math.ceil(
                              (last.getTime() - first.getTime()) /
                                (1000 * 60 * 60 * 24)
                            );
                            return `${days}j`;
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                          {tx.uniqueTeams}
                        </div>
                        <div className="text-2xl font-bold mt-1 text-sky-400">
                          {
                            new Set(
                              occurrences.flatMap((occ) =>
                                occ.teams.map((t) => t.name)
                              )
                            ).size
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default TournamentSimulatorPage;
