// features/admin/simulator/hooks/useSimulatorBuild.ts — construction des
// occurrences simulées : génération (formulaire), lancement du mode quiz et
// ouverture dans l'éditeur, comparaison de format, chargement des équipes
// réelles.
//
// Callbacks DÉPLACÉS À L'IDENTIQUE depuis pages/admin/tournament-simulator.tsx
// (mêmes corps, mêmes dépendances, même graine) : seuls les accès à l'état de
// la page deviennent des paramètres. La page reste propriétaire de tous les
// useState et des refs.

import { useCallback, type RefObject } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import { tournamentsUrls } from '@/features/admin/tournaments/client';
import {
  simulateMatch,
  resolveByes,
  simulateBracketToCompletion,
  computeCompetitiveness,
} from '@/utils/simulator';
import type { SimTeam, SimStage, ScheduleConfig } from '@/utils/simulator';
import {
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
import type { SimConfig, OccurrenceData } from '@/utils/simulatorSerialization';
import type { QuizOutcome } from '@/components/admin/simulator/QuizMode';
import type { Setter, SimulatorDict, SimulatorTab } from './simulatorHookTypes';

export type SimulatorBuildDeps = {
  tx: SimulatorDict;
  config: SimConfig;
  occurrences: OccurrenceData[];
  activeOccurrence: number;
  quizStashRef: RefObject<OccurrenceData | null>;
  setMapPool: Setter<string[]>;
  setOccurrences: Setter<OccurrenceData[]>;
  setActiveOccurrence: Setter<number>;
  setGenerated: Setter<boolean>;
  setActiveTab: Setter<SimulatorTab>;
  setViewMode: Setter<'form' | 'slides'>;
  setCompareConfig: Setter<Partial<SimConfig> | null>;
  setCompareData: Setter<{ stages: SimStage[]; teams: SimTeam[] } | null>;
  setLoadingRealTeams: Setter<boolean>;
  setRealTeamsError: Setter<string | null>;
};

export function useSimulatorBuild(deps: SimulatorBuildDeps) {
  const {
    tx,
    config,
    occurrences,
    activeOccurrence,
    quizStashRef,
    setMapPool,
    setOccurrences,
    setActiveOccurrence,
    setGenerated,
    setActiveTab,
    setViewMode,
    setCompareConfig,
    setCompareData,
    setLoadingRealTeams,
    setRealTeamsError,
  } = deps;

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
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

  /**
   * Quiz/slides mode: build one occurrence, simulate it to completion, and
   * derive the reveal payload (champion, podium, fun stats). The simulated
   * occurrence is stashed so "Open in editor" commits exactly what was shown.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et ref stables reçus en paramètre)
  const handleQuizLaunch = useCallback((): QuizOutcome => {
    resetFakeIdCounter();
    const pool = FAKE_MAPS.slice(0, config.mapPoolSize);
    const occSchedule: ScheduleConfig = { ...config.schedule };
    const { stages: builtStages, teams: builtTeams } = generateOneOccurrence(
      pool,
      occSchedule
    );

    // Mirror handleSimulateAll's per-stage-type simulation.
    const simStages: SimStage[] = builtStages.map((stage) => {
      if (stage.stage_type === 'bracket' || stage.stage_type === 'showmatch') {
        return {
          ...stage,
          matches: simulateBracketToCompletion(stage.matches),
        };
      }
      return {
        ...stage,
        matches: resolveByes(
          stage.matches.map((m) =>
            m.status === 'pending' ? simulateMatch(m) : m
          )
        ),
      };
    });

    const allMatches = simStages.flatMap((s) => s.matches);

    // Standings by wins then map-diff (same convention as
    // simulateFullTournament), computed off the *displayed* simulation so the
    // announced champion matches the bracket the user can open.
    const wins = new Map<string, number>();
    const mapDiff = new Map<string, number>();
    let matchesPlayed = 0;
    let mapsPlayed = 0;
    for (const m of allMatches) {
      if (m.status !== 'finished' || !m.winner_team_id) continue;
      wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
      if (m.team1_id && m.team1_score != null && m.team2_score != null) {
        matchesPlayed += 1;
        mapsPlayed += m.team1_score + m.team2_score;
        mapDiff.set(
          m.team1_id,
          (mapDiff.get(m.team1_id) ?? 0) + m.team1_score - m.team2_score
        );
        mapDiff.set(
          m.team2_id!,
          (mapDiff.get(m.team2_id!) ?? 0) + m.team2_score - m.team1_score
        );
      }
    }
    const standings = [...builtTeams].sort(
      (a, b) =>
        (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0) ||
        (mapDiff.get(b.id) ?? 0) - (mapDiff.get(a.id) ?? 0)
    );
    // A finished grand final (double elim) decides the title outright; every
    // other format falls back to the wins/map-diff standings leader.
    const grandFinal = allMatches.find(
      (m) =>
        m.bracket_side === 'final' &&
        m.status === 'finished' &&
        m.winner_team_id
    );
    const championId = grandFinal?.winner_team_id ?? standings[0]?.id ?? null;
    const champion = builtTeams.find((t) => t.id === championId) ?? null;
    const podium = [
      ...(champion ? [champion] : []),
      ...standings.filter((t) => t.id !== championId),
    ].slice(0, 3);

    const { upsets } = computeCompetitiveness(allMatches, builtTeams);

    quizStashRef.current = {
      index: 0,
      label: tx.tournamentLabel,
      startDate: occSchedule.startDate,
      stages: simStages,
      teams: builtTeams,
    };
    setMapPool(pool);

    return {
      championName: champion?.name ?? null,
      championSeed: champion?.seed ?? null,
      podium: podium.map((t) => ({ name: t.name, seed: t.seed })),
      matchesPlayed,
      mapsPlayed,
      upsets,
      teamCount: builtTeams.length,
    };
  }, [config, generateOneOccurrence, tx]);

  /** Commit the last quiz-simulated occurrence into the form editor. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et ref stables reçus en paramètre)
  const handleQuizOpenInEditor = useCallback(() => {
    const stash = quizStashRef.current;
    if (!stash) return;
    setOccurrences([stash]);
    setActiveOccurrence(0);
    setGenerated(true);
    setActiveTab('bracket');
    setViewMode('form');
  }, []);

  const handleResetAll = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  /** Generate comparison data with a different format */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
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

  /** Fetch real teams from Supabase and replace generated teams */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleLoadRealTeams = useCallback(async () => {
    setLoadingRealTeams(true);
    setRealTeamsError(null);
    try {
      const res = await fetch(tournamentsUrls.activeTeams(config.teamCount));
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

  return {
    handleGenerate,
    handleQuizLaunch,
    handleQuizOpenInEditor,
    handleResetAll,
    handleCompare,
    handleLoadRealTeams,
  };
}
