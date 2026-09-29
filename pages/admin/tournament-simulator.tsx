// pages/admin/tournament-simulator.tsx
// Simulateur visuel de tournoi avec données fictives pour tester les configurations
//
// Découpe (lot 9A) : les handlers vivent dans features/admin/simulator/hooks/
// (corps déplacés à l'identique), les blocs d'affichage dans
// features/admin/simulator/ui/. La page garde tous les useState et les refs.

import { useState, useMemo, useRef } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Tabs, {
  tabButtonId,
  tabPanelId,
  type TabItem,
} from '@/components/admin/Tabs';
import type { FormatType } from '@/types/admin';
import type { MatchForGraph } from '@/types/bracket';
import { buildBracketGraph } from '@/utils/bracket/buildGraph';
import { computeBracketLayout } from '@/utils/bracket/computePaths';
import type { SimTeam, SimStage, MonteCarloResult } from '@/utils/simulator';
import type { SimConfig, OccurrenceData } from '@/utils/simulatorSerialization';
import { SimulatorTimelineTab } from '@/components/admin/simulator/SimulatorTimelineTab';
import { SimulatorCompareTab } from '@/components/admin/simulator/SimulatorCompareTab';
import { SimulatorBracketTab } from '@/components/admin/simulator/SimulatorBracketTab';
import { SimulatorMapsTab } from '@/components/admin/simulator/SimulatorMapsTab';
import { SimulatorTeamsTab } from '@/components/admin/simulator/SimulatorTeamsTab';
import {
  SimulatorHistoryTab,
  type SimHistoryEntry,
} from '@/components/admin/simulator/SimulatorHistoryTab';
import { SimulatorMonteCarloTab } from '@/components/admin/simulator/SimulatorMonteCarloTab';
import { SimulatorStatsTab } from '@/components/admin/simulator/SimulatorStatsTab';
import { computeSimStats } from '@/utils/simulatorStats';
import QuizMode from '@/components/admin/simulator/QuizMode';
import nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import type { SimulatorTab } from '@/features/admin/simulator/hooks/simulatorHookTypes';
import { useSimulatorUndo } from '@/features/admin/simulator/hooks/useSimulatorUndo';
import { useSimulatorBuild } from '@/features/admin/simulator/hooks/useSimulatorBuild';
import { useSimulatorMatchActions } from '@/features/admin/simulator/hooks/useSimulatorMatchActions';
import { useSimulatorSessionActions } from '@/features/admin/simulator/hooks/useSimulatorSessionActions';
import SimulatorHeader from '@/features/admin/simulator/ui/SimulatorHeader';
import SimulatorToolbar from '@/features/admin/simulator/ui/SimulatorToolbar';
import SimulatorCreateFeedback from '@/features/admin/simulator/ui/SimulatorCreateFeedback';
import SimulatorConfigPanel from '@/features/admin/simulator/ui/SimulatorConfigPanel';
import SimulatorOverview from '@/features/admin/simulator/ui/SimulatorOverview';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

const SIM_TABS_ID_BASE = 'tournament-simulator';
function TournamentSimulatorPage() {
  const tx = useAdminT(nsAdminTournamentSimulator);
  const { addToast } = useToast();
  const { mutate: simMutate } = useIdempotentMutation();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const animatingRef = useRef(false);
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
  const [activeTab, setActiveTab] = useState<SimulatorTab>('bracket');
  const [configCollapsed, setConfigCollapsed] = useState(false);

  // Two ways to drive the same engine: the dense "form" panel, or a guided
  // "quiz/slides" deck (QuizMode) that walks through the config one question at
  // a time and ends on an animated champion reveal.
  const [viewMode, setViewMode] = useState<'form' | 'slides'>('form');
  // The quiz builds + simulates an occurrence off to the side; we stash it here
  // so "Open in editor" can commit exactly what the reveal showed.
  const quizStashRef = useRef<OccurrenceData | null>(null);

  // Convenience accessors for current occurrence
  const stages = useMemo(
    () => occurrences[activeOccurrence]?.stages ?? [],
    [occurrences, activeOccurrence]
  );
  const teams = useMemo(
    () => occurrences[activeOccurrence]?.teams ?? [],
    [occurrences, activeOccurrence]
  );

  const { setStages, handleUndo, handleRedo } = useSimulatorUndo({
    MAX_UNDO,
    occurrences,
    setOccurrences,
    activeOccurrence,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
  });

  // Single elimination now supports non-power-of-2 fields via byes (the top
  // seeds get a first-round pass, e.g. 6, 12, 24 teams). Double elimination
  // stays power-of-2 — an uneven lower bracket would leave phantom matches.
  const validCountsFor = (f: FormatType): number[] => {
    if (f === 'showmatch') return [2];
    if (f === 'single_elim') return [4, 6, 8, 12, 16, 24, 32];
    if (f === 'double_elim') return [4, 8, 16, 32];
    return [4, 6, 8, 10, 12, 16];
  };
  const validTeamCounts = validCountsFor(config.formatType);

  const {
    handleGenerate,
    handleQuizLaunch,
    handleQuizOpenInEditor,
    handleResetAll,
    handleCompare,
    handleLoadRealTeams,
  } = useSimulatorBuild({
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
  });

  const {
    handleSimulateAll,
    handleSimulateNextRound,
    handleSimulateAnimated,
    getStageHandlers,
    groupByRoundMemo,
  } = useSimulatorMatchActions({ setStages, animatingRef, setAnimating });

  const {
    handleImportConfig,
    handleCopyResults,
    handlePrint,
    handleReorderTeams,
    handleUpdateTeamStrength,
    handleMonteCarlo,
    saveToHistory,
    handleCreateTournament,
  } = useSimulatorSessionActions({
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
  });

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
  const stats = useMemo(() => computeSimStats(stages, teams), [stages, teams]);

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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="mx-auto max-w-[1600px]">
          <SimulatorHeader
            tx={tx}
            viewMode={viewMode}
            onViewMode={setViewMode}
          />

          {generated && viewMode === 'form' && (
            <SimulatorToolbar
              tx={tx}
              animating={animating}
              creatingTournament={creatingTournament}
              undoCount={undoStack.length}
              redoCount={redoStack.length}
              onNextRound={handleSimulateNextRound}
              onAnimated={handleSimulateAnimated}
              onSimulateAll={handleSimulateAll}
              onResetAll={handleResetAll}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSaveHistory={saveToHistory}
              onCreateTournament={handleCreateTournament}
              onCopyResults={handleCopyResults}
              onPrint={handlePrint}
            />
          )}

          {/* Tournament creation feedback */}
          <SimulatorCreateFeedback
            tx={tx}
            result={createTournamentResult}
            error={createTournamentError}
            onCloseResult={() => setCreateTournamentResult(null)}
            onCloseError={() => setCreateTournamentError(null)}
          />

          {/* Guided quiz/slides mode — same engine, playful reveal */}
          {viewMode === 'slides' && (
            <QuizMode
              config={config}
              setConfig={setConfig}
              validCountsFor={validCountsFor}
              onLaunch={handleQuizLaunch}
              onOpenInEditor={handleQuizOpenInEditor}
            />
          )}

          {viewMode === 'form' && (
            <>
              <SimulatorConfigPanel
                tx={tx}
                config={config}
                setConfig={setConfig}
                validCountsFor={validCountsFor}
                validTeamCounts={validTeamCounts}
                configCollapsed={configCollapsed}
                setConfigCollapsed={setConfigCollapsed}
                importFileRef={importFileRef}
                onImportConfig={handleImportConfig}
                importError={importError}
                onGenerate={handleGenerate}
                onLoadRealTeams={handleLoadRealTeams}
                loadingRealTeams={loadingRealTeams}
                realTeamsError={realTeamsError}
              />

              {/* Generated content */}
              {generated && (
                <>
                  <SimulatorOverview
                    tx={tx}
                    occurrences={occurrences}
                    activeOccurrence={activeOccurrence}
                    onSelectOccurrence={(i) => setActiveOccurrence(i)}
                    teamCount={teams.length}
                    stats={stats}
                  />

                  {/* Tabs */}
                  <Tabs
                    tabs={
                      [
                        { id: 'bracket', label: tx.tabBracket },
                        { id: 'teams', label: tx.tabTeams },
                        { id: 'maps', label: tx.tabMaps },
                        { id: 'stats', label: tx.tabStats },
                        { id: 'monte-carlo', label: tx.tabMonteCarlo },
                        {
                          id: 'history',
                          label:
                            simHistory.length > 0
                              ? format(tx.tabHistoryCount, {
                                  count: simHistory.length,
                                })
                              : tx.tabHistory,
                        },
                        { id: 'compare', label: tx.tabCompare },
                        ...(occurrences.length > 1
                          ? [{ id: 'timeline', label: tx.tabTimeline }]
                          : []),
                      ] satisfies TabItem[]
                    }
                    active={activeTab}
                    onChange={(id) => setActiveTab(id as typeof activeTab)}
                    ariaLabel={tx.tablistLabel}
                    idBase={SIM_TABS_ID_BASE}
                    className="mb-6"
                  />

                  {/* Tab content */}
                  <div
                    role="tabpanel"
                    id={tabPanelId(SIM_TABS_ID_BASE, activeTab)}
                    aria-labelledby={tabButtonId(SIM_TABS_ID_BASE, activeTab)}
                  >
                    {activeTab === 'bracket' && (
                      <SimulatorBracketTab
                        stages={stages}
                        getStageHandlers={getStageHandlers}
                        groupByRound={groupByRoundMemo}
                      />
                    )}

                    {activeTab === 'teams' && (
                      <SimulatorTeamsTab
                        teams={teams}
                        stats={stats}
                        onReorder={handleReorderTeams}
                        onStrengthChange={handleUpdateTeamStrength}
                      />
                    )}

                    {activeTab === 'maps' && (
                      <SimulatorMapsTab mapPool={mapPool} stats={stats} />
                    )}

                    {activeTab === 'stats' && (
                      <SimulatorStatsTab
                        stages={stages}
                        teams={teams}
                        stats={stats}
                      />
                    )}

                    {activeTab === 'monte-carlo' && (
                      <SimulatorMonteCarloTab
                        stages={stages}
                        teams={teams}
                        result={monteCarloResult}
                        running={monteCarloRunning}
                        iterations={monteCarloIterations}
                        onIterationsChange={setMonteCarloIterations}
                        onRun={handleMonteCarlo}
                      />
                    )}

                    {activeTab === 'history' && (
                      <SimulatorHistoryTab
                        entries={simHistory}
                        onClear={() => setSimHistory([])}
                      />
                    )}

                    {activeTab === 'compare' && (
                      <SimulatorCompareTab
                        config={config}
                        stages={stages}
                        teams={teams}
                        compareConfig={compareConfig}
                        compareData={compareData}
                        validCountsFor={validCountsFor}
                        getStageHandlers={getStageHandlers}
                        groupByRound={groupByRoundMemo}
                        onCompare={handleCompare}
                        onClear={() => {
                          setCompareData(null);
                          setCompareConfig(null);
                        }}
                      />
                    )}

                    {activeTab === 'timeline' && occurrences.length > 1 && (
                      <SimulatorTimelineTab
                        occurrences={occurrences}
                        activeOccurrence={activeOccurrence}
                        onSelect={(i) => {
                          setActiveOccurrence(i);
                          setActiveTab('bracket');
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default TournamentSimulatorPage;
