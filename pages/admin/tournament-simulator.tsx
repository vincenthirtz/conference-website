// pages/admin/tournament-simulator.tsx
// Simulateur visuel de tournoi avec données fictives pour tester les configurations

import { useState, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import type { MatchStatus, FormatType, StageType } from '@/types/admin';
import type { MatchForGraph } from '@/types/bracket';
import { buildBracketGraph } from '@/utils/bracket/buildGraph';
import { computeBracketLayout } from '@/utils/bracket/computePaths';
import {
  computeSchedule,
  bracketSeedOrder,
  getBestOfForRound,
  simulateMatch,
  propagateBracket,
  simulateFullTournament,
  runMonteCarlo,
  computeCompetitiveness,
  computeWinProbability,
  swissPairByRecord,
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

export const getServerSideProps = withStaffPage('manager');

/* ------------------------------------------------------------------ */
/*  Scheduling helpers                                                  */
/* ------------------------------------------------------------------ */

type OccurrenceConfig = {
  enabled: boolean;
  count: number;               // number of occurrences
  frequency: 'weekly' | 'biweekly' | 'monthly';
};

const FREQUENCY_LABELS: Record<OccurrenceConfig['frequency'], string> = {
  weekly: 'Hebdomadaire',
  biweekly: 'Bi-mensuel',
  monthly: 'Mensuel',
};

const FREQUENCY_DAYS: Record<OccurrenceConfig['frequency'], number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Format a date for display */
function formatMatchDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/* ------------------------------------------------------------------ */
/*  Fake data generators                                               */
/* ------------------------------------------------------------------ */

const FAKE_TEAM_NAMES = [
  'Phoenix Rising', 'Shadow Wolves', 'Iron Titans', 'Crimson Storm',
  'Arctic Foxes', 'Thunder Hawks', 'Neon Vipers', 'Golden Eagles',
  'Dark Knights', 'Silver Sharks', 'Blazing Comets', 'Frost Giants',
  'Storm Riders', 'Night Owls', 'Solar Flare', 'Lunar Eclipse',
  'Cyber Dragoons', 'Omega Squad', 'Emerald Lions', 'Sapphire Wings',
  'Ruby Sentinels', 'Onyx Panthers', 'Platinum Wolves', 'Diamond Edge',
  'Cobalt Fury', 'Obsidian Blade', 'Amber Wasps', 'Jade Serpents',
  'Scarlet Reapers', 'Titanium Guard', 'Vortex Titans', 'Zenith Force',
];

const FAKE_PLAYER_FIRST = [
  'Lucas', 'Hugo', 'Théo', 'Nathan', 'Léo', 'Arthur', 'Raphaël', 'Louis',
  'Jade', 'Emma', 'Léa', 'Chloé', 'Alice', 'Lina', 'Sarah', 'Inès',
  'Karim', 'Yuki', 'Chen', 'Erik', 'Sven', 'Pavel', 'Marco', 'Dani',
];

const FAKE_PLAYER_LAST = [
  'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit',
  'Durand', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia', 'Müller',
  'Kim', 'Park', 'Santos', 'Jensen', 'Novak', 'Fischer',
];

const FAKE_MAPS = [
  'Hanamura', 'King\'s Row', 'Numbani', 'Dorado', 'Temple of Anubis',
  'Volskaya', 'Nepal', 'Lijiang Tower', 'Ilios', 'Oasis',
  'Busan', 'Junkertown', 'Rialto', 'Havana', 'Route 66',
  'Eichenwalde', 'Hollywood', 'Watchpoint: Gibraltar', 'Blizzard World', 'Midtown',
];

let _idCounter = 0;
function fakeId() { return `sim-${++_idCounter}-${Math.random().toString(36).slice(2, 8)}`; }

function generateTeams(count: number, playersPerTeam: number): SimTeam[] {
  const shuffled = [...FAKE_TEAM_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({
    id: fakeId(),
    name: shuffled[i % shuffled.length],
    short_name: shuffled[i % shuffled.length].split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase(),
    logo_url: null,
    seed: i + 1,
    // Higher seeds get higher default strength (seed 1 ≈ 75, last seed ≈ 35)
    strength: Math.round(75 - ((i / Math.max(count - 1, 1)) * 40)),
    players: Array.from({ length: playersPerTeam }, () => {
      const first = FAKE_PLAYER_FIRST[Math.floor(Math.random() * FAKE_PLAYER_FIRST.length)];
      const last = FAKE_PLAYER_LAST[Math.floor(Math.random() * FAKE_PLAYER_LAST.length)];
      return { name: `${first} ${last}`, battleTag: `${first}#${Math.floor(1000 + Math.random() * 9000)}` };
    }),
  }));
}

function pickMaps(count: number, pool: string[]): SimMap[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const modes = ['Contrôle', 'Escorte', 'Hybride', 'Assaut', 'Push'];
  return shuffled.slice(0, count).map(name => ({
    name,
    mode: modes[Math.floor(Math.random() * modes.length)],
  }));
}

/* ------------------------------------------------------------------ */
/*  Bracket generators                                                 */
/* ------------------------------------------------------------------ */

function generateSingleElim(
  teams: SimTeam[], bestOf: number, mapPool: string[],
  schedule: ScheduleConfig, escalation: EscalationConfig,
): SimStage {
  const size = teams.length;
  const totalRounds = Math.log2(size);
  const matches: SimMatch[] = [];
  let matchIndex = 0;

  // Collect all round numbers for scheduling
  const roundNumbers: number[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      roundNumbers.push(r + 1);
    }
  }

  const scheduledDates = computeSchedule(roundNumbers.length, roundNumbers, schedule);

  let schedIdx = 0;
  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    let roundName: string;
    if (r + 1 === totalRounds) roundName = 'Finale';
    else if (r + 1 === totalRounds - 1) roundName = 'Demi-finales';
    else if (r + 1 === totalRounds - 2 && totalRounds >= 3) roundName = 'Quarts de finale';
    else roundName = `Round ${r + 1}`;

    const roundBo = getBestOfForRound(r + 1, totalRounds, escalation, bestOf);

    for (let m = 0; m < matchesInRound; m++) {
      const isFirstRound = r === 0;
      const seedIdx = bracketSeedOrder(size);
      const t1 = isFirstRound ? teams[seedIdx[m * 2]] : null;
      const t2 = isFirstRound ? teams[seedIdx[m * 2 + 1]] : null;

      matches.push({
        id: fakeId(),
        round_number: r + 1,
        round_name: roundName,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${roundBo}`,
        best_of: roundBo,
        team1: t1 ?? null,
        team2: t2 ?? null,
        team1_id: t1?.id ?? null,
        team2_id: t2?.id ?? null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: scheduledDates[schedIdx] ?? null,
        maps: pickMaps(roundBo, mapPool),
        bracket_side: 'wb',
        next_match_win_idx: null,
        next_match_win_slot: null,
        next_match_lose_idx: null,
        next_match_lose_slot: null,
        next_match_win_id: null,
        next_match_lose_id: null,
        locked: false,
      });
      matchIndex++;
      schedIdx++;
    }
  }

  // Fix next_match pointers (index + id)
  let offset = 0;
  for (let r = 0; r < totalRounds - 1; r++) {
    const countInRound = size / Math.pow(2, r + 1);
    const nextOffset = offset + countInRound;
    for (let m = 0; m < countInRound; m++) {
      const nextIdx = nextOffset + Math.floor(m / 2);
      const nextSlot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
      matches[offset + m].next_match_win_idx = nextIdx;
      matches[offset + m].next_match_win_slot = nextSlot;
      matches[offset + m].next_match_win_id = matches[nextIdx].id;
    }
    offset = nextOffset;
  }

  return {
    id: fakeId(),
    name: 'Single Elimination',
    stage_type: 'bracket',
    matches,
  };
}

function generateDoubleElim(
  teams: SimTeam[], bestOf: number, mapPool: string[],
  schedule: ScheduleConfig, escalation: EscalationConfig, grandFinalReset: boolean,
): SimStage {
  // WB matches
  const single = generateSingleElim(teams, bestOf, mapPool, schedule, escalation);
  const wbMatches = single.matches.map(m => ({ ...m, bracket_side: 'wb' as const }));

  // LB matches
  const size = teams.length;
  const wbRounds = Math.log2(size);
  const lbRoundsCount = 2 * (wbRounds - 1);
  const lbMatches: SimMatch[] = [];
  let lbTeams = size / 2;

  for (let lbR = 1; lbR <= lbRoundsCount; lbR++) {
    let count: number;
    if (lbR === 1) { count = lbTeams / 2; lbTeams = lbTeams / 2; }
    else if (lbR % 2 === 0) { count = lbTeams; }
    else { count = lbTeams / 2; lbTeams = lbTeams / 2; }

    const roundName = lbR === lbRoundsCount ? 'LB Finale' : `LB Round ${lbR}`;
    for (let m = 0; m < count; m++) {
      lbMatches.push({
        id: fakeId(),
        round_number: lbR,
        round_name: roundName,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: null,
        team2: null,
        team1_id: null,
        team2_id: null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'lb',
        next_match_win_idx: null,
        next_match_win_slot: null,
        next_match_lose_idx: null,
        next_match_lose_slot: null,
        next_match_win_id: null,
        next_match_lose_id: null,
        locked: false,
      });
    }
  }

  // Grand Final
  const gfMatch: SimMatch = {
    id: fakeId(),
    round_number: 1,
    round_name: 'Grande Finale',
    position_in_round: 1,
    status: 'pending',
    match_format: `bo${bestOf}`,
    best_of: bestOf,
    team1: null, team2: null,
    team1_id: null, team2_id: null,
    team1_score: null, team2_score: null,
    winner_team_id: null,
    scheduled_at: null,
    maps: pickMaps(bestOf, mapPool),
    bracket_side: 'final',
    next_match_win_idx: null, next_match_win_slot: null,
    next_match_lose_idx: null, next_match_lose_slot: null,
    next_match_win_id: null, next_match_lose_id: null,
    locked: false,
  };

  const allMatches = [...wbMatches, ...lbMatches, gfMatch];

  if (grandFinalReset) {
    allMatches.push({
      ...gfMatch,
      id: fakeId(),
      round_name: 'Grande Finale Reset',
      maps: pickMaps(bestOf, mapPool),
    });
  }

  return {
    id: fakeId(),
    name: 'Double Elimination',
    stage_type: 'bracket',
    matches: allMatches,
  };
}

function generateSwiss(
  teams: SimTeam[], rounds: number, bestOf: number, mapPool: string[],
  schedule: ScheduleConfig,
): SimStage {
  const matches: SimMatch[] = [];
  const roundNumbers: number[] = [];
  // Pre-compute match count for scheduling
  for (let r = 0; r < rounds; r++) {
    const matchesInRound = Math.floor(teams.length / 2);
    for (let m = 0; m < matchesInRound; m++) {
      roundNumbers.push(r + 1);
    }
  }
  const scheduledDates = computeSchedule(roundNumbers.length, roundNumbers, schedule);
  let schedIdx = 0;

  for (let r = 0; r < rounds; r++) {
    // Round 1: random pairing. Later rounds: pair by record (W-L)
    let pairings: { t1: SimTeam; t2: SimTeam }[];
    if (r === 0) {
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      pairings = [];
      for (let m = 0; m < Math.floor(shuffled.length / 2); m++) {
        pairings.push({ t1: shuffled[m * 2], t2: shuffled[m * 2 + 1] });
      }
    } else {
      // Simulate previous rounds to get records for pairing
      const simulated = matches.map(m => m.status === 'pending' ? simulateMatch(m) : m);
      const swissPairs = swissPairByRecord(teams, simulated);
      pairings = swissPairs.map(p => ({ t1: teams[p.team1Idx], t2: teams[p.team2Idx] }));
    }

    for (let m = 0; m < pairings.length; m++) {
      const { t1, t2 } = pairings[m];
      matches.push({
        id: fakeId(),
        round_number: r + 1,
        round_name: `Round ${r + 1}`,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: t1,
        team2: t2,
        team1_id: t1.id,
        team2_id: t2.id,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: scheduledDates[schedIdx] ?? null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'none',
        next_match_win_idx: null, next_match_win_slot: null,
        next_match_lose_idx: null, next_match_lose_slot: null,
        next_match_win_id: null, next_match_lose_id: null,
        locked: false,
      });
      schedIdx++;
    }
  }
  return { id: fakeId(), name: 'Swiss System', stage_type: 'swiss', matches };
}

function generateRoundRobin(
  teams: SimTeam[], bestOf: number, mapPool: string[],
  schedule: ScheduleConfig,
): SimStage {
  // Pre-build matches to get round numbers for scheduling
  const rawMatches: { i: number; j: number; round: number }[] = [];
  let round = 1;
  let count = 0;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      rawMatches.push({ i, j, round });
      count++;
      if (count % Math.floor(teams.length / 2) === 0) round++;
    }
  }

  const roundNumbers = rawMatches.map(m => m.round);
  const scheduledDates = computeSchedule(rawMatches.length, roundNumbers, schedule);

  const matches: SimMatch[] = rawMatches.map((raw, idx): SimMatch => ({
    id: fakeId(),
    round_number: raw.round,
    round_name: `Journée ${raw.round}`,
    position_in_round: idx + 1,
    status: 'pending' as MatchStatus,
    match_format: `bo${bestOf}`,
    best_of: bestOf,
    team1: teams[raw.i],
    team2: teams[raw.j],
    team1_id: teams[raw.i].id,
    team2_id: teams[raw.j].id,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: scheduledDates[idx] ?? null,
    maps: pickMaps(bestOf, mapPool),
    bracket_side: 'none' as const,
    next_match_win_idx: null, next_match_win_slot: null,
    next_match_lose_idx: null, next_match_lose_slot: null,
    next_match_win_id: null, next_match_lose_id: null,
    locked: false,
  }));

  return { id: fakeId(), name: 'Round Robin', stage_type: 'round_robin', matches };
}

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

/* ------------------------------------------------------------------ */
/*  UI Components                                                      */
/* ------------------------------------------------------------------ */

const CARD_H = 82;
const CARD_W = 220;
const GAP_BASE = 16;
const CONNECTOR_W = 48;
const HEADER_H = 48;

function SimMatchCard({
  match,
  onSimulate,
  onReset,
  onToggleLock,
}: {
  match: SimMatch;
  onSimulate: () => void;
  onReset: () => void;
  onToggleLock?: () => void;
}) {
  const statusCfg = STATUS_CONFIG[match.status];
  const t1Name = match.team1?.short_name ?? match.team1?.name ?? 'TBD';
  const t2Name = match.team2?.short_name ?? match.team2?.name ?? 'TBD';
  const w1 = match.winner_team_id === match.team1_id && !!match.winner_team_id;
  const w2 = match.winner_team_id === match.team2_id && !!match.winner_team_id;
  const winProb = match.team1 && match.team2 ? computeWinProbability(match.team1, match.team2) : null;

  return (
    <div className={`rounded-xl border overflow-hidden bg-[#12121a] transition-all duration-300 ${
      match.locked
        ? 'border-amber-500/30 ring-1 ring-amber-500/10'
        : match.status === 'finished'
          ? 'border-emerald-500/20 shadow-[0_0_12px_-3px_rgba(16,185,129,0.15)]'
          : 'border-white/[0.06] hover:border-purple-500/20'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.05]" style={{ height: 26 }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-neutral-600 font-mono">#{match.position_in_round}</span>
          {match.scheduled_at && (
            <span className="text-[9px] text-purple-300/70 font-mono" title={match.scheduled_at}>
              {formatMatchDate(match.scheduled_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {match.match_format && (
            <span className="text-[9px] font-semibold uppercase text-neutral-500 bg-white/5 px-1 rounded">
              {match.match_format}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[9px] font-medium border ${statusCfg.bg}`}>
            <span className={`w-1 h-1 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Team rows */}
      <SimTeamRow name={t1Name} score={match.team1_score} isWinner={w1} seed={match.team1?.seed ?? null} />
      <div className="h-px bg-white/[0.04]" />
      <SimTeamRow name={t2Name} score={match.team2_score} isWinner={w2} seed={match.team2?.seed ?? null} />

      {/* Win probability bar */}
      {winProb !== null && match.status === 'pending' && (
        <div className="px-2.5 py-1 border-t border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] tabular-nums text-sky-300 font-semibold w-8 text-right">{Math.round(winProb * 100)}%</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-neutral-800 flex">
              <div className="h-full bg-sky-500/60 rounded-l-full transition-all" style={{ width: `${winProb * 100}%` }} />
              <div className="h-full bg-rose-500/60 rounded-r-full transition-all" style={{ width: `${(1 - winProb) * 100}%` }} />
            </div>
            <span className="text-[8px] tabular-nums text-rose-300 font-semibold w-8">{Math.round((1 - winProb) * 100)}%</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex border-t border-white/[0.05]">
        {match.status === 'pending' && match.team1 && match.team2 && !match.locked && (
          <button
            onClick={onSimulate}
            className="flex-1 text-[10px] py-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-colors font-semibold"
          >
            Simuler
          </button>
        )}
        {match.status === 'finished' && !match.locked && (
          <button
            onClick={onReset}
            className="flex-1 text-[10px] py-1.5 text-amber-400 hover:bg-amber-500/10 transition-colors font-semibold"
          >
            Reset
          </button>
        )}
        {match.status === 'pending' && (!match.team1 || !match.team2) && !match.locked && (
          <span className="flex-1 text-[10px] py-1.5 text-neutral-600 text-center italic">
            En attente
          </span>
        )}
        {match.locked && (
          <span className="flex-1 text-[10px] py-1.5 text-amber-400 text-center font-semibold">
            Verrouille
          </span>
        )}
        {onToggleLock && (match.status === 'finished' || (match.status === 'pending' && match.team1 && match.team2)) && (
          <button
            onClick={onToggleLock}
            className={`px-2.5 text-[10px] py-1.5 transition-colors font-semibold border-l border-white/[0.05] ${
              match.locked
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
            }`}
            title={match.locked ? 'Deverrouiller ce match' : 'Verrouiller ce resultat (What-if)'}
          >
            {match.locked ? '\u{1F512}' : '\u{1F513}'}
          </button>
        )}
      </div>

      {/* Maps with per-map results */}
      {match.maps.length > 0 && (
        <div className="border-t border-white/[0.05] px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {match.maps.map((map, i) => {
              const mapWon = map.winner_team_id;
              const t1Won = mapWon === match.team1_id;
              const t2Won = mapWon === match.team2_id;
              return (
                <span
                  key={i}
                  className={`text-[8px] px-1.5 py-0.5 rounded border ${
                    t1Won
                      ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                      : t2Won
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        : 'bg-white/5 text-neutral-500 border-transparent'
                  }`}
                  title={mapWon ? `Gagnee par ${t1Won ? t1Name : t2Name}` : map.mode}
                >
                  {map.name}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const SEED_COLORS: Record<number, string> = {
  1: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  2: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  3: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  4: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  5: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  6: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  7: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  8: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
};

function SimTeamRow({ name, score, isWinner, seed }: { name: string; score: number | null; isWinner: boolean; seed: number | null }) {
  const rowH = (CARD_H - 26) / 2;
  return (
    <div
      className={`flex items-center gap-2 px-2.5 ${isWinner ? 'bg-emerald-500/[0.07]' : ''}`}
      style={{ height: rowH }}
    >
      {seed && seed <= 8 && (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
          SEED_COLORS[seed] ?? 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
        }`}>
          {seed}
        </span>
      )}
      <span className={`text-xs truncate flex-1 ${
        isWinner ? 'text-emerald-300 font-semibold' : name === 'TBD' ? 'text-neutral-600 italic' : 'text-white/80'
      }`}>
        {name}
      </span>
      {score !== null && (
        <span className={`text-xs font-bold tabular-nums ${isWinner ? 'text-emerald-300' : 'text-neutral-500'}`}>
          {score}
        </span>
      )}
      {isWinner && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-emerald-400">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bracket views                                                      */
/* ------------------------------------------------------------------ */

type RoundGroup = { roundNumber: number; roundName: string; matches: SimMatch[] };

function groupByRound(matches: SimMatch[], side?: 'wb' | 'lb' | 'final'): RoundGroup[] {
  const filtered = side ? matches.filter(m => m.bracket_side === side) : matches;
  const map = new Map<number, RoundGroup>();
  for (const m of filtered) {
    const rn = m.round_number;
    if (!map.has(rn)) map.set(rn, { roundNumber: rn, roundName: m.round_name, matches: [] });
    map.get(rn)!.matches.push(m);
  }
  return Array.from(map.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}

function EliminationView({
  rounds,
  onSimulate,
  onReset,
  onToggleLock,
  label,
  accentColor,
}: {
  rounds: RoundGroup[];
  onSimulate: (matchId: string) => void;
  onReset: (matchId: string) => void;
  onToggleLock?: (matchId: string) => void;
  label?: string;
  accentColor?: string;
}) {
  if (!rounds.length) return null;

  const isTree = rounds.length > 1 && rounds[0].matches.length > rounds[rounds.length - 1].matches.length;

  if (!isTree) {
    return (
      <div className="space-y-2">
        {label && (
          <p className={`text-xs uppercase tracking-wider font-semibold ${accentColor ?? 'text-purple-300'}`}>{label}</p>
        )}
        <div className="overflow-x-auto pb-4">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(rounds.length, 6)}, minmax(220px, 1fr))`, minWidth: rounds.length > 6 ? `${rounds.length * 232}px` : undefined }}
          >
            {rounds.map(round => (
              <div key={round.roundNumber} className="flex flex-col">
                <div className="mb-3 px-3 py-2 rounded-lg border bg-purple-500/5 border-purple-500/15 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300">{round.roundName}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{round.matches.length} match{round.matches.length > 1 ? 's' : ''}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {round.matches.map(m => (
                    <SimMatchCard key={m.id} match={m} onSimulate={() => onSimulate(m.id)} onReset={() => onReset(m.id)} onToggleLock={onToggleLock ? () => onToggleLock(m.id) : undefined} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Tree layout
  const yPositions: number[][] = [];
  for (let r = 0; r < rounds.length; r++) {
    const count = rounds[r].matches.length;
    if (r === 0) {
      yPositions.push(Array.from({ length: count }, (_, i) => i * (CARD_H + GAP_BASE)));
    } else {
      const prevYs = yPositions[r - 1];
      const ys: number[] = [];
      for (let i = 0; i < count; i++) {
        const top = prevYs[i * 2] ?? prevYs[prevYs.length - 1] ?? 0;
        const bot = prevYs[i * 2 + 1] ?? top;
        ys.push((top + bot) / 2);
      }
      yPositions.push(ys);
    }
  }

  const allYs = yPositions.flat();
  const totalH = (allYs.length > 0 ? Math.max(...allYs) : 0) + CARD_H + GAP_BASE + 40; // extra for action buttons

  return (
    <div className="space-y-2">
      {label && (
        <p className={`text-xs uppercase tracking-wider font-semibold ${accentColor ?? 'text-purple-300'}`}>{label}</p>
      )}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max" style={{ gap: 0 }}>
          {rounds.map((round, roundIdx) => {
            const ys = yPositions[roundIdx];
            const prevYs = roundIdx > 0 ? yPositions[roundIdx - 1] : null;
            const showConnectors = roundIdx > 0 && prevYs;
            const isFinale = roundIdx === rounds.length - 1 && round.matches.length === 1;

            return (
              <div key={round.roundNumber} className="flex-shrink-0" style={{ display: 'flex' }}>
                {showConnectors && (
                  <svg width={CONNECTOR_W} height={totalH + HEADER_H} className="flex-shrink-0">
                    {ys.map((y, i) => {
                      const topIdx = i * 2;
                      const botIdx = i * 2 + 1;
                      const topY = (prevYs![topIdx] ?? prevYs![prevYs!.length - 1] ?? 0) + HEADER_H + CARD_H / 2;
                      const botY = (prevYs![botIdx] ?? topY - HEADER_H) + HEADER_H + CARD_H / 2;
                      const midY = y + HEADER_H + CARD_H / 2;
                      const hasTwo = prevYs![botIdx] !== undefined;

                      if (!hasTwo) {
                        return <line key={i} x1={0} y1={topY} x2={CONNECTOR_W} y2={midY} stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />;
                      }
                      return (
                        <g key={i}>
                          <line x1={0} y1={topY} x2={CONNECTOR_W / 2} y2={topY} stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                          <line x1={0} y1={botY} x2={CONNECTOR_W / 2} y2={botY} stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                          <line x1={CONNECTOR_W / 2} y1={topY} x2={CONNECTOR_W / 2} y2={botY} stroke="rgba(139,92,246,0.25)" strokeWidth={1.5} />
                          <line x1={CONNECTOR_W / 2} y1={midY} x2={CONNECTOR_W} y2={midY} stroke="rgba(139,92,246,0.3)" strokeWidth={1.5} />
                          <circle cx={CONNECTOR_W / 2} cy={topY} r={2} fill="rgba(139,92,246,0.4)" />
                          <circle cx={CONNECTOR_W / 2} cy={botY} r={2} fill="rgba(139,92,246,0.4)" />
                          <circle cx={CONNECTOR_W / 2} cy={midY} r={2.5} fill="rgba(139,92,246,0.5)" />
                        </g>
                      );
                    })}
                  </svg>
                )}

                <div className="flex-shrink-0 relative" style={{ width: CARD_W }}>
                  <div className="flex items-center justify-center gap-2" style={{ height: HEADER_H }}>
                    <div className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap border ${
                      isFinale
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                        : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                    }`}>
                      {isFinale && <span className="mr-1">&#9733;</span>}
                      {round.roundName}
                    </div>
                  </div>

                  <div className="relative" style={{ height: totalH }}>
                    {round.matches.map((m, mIdx) => (
                      <div key={m.id} className="absolute left-0 right-0" style={{ top: ys[mIdx] }}>
                        <SimMatchCard match={m} onSimulate={() => onSimulate(m.id)} onReset={() => onReset(m.id)} onToggleLock={onToggleLock ? () => onToggleLock(m.id) : undefined} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

type SimConfig = {
  formatType: FormatType;
  teamCount: number;
  playersPerTeam: number;
  bestOf: number;
  mapPoolSize: number;
  swissRounds: number;
  grandFinalReset: boolean;
  stageCount: number;
  // Scheduling
  schedule: ScheduleConfig;
  // Escalation
  escalation: EscalationConfig;
  // Occurrences
  occurrence: OccurrenceConfig;
};

/* ------------------------------------------------------------------ */
/*  Export / Import config                                              */
/* ------------------------------------------------------------------ */

function exportConfigAsJSON(config: SimConfig) {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tournament-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importConfigFromFile(file: File): Promise<SimConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        // Validate required fields
        if (!parsed.formatType || !parsed.schedule || typeof parsed.teamCount !== 'number') {
          reject(new Error('Fichier de configuration invalide'));
          return;
        }
        resolve(parsed as SimConfig);
      } catch {
        reject(new Error('JSON invalide'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

/* ------------------------------------------------------------------ */
/*  Results sharing helpers                                             */
/* ------------------------------------------------------------------ */

function generateResultsSummary(
  stages: SimStage[],
  teams: SimTeam[],
  config: SimConfig,
): string {
  const allMatches = stages.flatMap(s => s.matches);
  const finished = allMatches.filter(m => m.status === 'finished').length;

  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const m of allMatches) {
    if (m.status !== 'finished' || !m.winner_team_id) continue;
    wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
    const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
    if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
  }

  const standings = teams
    .map(t => ({ name: t.name, seed: t.seed, w: wins.get(t.id) ?? 0, l: losses.get(t.id) ?? 0 }))
    .sort((a, b) => b.w - a.w || a.l - b.l);

  let text = `=== SIMULATEUR DE TOURNOI ===\n`;
  text += `Format: ${FORMAT_LABELS[config.formatType]} | ${teams.length} equipes | BO${config.bestOf}\n`;
  text += `Matchs: ${finished}/${allMatches.length} termines\n\n`;
  text += `--- CLASSEMENT ---\n`;
  standings.forEach((s, i) => {
    text += `${String(i + 1).padStart(2)}. ${s.name.padEnd(20)} ${s.w}V ${s.l}D (seed #${s.seed})\n`;
  });

  text += `\n--- RESULTATS ---\n`;
  for (const stage of stages) {
    text += `\n[${stage.name}]\n`;
    for (const m of stage.matches) {
      if (m.status !== 'finished') continue;
      const t1 = m.team1?.short_name ?? 'TBD';
      const t2 = m.team2?.short_name ?? 'TBD';
      const winner = m.winner_team_id === m.team1_id ? t1 : t2;
      text += `  ${m.round_name} #${m.position_in_round}: ${t1} ${m.team1_score}-${m.team2_score} ${t2} (${winner})\n`;
    }
  }

  return text;
}

const FORMAT_LABELS: Record<FormatType, string> = {
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  swiss: 'Swiss System',
  round_robin: 'Round Robin',
  showmatch: 'Showmatch',
};

type OccurrenceData = {
  index: number;
  label: string;
  startDate: string;
  stages: SimStage[];
  teams: SimTeam[];
};

function TournamentSimulatorPage() {
  const { addToast } = useToast();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const animatingRef = useRef(false);
  const [dragSeedIdx, setDragSeedIdx] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareConfig, setCompareConfig] = useState<Partial<SimConfig> | null>(null);
  const [compareData, setCompareData] = useState<{ stages: SimStage[]; teams: SimTeam[] } | null>(null);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [monteCarloRunning, setMonteCarloRunning] = useState(false);
  const [monteCarloIterations, setMonteCarloIterations] = useState(500);
  const [simHistory, setSimHistory] = useState<SimHistoryEntry[]>([]);
  const historyIdRef = useRef(0);
  const [loadingRealTeams, setLoadingRealTeams] = useState(false);
  const [realTeamsError, setRealTeamsError] = useState<string | null>(null);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [createTournamentResult, setCreateTournamentResult] = useState<{ id: string; name: string } | null>(null);
  const [createTournamentError, setCreateTournamentError] = useState<string | null>(null);

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
  const [activeTab, setActiveTab] = useState<'bracket' | 'teams' | 'maps' | 'stats' | 'timeline' | 'compare' | 'monte-carlo' | 'history'>('bracket');
  const [configCollapsed, setConfigCollapsed] = useState(false);

  // Convenience accessors for current occurrence
  const stages = useMemo(() => occurrences[activeOccurrence]?.stages ?? [], [occurrences, activeOccurrence]);
  const teams = useMemo(() => occurrences[activeOccurrence]?.teams ?? [], [occurrences, activeOccurrence]);

  /** Push current occurrences to undo stack before mutating */
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), occurrences]);
    setRedoStack([]);
  }, [occurrences, MAX_UNDO]);

  const setStages = useCallback((updater: (prev: SimStage[]) => SimStage[]) => {
    pushUndo();
    setOccurrences(prev => prev.map((occ, i) =>
      i === activeOccurrence ? { ...occ, stages: updater(occ.stages) } : occ
    ));
  }, [activeOccurrence, pushUndo]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack(prev => [...prev, occurrences]);
    const restored = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setOccurrences(restored);
  }, [undoStack, occurrences]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack(prev => [...prev, occurrences]);
    const restored = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setOccurrences(restored);
  }, [redoStack, occurrences]);

  const validTeamCounts = config.formatType === 'single_elim' || config.formatType === 'double_elim'
    ? [4, 8, 16, 32]
    : [4, 6, 8, 10, 12, 16];

  const generateOneOccurrence = useCallback((pool: string[], occSchedule: ScheduleConfig): { stages: SimStage[]; teams: SimTeam[] } => {
    const newTeams = generateTeams(config.teamCount, config.playersPerTeam);
    const newStages: SimStage[] = [];

    if (config.stageCount >= 2 && config.formatType !== 'showmatch') {
      const groupStage = generateRoundRobin(newTeams, config.bestOf, pool, occSchedule);
      groupStage.name = 'Phase de groupes';
      groupStage.stage_type = 'group';
      newStages.push(groupStage);

      const topTeams = newTeams.slice(0, Math.min(newTeams.length, 8));
      const bracketStage = generateSingleElim(topTeams, config.bestOf, pool, occSchedule, config.escalation);
      bracketStage.name = 'Phase finale';
      newStages.push(bracketStage);
    } else {
      switch (config.formatType) {
        case 'single_elim':
          newStages.push(generateSingleElim(newTeams, config.bestOf, pool, occSchedule, config.escalation));
          break;
        case 'double_elim':
          newStages.push(generateDoubleElim(newTeams, config.bestOf, pool, occSchedule, config.escalation, config.grandFinalReset));
          break;
        case 'swiss':
          newStages.push(generateSwiss(newTeams, config.swissRounds, config.bestOf, pool, occSchedule));
          break;
        case 'round_robin':
          newStages.push(generateRoundRobin(newTeams, config.bestOf, pool, occSchedule));
          break;
        case 'showmatch': {
          const showmatch = generateSingleElim(newTeams.slice(0, 2), config.bestOf, pool, occSchedule, config.escalation);
          showmatch.name = 'Showmatch';
          showmatch.stage_type = 'showmatch';
          newStages.push(showmatch);
          break;
        }
      }
    }
    return { stages: newStages, teams: newTeams };
  }, [config]);

  const handleGenerate = useCallback(() => {
    _idCounter = 0;
    const pool = FAKE_MAPS.slice(0, config.mapPoolSize);

    const occCount = config.occurrence.enabled ? config.occurrence.count : 1;
    const newOccurrences: OccurrenceData[] = [];

    for (let i = 0; i < occCount; i++) {
      // Compute start date for this occurrence
      let occStartDate = config.schedule.startDate;
      if (occStartDate && i > 0) {
        const base = new Date(occStartDate);
        base.setDate(base.getDate() + i * FREQUENCY_DAYS[config.occurrence.frequency]);
        occStartDate = base.toISOString().slice(0, 16); // datetime-local format
      }

      const occSchedule: ScheduleConfig = { ...config.schedule, startDate: occStartDate };
      const { stages: newStages, teams: newTeams } = generateOneOccurrence(pool, occSchedule);

      const label = config.occurrence.enabled
        ? `Occurrence ${i + 1}${occStartDate ? ` — ${formatMatchDate(new Date(occStartDate).toISOString())}` : ''}`
        : 'Tournoi';

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
  }, [config, generateOneOccurrence]);

  const handleSimulateMatch = useCallback((stageIdx: number, matchId: string) => {
    setStages(prev => {
      const next = [...prev];
      const stage = { ...next[stageIdx], matches: [...next[stageIdx].matches] };
      const mIdx = stage.matches.findIndex(m => m.id === matchId);
      if (mIdx === -1 || stage.matches[mIdx].locked) return prev;
      stage.matches[mIdx] = simulateMatch(stage.matches[mIdx]);
      if (stage.stage_type === 'bracket') {
        stage.matches = propagateBracket(stage.matches);
      }
      next[stageIdx] = stage;
      return next;
    });
  }, [setStages]);

  const handleResetMatch = useCallback((stageIdx: number, matchId: string) => {
    setStages(prev => {
      const next = [...prev];
      const stage = { ...next[stageIdx], matches: [...next[stageIdx].matches] };
      const mIdx = stage.matches.findIndex(m => m.id === matchId);
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
  }, [setStages]);

  const handleSimulateAll = useCallback(() => {
    setStages(prev => prev.map(stage => {
      let matches = [...stage.matches];
      if (stage.stage_type === 'bracket') {
        const roundNums = [...new Set(matches.map(m => m.round_number))].sort((a, b) => a - b);
        for (const rn of roundNums) {
          for (let i = 0; i < matches.length; i++) {
            if (matches[i].round_number === rn && matches[i].status === 'pending' && !matches[i].locked) {
              matches[i] = simulateMatch(matches[i]);
            }
          }
          matches = propagateBracket(matches);
        }
      } else {
        matches = matches.map(m => m.status === 'pending' && !m.locked ? simulateMatch(m) : m);
      }
      return { ...stage, matches };
    }));
  }, [setStages]);

  /** Simulate only the next incomplete round across all stages (skips locked) */
  const handleSimulateNextRound = useCallback(() => {
    setStages(prev => prev.map(stage => {
      let matches = [...stage.matches];
      const pendingRounds = [...new Set(
        matches.filter(m => m.status === 'pending' && !m.locked && m.team1 && m.team2).map(m => m.round_number)
      )].sort((a, b) => a - b);
      if (pendingRounds.length === 0) return stage;
      const nextRound = pendingRounds[0];
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].round_number === nextRound && matches[i].status === 'pending' && !matches[i].locked) {
          matches[i] = simulateMatch(matches[i]);
        }
      }
      if (stage.stage_type === 'bracket') {
        matches = propagateBracket(matches);
      }
      return { ...stage, matches };
    }));
  }, [setStages]);

  const handleResetAll = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  /** Toggle lock on a match (What-if mode) */
  const handleToggleLock = useCallback((stageIdx: number, matchId: string) => {
    setStages(prev => {
      const next = [...prev];
      const stage = { ...next[stageIdx], matches: [...next[stageIdx].matches] };
      const mIdx = stage.matches.findIndex(m => m.id === matchId);
      if (mIdx === -1) return prev;
      stage.matches[mIdx] = { ...stage.matches[mIdx], locked: !stage.matches[mIdx].locked };
      next[stageIdx] = stage;
      return next;
    });
  }, [setStages]);

  /** Import config from file */
  const handleImportConfig = useCallback(async (file: File) => {
    try {
      setImportError(null);
      const imported = await importConfigFromFile(file);
      setConfig(imported);
      setGenerated(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }, []);

  /** Copy results summary to clipboard */
  const handleCopyResults = useCallback(async () => {
    const text = generateResultsSummary(stages, teams, config);
    try {
      await navigator.clipboard.writeText(text);
      addToast('Copié !', 'success');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      addToast('Copié !', 'success');
    }
  }, [stages, teams, config, addToast]);

  /** Print bracket/results as PDF */
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  /** Reorder teams via drag & drop — swaps seeds and regenerates bracket */
  const handleReorderTeams = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setOccurrences(prev => prev.map((occ, occIdx) => {
      if (occIdx !== activeOccurrence) return occ;
      const newTeams = [...occ.teams];
      // Swap
      const temp = newTeams[fromIdx];
      newTeams[fromIdx] = newTeams[toIdx];
      newTeams[toIdx] = temp;
      // Re-assign seeds based on position
      const reseeded = newTeams.map((t, i) => ({ ...t, seed: i + 1 }));
      // Re-assign teams in first-round bracket matches
      const newStages = occ.stages.map(stage => {
        if (stage.stage_type !== 'bracket' && stage.stage_type !== 'showmatch') {
          // For non-bracket stages, just update team references
          const matches = stage.matches.map(m => {
            const t1 = reseeded.find(t => t.id === m.team1_id);
            const t2 = reseeded.find(t => t.id === m.team2_id);
            return { ...m, team1: t1 ?? m.team1, team2: t2 ?? m.team2 };
          });
          return { ...stage, matches };
        }
        // For brackets, re-seed the first round
        const seedOrder = bracketSeedOrder(reseeded.length);
        let firstRoundIdx = 0;
        const matches = stage.matches.map(m => {
          // First round matches have teams assigned
          if (m.round_number === 1 && m.bracket_side === 'wb') {
            const t1 = reseeded[seedOrder[firstRoundIdx * 2]] ?? null;
            const t2 = reseeded[seedOrder[firstRoundIdx * 2 + 1]] ?? null;
            firstRoundIdx++;
            return {
              ...m,
              team1: t1, team1_id: t1?.id ?? null,
              team2: t2, team2_id: t2?.id ?? null,
              // Reset results since seeding changed
              status: 'pending' as MatchStatus,
              team1_score: null, team2_score: null,
              winner_team_id: null, locked: false,
            };
          }
          // Later rounds: clear propagated teams
          if (m.bracket_side === 'wb' || m.bracket_side === 'lb' || m.bracket_side === 'final') {
            return {
              ...m,
              team1: null, team1_id: null,
              team2: null, team2_id: null,
              status: 'pending' as MatchStatus,
              team1_score: null, team2_score: null,
              winner_team_id: null, locked: false,
            };
          }
          return m;
        });
        return { ...stage, matches };
      });
      return { ...occ, teams: reseeded, stages: newStages };
    }));
  }, [activeOccurrence]);

  /** Update a team's strength rating */
  const handleUpdateTeamStrength = useCallback((teamId: string, strength: number) => {
    setOccurrences(prev => prev.map((occ, occIdx) => {
      if (occIdx !== activeOccurrence) return occ;
      const newTeams = occ.teams.map(t => t.id === teamId ? { ...t, strength } : t);
      // Also update team references inside matches
      const newStages = occ.stages.map(stage => ({
        ...stage,
        matches: stage.matches.map(m => ({
          ...m,
          team1: m.team1?.id === teamId ? { ...m.team1, strength } : m.team1,
          team2: m.team2?.id === teamId ? { ...m.team2, strength } : m.team2,
        })),
      }));
      return { ...occ, teams: newTeams, stages: newStages };
    }));
  }, [activeOccurrence]);

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

      setStages(prev => {
        // Find next playable match across all stages
        for (let sIdx = 0; sIdx < prev.length; sIdx++) {
          const stage = prev[sIdx];
          const roundNums = [...new Set(
            stage.matches.filter(m => m.status === 'pending' && !m.locked && m.team1 && m.team2).map(m => m.round_number)
          )].sort((a, b) => a - b);

          if (roundNums.length === 0) continue;
          const nextRound = roundNums[0];
          const mIdx = stage.matches.findIndex(
            m => m.round_number === nextRound && m.status === 'pending' && !m.locked && m.team1 && m.team2
          );
          if (mIdx === -1) continue;

          const next = [...prev];
          const updatedStage = { ...next[sIdx], matches: [...next[sIdx].matches] };
          updatedStage.matches[mIdx] = simulateMatch(updatedStage.matches[mIdx]);
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
  const handleCompare = useCallback((altConfig: Partial<SimConfig>) => {
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
        const extra = generateTeams(mergedConfig.teamCount - currentTeams.length, config.playersPerTeam);
        compareTeams = [...currentTeams, ...extra.map((t, i) => ({ ...t, seed: currentTeams.length + i + 1 }))];
      }
    }

    const newStages: SimStage[] = [];
    const occSchedule = config.schedule;

    switch (mergedConfig.formatType) {
      case 'single_elim':
        newStages.push(generateSingleElim(compareTeams, mergedConfig.bestOf, pool, occSchedule, mergedConfig.escalation));
        break;
      case 'double_elim':
        newStages.push(generateDoubleElim(compareTeams, mergedConfig.bestOf, pool, occSchedule, mergedConfig.escalation, mergedConfig.grandFinalReset));
        break;
      case 'swiss':
        newStages.push(generateSwiss(compareTeams, mergedConfig.swissRounds, mergedConfig.bestOf, pool, occSchedule));
        break;
      case 'round_robin':
        newStages.push(generateRoundRobin(compareTeams, mergedConfig.bestOf, pool, occSchedule));
        break;
      case 'showmatch': {
        const s = generateSingleElim(compareTeams.slice(0, 2), mergedConfig.bestOf, pool, occSchedule, mergedConfig.escalation);
        s.name = 'Showmatch';
        s.stage_type = 'showmatch';
        newStages.push(s);
        break;
      }
    }

    setCompareConfig(altConfig);
    setCompareData({ stages: newStages, teams: compareTeams });
  }, [config, occurrences, activeOccurrence]);

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
    const allMatches = stages.flatMap(s => s.matches);
    const finished = allMatches.filter(m => m.status === 'finished');
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
      .map(t => ({ name: t.name, seed: t.seed, wins: wins.get(t.id) ?? 0, losses: losses.get(t.id) ?? 0 }))
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

    setSimHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY));
  }, [stages, teams, config]);

  /** Fetch real teams from Supabase and replace generated teams */
  const handleLoadRealTeams = useCallback(async () => {
    setLoadingRealTeams(true);
    setRealTeamsError(null);
    try {
      const res = await fetch(`/api/admin/teams?limit=${config.teamCount}&isActive=true`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      const apiTeams: { id: string; name: string; short_name: string | null; logo_url: string | null }[] = data.teams ?? [];

      if (apiTeams.length === 0) {
        throw new Error('Aucune equipe active trouvee');
      }

      // Convert to SimTeam format
      const realTeams: SimTeam[] = apiTeams.slice(0, config.teamCount).map((t, i) => ({
        id: t.id,
        name: t.name,
        short_name: t.short_name ?? t.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase(),
        logo_url: null,
        seed: i + 1,
        strength: Math.round(75 - ((i / Math.max(config.teamCount - 1, 1)) * 40)),
        players: [], // Real players would need another API call
      }));

      // If not enough real teams, pad with generated ones
      if (realTeams.length < config.teamCount) {
        const extra = generateTeams(config.teamCount - realTeams.length, config.playersPerTeam);
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
        const groupStage = generateRoundRobin(realTeams, config.bestOf, pool, occSchedule);
        groupStage.name = 'Phase de groupes';
        groupStage.stage_type = 'group';
        newStages.push(groupStage);
        const topTeams = realTeams.slice(0, Math.min(realTeams.length, 8));
        const bracketStage = generateSingleElim(topTeams, config.bestOf, pool, occSchedule, config.escalation);
        bracketStage.name = 'Phase finale';
        newStages.push(bracketStage);
      } else {
        switch (config.formatType) {
          case 'single_elim':
            newStages.push(generateSingleElim(realTeams, config.bestOf, pool, occSchedule, config.escalation));
            break;
          case 'double_elim':
            newStages.push(generateDoubleElim(realTeams, config.bestOf, pool, occSchedule, config.escalation, config.grandFinalReset));
            break;
          case 'swiss':
            newStages.push(generateSwiss(realTeams, config.swissRounds, config.bestOf, pool, occSchedule));
            break;
          case 'round_robin':
            newStages.push(generateRoundRobin(realTeams, config.bestOf, pool, occSchedule));
            break;
          case 'showmatch': {
            const s = generateSingleElim(realTeams.slice(0, 2), config.bestOf, pool, occSchedule, config.escalation);
            s.name = 'Showmatch';
            s.stage_type = 'showmatch';
            newStages.push(s);
            break;
          }
        }
      }

      setMapPool(pool);
      setOccurrences([{
        index: 0,
        label: 'Tournoi (equipes reelles)',
        startDate: config.schedule.startDate,
        stages: newStages,
        teams: realTeams,
      }]);
      setActiveOccurrence(0);
      setGenerated(true);
      setActiveTab('bracket');
    } catch (err) {
      setRealTeamsError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoadingRealTeams(false);
    }
  }, [config]);

  /** Create a real tournament from the current simulation */
  const handleCreateTournament = useCallback(async () => {
    if (!generated || teams.length === 0) return;
    setCreatingTournament(true);
    setCreateTournamentError(null);
    setCreateTournamentResult(null);

    try {
      const tournamentName = `Tournoi Sim ${new Date().toLocaleDateString('fr-FR')}`;

      // Step 1: Create tournament
      const tRes = await fetch('/api/admin/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        throw new Error(errData.error ?? `Erreur creation tournoi: ${tRes.status}`);
      }
      const tournament = await tRes.json();
      const tournamentId = tournament.id;

      // Step 2: Register teams (only real teams with valid UUIDs)
      const realTeamIds = teams.filter(t => !t.id.startsWith('sim-'));
      for (const t of realTeamIds) {
        await fetch(`/api/admin/tournament/${tournamentId}/teams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_id: t.id, seed: t.seed }),
        });
      }

      // Step 3: Create stages
      for (let sIdx = 0; sIdx < stages.length; sIdx++) {
        const simStage = stages[sIdx];
        const stageRes = await fetch(`/api/admin/tournament/${tournamentId}/stages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: simStage.name,
            stage_type: simStage.stage_type,
            order_index: sIdx,
            is_active: sIdx === 0,
            is_public: false,
          }),
        });
        if (!stageRes.ok) continue;
        const createdStage = await stageRes.json();
        const stageId = createdStage.id;

        // Step 4: Create matches for this stage (only use real team IDs)
        const matchPayloads = simStage.matches.map(m => ({
          stage_id: stageId,
          status: 'pending',
          match_format: m.match_format,
          best_of: m.best_of,
          round_name: m.round_name,
          round_number: m.round_number,
          bracket_side: m.bracket_side === 'none' ? null : m.bracket_side,
          scheduled_at: m.scheduled_at,
          // Only set team IDs if they are real (not sim- prefixed)
          team1_id: m.team1_id && !m.team1_id.startsWith('sim-') ? m.team1_id : null,
          team2_id: m.team2_id && !m.team2_id.startsWith('sim-') ? m.team2_id : null,
        }));

        if (matchPayloads.length > 0) {
          await fetch(`/api/admin/tournament/${tournamentId}/matches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matches: matchPayloads }),
          });
        }
      }

      setCreateTournamentResult({ id: tournamentId, name: tournamentName });
    } catch (err) {
      setCreateTournamentError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreatingTournament(false);
    }
  }, [generated, teams, stages, config]);

  /** Build bracket graph from SimMatches using production utils.
   *  Used for graph validation and layout computation. */
  const bracketGraphs = useMemo(() => {
    if (!generated) return new Map<string, ReturnType<typeof computeBracketLayout>>();
    const layouts = new Map<string, ReturnType<typeof computeBracketLayout>>();

    for (const stage of stages) {
      if (stage.stage_type !== 'bracket' && stage.stage_type !== 'showmatch') continue;

      // Convert SimMatch[] to MatchForGraph[]
      const matchesForGraph: MatchForGraph[] = stage.matches.map(m => ({
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
    const allMatches = stages.flatMap(s => s.matches);
    const total = allMatches.length;
    const finished = allMatches.filter(m => m.status === 'finished').length;
    const pending = allMatches.filter(m => m.status === 'pending').length;

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
        mapLosses.set(m.team1_id, (mapLosses.get(m.team1_id) ?? 0) + m.team2_score);
      }
      if (m.team2_id && m.team1_score != null && m.team2_score != null) {
        mapWins.set(m.team2_id, (mapWins.get(m.team2_id) ?? 0) + m.team2_score);
        mapLosses.set(m.team2_id, (mapLosses.get(m.team2_id) ?? 0) + m.team1_score);
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
    const playableMatches = allMatches.filter(m => m.status === 'pending' && m.team1 && m.team2);
    const nextRound = playableMatches.length > 0
      ? Math.min(...playableMatches.map(m => m.round_number))
      : null;
    const nextRoundName = playableMatches.find(m => m.round_number === nextRound)?.round_name ?? null;

    // Estimated duration
    const scheduledDates = allMatches.map(m => m.scheduled_at).filter(Boolean) as string[];
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

    return { total, finished, pending, wins, losses, mapWins, mapLosses, mapCount, nextRound, nextRoundName, estimatedDuration, competitiveness };
  }, [stages, teams]);

  return (
    <>
      <Head>
        <title>Admin · Simulateur de Tournoi</title>
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
              <Link href="/admin" className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white">
                &larr; Retour admin
              </Link>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">Admin</p>
              <h1 className="text-2xl font-semibold">Simulateur de Tournoi</h1>
              <p className="text-sm text-neutral-400 mt-1">Testez les configurations avec des données fictives</p>
            </div>
            {generated && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleSimulateNextRound}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold shadow transition-colors"
                  title="Simule uniquement le prochain round jouable"
                >
                  Round suivant
                </button>
                <button
                  onClick={handleSimulateAnimated}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors ${
                    animating
                      ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                  title={animating ? 'Arreter l\'animation' : 'Simuler match par match avec animation'}
                >
                  {animating ? 'Stop' : 'Simuler anime'}
                </button>
                <button
                  onClick={handleSimulateAll}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow transition-colors"
                >
                  Simuler tout
                </button>
                <button
                  onClick={handleResetAll}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-semibold shadow transition-colors"
                >
                  Reset tout
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold shadow transition-colors ${
                    undoStack.length > 0
                      ? 'bg-neutral-700 hover:bg-neutral-600 text-white'
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                  }`}
                  title={`Annuler (${undoStack.length})`}
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
                  title={`Refaire (${redoStack.length})`}
                >
                  &#x21AA;
                </button>
                <div className="w-px bg-white/10 mx-1 print:hidden" />
                <button
                  onClick={saveToHistory}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-sm font-semibold shadow transition-colors print:hidden"
                  title="Sauvegarder cette simulation dans l'historique"
                >
                  Sauvegarder
                </button>
                <button
                  onClick={handleCreateTournament}
                  disabled={creatingTournament}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors print:hidden ${
                    creatingTournament
                      ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                      : 'bg-sky-600 hover:bg-sky-700 text-white'
                  }`}
                  title="Creer un vrai tournoi en base a partir de cette simulation"
                >
                  {creatingTournament ? 'Creation...' : 'Creer le tournoi'}
                </button>
                <button
                  onClick={handleCopyResults}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold shadow transition-colors print:hidden"
                  title="Copier le resume des resultats"
                >
                  Copier resultats
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold shadow transition-colors print:hidden"
                  title="Imprimer / Exporter en PDF"
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
                  Tournoi &quot;{createTournamentResult.name}&quot; cree avec succes !
                </p>
                <p className="text-xs text-neutral-400 mt-1">Le tournoi est en statut brouillon. Configurez-le dans l&apos;admin.</p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/admin/tournament/${createTournamentResult.id}`}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow transition-colors text-white"
                >
                  Voir le tournoi
                </Link>
                <button
                  type="button"
                  onClick={() => setCreateTournamentResult(null)}
                  className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm text-neutral-400 transition-colors"
                >
                  Fermer
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
                Fermer
              </button>
            </div>
          )}

          {/* Configuration panel */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 mb-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Configuration</h2>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Presets */}
                <div className="flex gap-1">
                  {([
                    { label: 'Rapide', cfg: { formatType: 'single_elim' as FormatType, teamCount: 4, bestOf: 1, stageCount: 1 } },
                    { label: 'Standard', cfg: { formatType: 'single_elim' as FormatType, teamCount: 8, bestOf: 3, stageCount: 1 } },
                    { label: 'LAN', cfg: { formatType: 'double_elim' as FormatType, teamCount: 8, bestOf: 3, stageCount: 1, grandFinalReset: true, escalation: { enabled: true, earlyRoundsBo: 1, semiFinalsBo: 3, finalsBo: 5 } } },
                    { label: 'Ligue', cfg: { formatType: 'swiss' as FormatType, teamCount: 16, bestOf: 3, swissRounds: 5, stageCount: 1 } },
                  ]).map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setConfig(c => ({ ...c, ...preset.cfg }))}
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
                    title="Telecharger la configuration en JSON"
                  >
                    Exporter
                  </button>
                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    className="px-2.5 py-1 rounded text-[10px] font-semibold bg-sky-900/50 hover:bg-sky-800/50 border border-sky-700/40 text-sky-300 transition-colors"
                    title="Charger une configuration depuis un fichier JSON"
                  >
                    Importer
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImportConfig(file);
                      e.target.value = '';
                    }}
                  />
                </div>
                {importError && (
                  <span className="text-[10px] text-red-400">{importError}</span>
                )}
                <button
                  type="button"
                  onClick={() => setConfigCollapsed(c => !c)}
                  className="text-neutral-400 hover:text-white transition-colors text-sm"
                >
                  {configCollapsed ? 'Afficher' : 'Reduire'}
                </button>
              </div>
            </div>

            {!configCollapsed && (<div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">Format</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(FORMAT_LABELS) as FormatType[]).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        const tc = (f === 'single_elim' || f === 'double_elim') && ![4,8,16,32].includes(config.teamCount)
                          ? 8 : f === 'showmatch' ? 2 : config.teamCount;
                        setConfig(c => ({ ...c, formatType: f, teamCount: tc }));
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
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Nombre d&apos;equipes</label>
                  <div className="flex flex-wrap gap-2">
                    {validTeamCounts.map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, teamCount: n }))}
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
                <label className="block text-sm font-medium text-neutral-200 mb-2">Joueurs par equipe</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 6].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setConfig(c => ({ ...c, playersPerTeam: n }))}
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
                <label className="block text-sm font-medium text-neutral-200 mb-2">Format de match</label>
                <div className="flex gap-2">
                  {[1, 3, 5, 7].map(bo => (
                    <button
                      key={bo}
                      type="button"
                      onClick={() => setConfig(c => ({ ...c, bestOf: bo }))}
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
                <label className="block text-sm font-medium text-neutral-200 mb-2">Maps dans le pool</label>
                <input
                  type="range"
                  min={3}
                  max={FAKE_MAPS.length}
                  value={config.mapPoolSize}
                  onChange={e => setConfig(c => ({ ...c, mapPoolSize: parseInt(e.target.value) }))}
                  className="w-full accent-purple-500"
                />
                <span className="text-xs text-neutral-400">{config.mapPoolSize} maps</span>
              </div>

              {/* Swiss rounds */}
              {config.formatType === 'swiss' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Rounds Swiss</label>
                  <div className="flex gap-2">
                    {[3, 5, 7, 9].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, swissRounds: r }))}
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
                      onChange={e => setConfig(c => ({ ...c, grandFinalReset: e.target.checked }))}
                      className="rounded border-neutral-500 bg-neutral-700"
                    />
                    <span className="font-medium text-neutral-200">Grand Final Reset</span>
                  </label>
                </div>
              )}

              {/* Multi-stage */}
              {config.formatType !== 'showmatch' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Stages</label>
                  <div className="flex gap-2">
                    {[1, 2].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setConfig(c => ({ ...c, stageCount: n }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          config.stageCount === n
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        {n === 1 ? '1 stage' : '2 stages (groupes + bracket)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Scheduling section */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4">Planning</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Date de debut</label>
                  <input
                    type="datetime-local"
                    value={config.schedule.startDate}
                    onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, startDate: e.target.value } }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Duree d&apos;un match (min)</label>
                  <input
                    type="number" min={5} max={180} step={5}
                    value={config.schedule.matchDurationMin}
                    onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, matchDurationMin: parseInt(e.target.value) || 30 } }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Pause entre matchs (min)</label>
                  <input
                    type="number" min={0} max={120} step={5}
                    value={config.schedule.breakBetweenMatchesMin}
                    onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, breakBetweenMatchesMin: parseInt(e.target.value) || 0 } }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Pause entre rounds (min)</label>
                  <input
                    type="number" min={0} max={240} step={5}
                    value={config.schedule.breakBetweenRoundsMin}
                    onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, breakBetweenRoundsMin: parseInt(e.target.value) || 0 } }))}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Heure de debut de journee</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={23}
                      value={config.schedule.dayStartHour}
                      onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, dayStartHour: parseInt(e.target.value) || 0 } }))}
                      className="w-20 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-neutral-500 text-sm">h</span>
                    <span className="text-neutral-600 text-xs">a</span>
                    <input
                      type="number" min={1} max={24}
                      value={config.schedule.dayEndHour}
                      onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, dayEndHour: parseInt(e.target.value) || 24 } }))}
                      className="w-20 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-neutral-500 text-sm">h</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">Matchs par jour (0 = illimite)</label>
                  <input
                    type="number" min={0} max={50}
                    value={config.schedule.matchesPerDay}
                    onChange={e => setConfig(c => ({ ...c, schedule: { ...c.schedule, matchesPerDay: parseInt(e.target.value) || 0 } }))}
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
                    onChange={e => setConfig(c => ({ ...c, escalation: { ...c.escalation, enabled: e.target.checked } }))}
                    className="rounded border-neutral-500 bg-neutral-700"
                  />
                  <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Format progressif (escalade)</span>
                </label>
              </div>
              {config.escalation.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {([
                    { label: 'Premiers rounds', key: 'earlyRoundsBo' as const },
                    { label: 'Demi-finales', key: 'semiFinalsBo' as const },
                    { label: 'Finale', key: 'finalsBo' as const },
                  ]).map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-neutral-200 mb-2">{label}</label>
                      <div className="flex gap-2">
                        {[1, 3, 5, 7].map(bo => (
                          <button
                            key={bo}
                            type="button"
                            onClick={() => setConfig(c => ({ ...c, escalation: { ...c.escalation, [key]: bo } }))}
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
                    onChange={e => setConfig(c => ({ ...c, occurrence: { ...c.occurrence, enabled: e.target.checked } }))}
                    className="rounded border-neutral-500 bg-neutral-700"
                  />
                  <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Tournoi recurrent</span>
                </label>
              </div>
              {config.occurrence.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-200 mb-2">Frequence</label>
                    <div className="flex gap-2">
                      {(Object.keys(FREQUENCY_LABELS) as OccurrenceConfig['frequency'][]).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setConfig(c => ({ ...c, occurrence: { ...c.occurrence, frequency: f } }))}
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
                    <label className="block text-sm font-medium text-neutral-200 mb-2">Nombre d&apos;occurrences</label>
                    <input
                      type="number" min={2} max={52}
                      value={config.occurrence.count}
                      onChange={e => setConfig(c => ({ ...c, occurrence: { ...c.occurrence, count: Math.max(2, parseInt(e.target.value) || 2) } }))}
                      className="w-32 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>

            </div>)}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleGenerate}
                className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold shadow transition-colors"
              >
                Generer le tournoi{config.occurrence.enabled ? ` (${config.occurrence.count} occurrences)` : ''}
              </button>
              <button
                onClick={handleLoadRealTeams}
                disabled={loadingRealTeams}
                className={`px-6 py-3 rounded-lg text-sm font-semibold shadow transition-colors ${
                  loadingRealTeams
                    ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                    : 'bg-sky-600 hover:bg-sky-700 text-white'
                }`}
                title="Charger les equipes reelles depuis la base de donnees"
              >
                {loadingRealTeams ? 'Chargement...' : 'Charger les equipes'}
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
                  <label className="block text-sm font-medium text-neutral-300 mb-2 uppercase tracking-wider">Occurrence</label>
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
                <SummaryCard label="Equipes" value={teams.length} />
                <SummaryCard label="Matchs" value={stats.total} />
                <SummaryCard label="Termines" value={stats.finished} color="text-emerald-400" />
                <SummaryCard label="En attente" value={stats.pending} color="text-amber-400" />
                {stats.estimatedDuration && (
                  <SummaryCard label="Duree estimee" value={stats.estimatedDuration} color="text-sky-400" />
                )}
                {stats.nextRoundName && (
                  <SummaryCard label="Prochain round" value={stats.nextRoundName} color="text-blue-400" />
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-6 border-b border-white/10 pb-px overflow-x-auto">
                {(['bracket', 'teams', 'maps', 'stats', 'monte-carlo', 'history', 'compare', ...(occurrences.length > 1 ? ['timeline' as const] : [])] as const).map(tab => {
                  const TAB_LABELS: Record<string, string> = {
                    bracket: 'Bracket / Matchs', teams: 'Equipes', maps: 'Maps', stats: 'Statistiques',
                    'monte-carlo': 'Monte Carlo', history: `Historique${simHistory.length > 0 ? ` (${simHistory.length})` : ''}`,
                    compare: 'Comparaison', timeline: 'Timeline',
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
                        <span className="text-sm text-neutral-500 font-normal">({stage.matches.length} matchs)</span>
                      </h3>

                      {(stage.stage_type === 'bracket' || stage.stage_type === 'showmatch') && (
                        <>
                          {/* WB */}
                          <EliminationView
                            rounds={groupByRound(stage.matches, 'wb')}
                            onSimulate={id => handleSimulateMatch(stageIdx, id)}
                            onReset={id => handleResetMatch(stageIdx, id)}
                            onToggleLock={id => handleToggleLock(stageIdx, id)}
                            label={stage.matches.some(m => m.bracket_side === 'lb') ? 'Winners Bracket' : undefined}
                          />
                          {/* LB */}
                          {stage.matches.some(m => m.bracket_side === 'lb') && (
                            <div className="mt-6">
                              <EliminationView
                                rounds={groupByRound(stage.matches, 'lb')}
                                onSimulate={id => handleSimulateMatch(stageIdx, id)}
                                onReset={id => handleResetMatch(stageIdx, id)}
                                onToggleLock={id => handleToggleLock(stageIdx, id)}
                                label="Losers Bracket"
                                accentColor="text-red-300"
                              />
                            </div>
                          )}
                          {/* Grand Final */}
                          {stage.matches.some(m => m.bracket_side === 'final') && (
                            <div className="mt-6">
                              <EliminationView
                                rounds={groupByRound(stage.matches, 'final')}
                                onSimulate={id => handleSimulateMatch(stageIdx, id)}
                                onReset={id => handleResetMatch(stageIdx, id)}
                                onToggleLock={id => handleToggleLock(stageIdx, id)}
                                label="Grande Finale"
                                accentColor="text-amber-300"
                              />
                            </div>
                          )}
                        </>
                      )}

                      {(stage.stage_type === 'swiss' || stage.stage_type === 'round_robin' || stage.stage_type === 'group') && (
                        <EliminationView
                          rounds={groupByRound(stage.matches)}
                          onSimulate={id => handleSimulateMatch(stageIdx, id)}
                          onReset={id => handleResetMatch(stageIdx, id)}
                          onToggleLock={id => handleToggleLock(stageIdx, id)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'teams' && (
                <div>
                  <p className="text-xs text-neutral-500 mb-4">Glissez-deposez les equipes pour modifier le seeding. Le bracket sera regenere.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {teams.map((team, teamIdx) => (
                      <div
                        key={team.id}
                        draggable
                        onDragStart={() => setDragSeedIdx(teamIdx)}
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={e => {
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
                          <div className="flex flex-col gap-0.5 text-neutral-600 flex-shrink-0 cursor-grab" title="Glisser pour reordonner">
                            <div className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /></div>
                            <div className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /></div>
                            <div className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-current" /><span className="w-1 h-1 rounded-full bg-current" /></div>
                          </div>
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border ${
                            SEED_COLORS[team.seed] ?? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          }`}>
                            {team.short_name}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{team.name}</div>
                            <div className="text-[10px] text-neutral-500">Seed #{team.seed}</div>
                          </div>
                          {stats.wins.has(team.id) && (
                            <div className="ml-auto text-right">
                              <div className="text-xs font-bold text-emerald-400">{stats.wins.get(team.id)}W</div>
                              <div className="text-xs font-bold text-red-400">{stats.losses.get(team.id) ?? 0}L</div>
                            </div>
                          )}
                        </div>
                        {/* Strength slider */}
                        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
                          <span className="text-[10px] text-neutral-500 font-semibold w-10">Force</span>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={team.strength}
                            onChange={e => handleUpdateTeamStrength(team.id, parseInt(e.target.value))}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            className="flex-1 accent-purple-500 h-1.5"
                            draggable={false}
                          />
                          <span className={`text-xs font-bold tabular-nums w-8 text-right ${
                            team.strength >= 70 ? 'text-emerald-400' :
                            team.strength >= 45 ? 'text-amber-400' : 'text-red-400'
                          }`}>{team.strength}</span>
                        </div>
                        <div className="space-y-1">
                          {team.players.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-neutral-300">{p.name}</span>
                              <span className="text-neutral-600 font-mono text-[10px]">{p.battleTag}</span>
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
                    {mapPool.map(name => {
                      const count = stats.mapCount.get(name) ?? 0;
                      const maxCount = Math.max(...stats.mapCount.values(), 1);
                      return (
                        <div key={name} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                          <div className="text-sm font-semibold">{name}</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full transition-all"
                                style={{ width: `${(count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-neutral-400 tabular-nums w-8 text-right">{count}x</span>
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
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">Classement</h3>
                    <div className="space-y-1">
                      <div className="grid grid-cols-[auto_1fr_50px_50px_50px_70px_50px] gap-2 text-[10px] uppercase tracking-wider text-neutral-600 font-bold px-3 pb-2">
                        <span className="w-6">#</span>
                        <span>Equipe</span>
                        <span className="text-center">V</span>
                        <span className="text-center">D</span>
                        <span className="text-center">%</span>
                        <span className="text-center">Maps</span>
                        <span className="text-center">Diff</span>
                      </div>
                      {teams
                        .map(t => ({
                          team: t,
                          wins: stats.wins.get(t.id) ?? 0,
                          losses: stats.losses.get(t.id) ?? 0,
                          mapsWon: stats.mapWins.get(t.id) ?? 0,
                          mapsLost: stats.mapLosses.get(t.id) ?? 0,
                        }))
                        .sort((a, b) => b.wins - a.wins || a.losses - b.losses || (b.mapsWon - b.mapsLost) - (a.mapsWon - a.mapsLost))
                        .map((row, i) => {
                          const total = row.wins + row.losses;
                          const pct = total > 0 ? Math.round((row.wins / total) * 100) : 0;
                          const diff = row.mapsWon - row.mapsLost;
                          return (
                            <div
                              key={row.team.id}
                              className={`grid grid-cols-[auto_1fr_50px_50px_50px_70px_50px] gap-2 items-center px-3 py-2 rounded-lg text-sm ${
                                i < 3 ? 'bg-emerald-500/5 border border-emerald-500/10' : i % 2 === 0 ? 'bg-white/[0.01]' : ''
                              }`}
                            >
                              <span className="w-6 text-xs font-bold text-neutral-500">{i + 1}</span>
                              <div className="flex items-center gap-2 truncate">
                                <span className="font-medium truncate">{row.team.name}</span>
                                <span className="text-[9px] text-neutral-600">#{row.team.seed}</span>
                              </div>
                              <span className="text-center font-bold text-emerald-400">{row.wins}</span>
                              <span className="text-center font-bold text-red-400">{row.losses}</span>
                              <span className="text-center text-neutral-400">{pct}%</span>
                              <span className="text-center text-[11px] text-neutral-500">{row.mapsWon}-{row.mapsLost}</span>
                              <span className={`text-center font-bold text-xs ${
                                diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-neutral-500'
                              }`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Progression */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">Progression du tournoi</h3>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-4 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                          style={{ width: `${stats.total > 0 ? (stats.finished / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums text-neutral-300">
                        {stats.total > 0 ? Math.round((stats.finished / stats.total) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-neutral-500">
                        {stats.finished} / {stats.total} matchs termines
                      </p>
                      {stats.nextRoundName && (
                        <p className="text-xs text-blue-400">
                          Prochain : {stats.nextRoundName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Competitiveness metrics */}
                  {stats.finished > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                      <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">Competitivite</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Matchs serres</div>
                          <div className="text-xl font-bold text-amber-400">{stats.competitiveness.closeMatches}</div>
                          <div className="text-[10px] text-neutral-500">{stats.competitiveness.closeMatchPct}% des matchs</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Upsets</div>
                          <div className="text-xl font-bold text-rose-400">{stats.competitiveness.upsets}</div>
                          <div className="text-[10px] text-neutral-500">{stats.competitiveness.upsetPct}% des matchs</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Maps / match</div>
                          <div className="text-xl font-bold text-sky-400">{stats.competitiveness.avgMapsPerMatch}</div>
                          <div className="text-[10px] text-neutral-500">moyenne</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Plus longue serie</div>
                          <div className="text-xl font-bold text-emerald-400">{stats.competitiveness.maxWinStreak}</div>
                          <div className="text-[10px] text-neutral-500">victoires consecutives</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Parcours moyen</div>
                          <div className="text-xl font-bold text-purple-400">{stats.competitiveness.avgTeamJourney}</div>
                          <div className="text-[10px] text-neutral-500">matchs / equipe</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Dominance</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xl font-bold text-neutral-300">{stats.competitiveness.dominanceScore}%</div>
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {stats.competitiveness.dominanceScore < 30 ? 'Tres equilibre' :
                             stats.competitiveness.dominanceScore < 50 ? 'Equilibre' :
                             stats.competitiveness.dominanceScore < 70 ? 'Un favori' : 'Domination'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Round-by-round breakdown */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">Detail par round</h3>
                    <div className="space-y-2">
                      {(() => {
                        const allMatches = stages.flatMap(s => s.matches);
                        const roundMap = new Map<string, { total: number; finished: number; name: string }>();
                        for (const m of allMatches) {
                          const key = `${m.bracket_side}-${m.round_number}`;
                          const existing = roundMap.get(key) ?? { total: 0, finished: 0, name: m.round_name };
                          existing.total++;
                          if (m.status === 'finished') existing.finished++;
                          roundMap.set(key, existing);
                        }
                        return Array.from(roundMap.entries()).map(([key, data]) => {
                          const pct = data.total > 0 ? Math.round((data.finished / data.total) * 100) : 0;
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-xs text-neutral-400 w-32 truncate">{data.name}</span>
                              <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-neutral-700'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-neutral-500 tabular-nums w-16 text-right">
                                {data.finished}/{data.total}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Head-to-head matrix */}
                  {stats.finished > 0 && (() => {
                    const allMatches = stages.flatMap(s => s.matches);
                    const h2hRecords = computeHeadToHead(allMatches);
                    if (h2hRecords.length === 0) return null;

                    // Build a lookup map: "id1-id2" → record
                    const h2hMap = new Map<string, H2HRecord>();
                    for (const rec of h2hRecords) {
                      h2hMap.set(`${rec.team1Id}-${rec.team2Id}`, rec);
                    }

                    // Sort teams by wins
                    const sortedTeams = [...teams].sort((a, b) => (stats.wins.get(b.id) ?? 0) - (stats.wins.get(a.id) ?? 0));

                    return (
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                        <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">Confrontations directes</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-white/10">
                                <th className="text-left py-2 pr-2 text-neutral-500 font-semibold sticky left-0 bg-[#0a0a12] z-10">vs</th>
                                {sortedTeams.map(t => (
                                  <th key={t.id} className="text-center py-2 px-1 text-neutral-500 font-semibold min-w-[50px]">
                                    <span title={t.name}>{t.short_name}</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sortedTeams.map(t1 => (
                                <tr key={t1.id} className="border-b border-white/[0.03]">
                                  <td className="py-1.5 pr-2 font-medium text-neutral-300 sticky left-0 bg-[#0a0a12] z-10">{t1.short_name}</td>
                                  {sortedTeams.map(t2 => {
                                    if (t1.id === t2.id) {
                                      return <td key={t2.id} className="text-center py-1.5 px-1 text-neutral-800">—</td>;
                                    }
                                    const key = [t1.id, t2.id].sort().join('-');
                                    const rec = h2hMap.get(key);
                                    if (!rec) {
                                      return <td key={t2.id} className="text-center py-1.5 px-1 text-neutral-700">-</td>;
                                    }
                                    const isFirst = t1.id === rec.team1Id;
                                    const w = isFirst ? rec.team1Wins : rec.team2Wins;
                                    const l = isFirst ? rec.team2Wins : rec.team1Wins;
                                    return (
                                      <td key={t2.id} className="text-center py-1.5 px-1">
                                        <span className={`tabular-nums font-semibold ${
                                          w > l ? 'text-emerald-400' : w < l ? 'text-red-400' : 'text-neutral-400'
                                        }`}>
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
                      Simulation Monte Carlo
                    </h3>
                    <p className="text-xs text-neutral-500 mb-4">
                      Lance N simulations completes du tournoi pour calculer les probabilites de victoire
                      et la distribution des placements de chaque equipe.
                      {stages.flatMap(s => s.matches).some(m => m.locked) && (
                        <span className="text-amber-400 ml-1">Les matchs verrouilles sont preserves.</span>
                      )}
                    </p>
                    <div className="flex items-center gap-4 mb-6">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">Iterations</label>
                        <div className="flex gap-2">
                          {[100, 500, 1000, 5000].map(n => (
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
                        {monteCarloRunning ? 'Calcul en cours...' : `Lancer ${monteCarloIterations} simulations`}
                      </button>
                    </div>

                    {monteCarloResult && (
                      <div className="space-y-6">
                        <p className="text-xs text-neutral-500">{monteCarloResult.iterations} iterations completees</p>

                        {/* Win probability ranking */}
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">Probabilite de victoire</h4>
                          <div className="space-y-2">
                            {teams
                              .map(t => ({ team: t, prob: monteCarloResult.winProbability.get(t.id) ?? 0, wins: monteCarloResult.winCounts.get(t.id) ?? 0 }))
                              .sort((a, b) => b.prob - a.prob)
                              .map((row, i) => (
                                <div key={row.team.id} className="flex items-center gap-3">
                                  <span className="w-6 text-xs font-bold text-neutral-500">{i + 1}</span>
                                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
                                    SEED_COLORS[row.team.seed] ?? 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
                                  }`}>{row.team.seed}</span>
                                  <span className="text-sm font-medium w-40 truncate">{row.team.name}</span>
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
                          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-3">Distribution des placements (Top 8)</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/10">
                                  <th className="text-left py-2 pr-4 text-neutral-500 font-semibold">Equipe</th>
                                  {Array.from({ length: Math.min(teams.length, 8) }, (_, i) => (
                                    <th key={i} className="text-center py-2 px-2 text-neutral-500 font-semibold">
                                      {i === 0 ? '1er' : i === 1 ? '2e' : `${i + 1}e`}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {teams
                                  .map(t => ({ team: t, dist: monteCarloResult.placementDist.get(t.id) ?? [] }))
                                  .sort((a, b) => (b.dist[0] ?? 0) - (a.dist[0] ?? 0))
                                  .slice(0, 8)
                                  .map(row => (
                                    <tr key={row.team.id} className="border-b border-white/[0.03]">
                                      <td className="py-2 pr-4 font-medium">{row.team.short_name}</td>
                                      {Array.from({ length: Math.min(teams.length, 8) }, (_, i) => {
                                        const count = row.dist[i] ?? 0;
                                        const pct = monteCarloResult.iterations > 0 ? Math.round((count / monteCarloResult.iterations) * 100) : 0;
                                        return (
                                          <td key={i} className="text-center py-2 px-2">
                                            <span className={`tabular-nums ${
                                              pct > 30 ? 'text-emerald-400 font-bold' :
                                              pct > 15 ? 'text-sky-400' :
                                              pct > 5 ? 'text-neutral-300' : 'text-neutral-600'
                                            }`}>
                                              {pct > 0 ? `${pct}%` : '-'}
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
                        Historique des simulations
                      </h3>
                      {simHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSimHistory([])}
                          className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                        >
                          Vider l&apos;historique
                        </button>
                      )}
                    </div>
                    {simHistory.length === 0 ? (
                      <p className="text-sm text-neutral-500">
                        Aucune simulation sauvegardee. Lancez une simulation puis cliquez sur &quot;Sauvegarder&quot; pour l&apos;ajouter ici.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {simHistory.map((entry, idx) => (
                          <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.01] p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-neutral-500">#{simHistory.length - idx}</span>
                                <span className="text-xs text-neutral-400">
                                  {new Date(entry.timestamp).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                  {FORMAT_LABELS[entry.formatType]}
                                </span>
                                <span className="text-[10px] text-neutral-500">{entry.teamCount} equipes · BO{entry.bestOf}</span>
                              </div>
                              <div className="flex gap-4 text-[10px]">
                                <span className="text-amber-400" title="Matchs serres">{entry.competitiveness.closeMatchPct}% serres</span>
                                <span className="text-rose-400" title="Upsets">{entry.competitiveness.upsets} upsets</span>
                              </div>
                            </div>
                            {/* Top 5 standings */}
                            <div className="flex gap-4 flex-wrap">
                              {entry.standings.slice(0, 5).map((s, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <span className={`text-xs font-bold ${
                                    i === 0 ? 'text-amber-400' : i === 1 ? 'text-neutral-300' : i === 2 ? 'text-orange-400' : 'text-neutral-500'
                                  }`}>
                                    {i + 1}.
                                  </span>
                                  <span className="text-xs text-neutral-300">{s.name}</span>
                                  <span className="text-[10px] text-neutral-600">{s.wins}V-{s.losses}D</span>
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
                      Comparer avec un autre format
                    </h3>
                    <p className="text-xs text-neutral-500 mb-4">
                      Selectionnez un format alternatif pour comparer cote a cote avec la configuration actuelle ({FORMAT_LABELS[config.formatType]}).
                      Les memes equipes seront utilisees.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(Object.keys(FORMAT_LABELS) as FormatType[])
                        .filter(f => f !== config.formatType && f !== 'showmatch')
                        .map(f => {
                          const tc = (f === 'single_elim' || f === 'double_elim')
                            ? [4, 8, 16, 32].includes(config.teamCount) ? config.teamCount : 8
                            : config.teamCount;
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() => handleCompare({
                                formatType: f,
                                teamCount: tc,
                                ...(f === 'double_elim' ? { grandFinalReset: true } : {}),
                              })}
                              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                compareConfig?.formatType === f
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                              }`}
                            >
                              vs {FORMAT_LABELS[f]}
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
                          Regenerer
                        </button>
                        <button
                          type="button"
                          onClick={() => { setCompareData(null); setCompareConfig(null); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
                        >
                          Effacer
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
                            Actuel
                          </span>
                          <span className="text-sm font-semibold">{FORMAT_LABELS[config.formatType]}</span>
                          <span className="text-xs text-neutral-500">{teams.length} equipes · BO{config.bestOf}</span>
                        </div>
                        <div className="text-xs text-neutral-400 space-y-1">
                          <div>Matchs: {stages.flatMap(s => s.matches).length}</div>
                          <div>Rounds: {new Set(stages.flatMap(s => s.matches).map(m => `${m.bracket_side}-${m.round_number}`)).size}</div>
                        </div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          {stages.map((stage, stageIdx) => (
                            <div key={stage.id} className="mb-4">
                              <p className="text-xs font-semibold text-purple-300 mb-2">{stage.name}</p>
                              <EliminationView
                                rounds={groupByRound(stage.matches, stage.stage_type === 'bracket' ? 'wb' : undefined)}
                                onSimulate={id => handleSimulateMatch(stageIdx, id)}
                                onReset={id => handleResetMatch(stageIdx, id)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Compare config */}
                      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.02] p-4 space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/20">
                            Comparaison
                          </span>
                          <span className="text-sm font-semibold">{FORMAT_LABELS[compareConfig?.formatType ?? config.formatType]}</span>
                          <span className="text-xs text-neutral-500">{compareData.teams.length} equipes · BO{config.bestOf}</span>
                        </div>
                        <div className="text-xs text-neutral-400 space-y-1">
                          <div>Matchs: {compareData.stages.flatMap(s => s.matches).length}</div>
                          <div>Rounds: {new Set(compareData.stages.flatMap(s => s.matches).map(m => `${m.bracket_side}-${m.round_number}`)).size}</div>
                        </div>
                        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          {compareData.stages.map(stage => (
                            <div key={stage.id} className="mb-4">
                              <p className="text-xs font-semibold text-sky-300 mb-2">{stage.name}</p>
                              <EliminationView
                                rounds={groupByRound(stage.matches, stage.stage_type === 'bracket' ? 'wb' : undefined)}
                                onSimulate={() => {}}
                                onReset={() => {}}
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
                      Calendrier des occurrences
                    </h3>
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-purple-500/20" />

                      <div className="space-y-6">
                        {occurrences.map((occ, i) => {
                          const allMatches = occ.stages.flatMap(s => s.matches);
                          const finished = allMatches.filter(m => m.status === 'finished').length;
                          const total = allMatches.length;
                          const firstDate = allMatches.find(m => m.scheduled_at)?.scheduled_at;
                          const lastDate = [...allMatches].reverse().find(m => m.scheduled_at)?.scheduled_at;
                          const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

                          return (
                            <div key={i} className="flex gap-4 items-start">
                              {/* Dot on the line */}
                              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs font-bold ${
                                activeOccurrence === i
                                  ? 'bg-purple-600 border-purple-400 text-white'
                                  : pct === 100
                                    ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300'
                                    : 'bg-neutral-800 border-neutral-600 text-neutral-400'
                              }`}>
                                {i + 1}
                              </div>

                              {/* Card */}
                              <button
                                type="button"
                                onClick={() => { setActiveOccurrence(i); setActiveTab('bracket'); }}
                                className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                                  activeOccurrence === i
                                    ? 'border-purple-500/30 bg-purple-500/5'
                                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold">{occ.label}</span>
                                  <span className={`text-xs font-bold tabular-nums ${
                                    pct === 100 ? 'text-emerald-400' : pct > 0 ? 'text-amber-400' : 'text-neutral-500'
                                  }`}>
                                    {pct}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-neutral-400">
                                  {firstDate && (
                                    <span>Debut: {formatMatchDate(firstDate)}</span>
                                  )}
                                  {lastDate && lastDate !== firstDate && (
                                    <span>Fin: {formatMatchDate(lastDate)}</span>
                                  )}
                                  <span>{total} matchs</span>
                                  <span>{occ.teams.length} equipes</span>
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
                      Resume global
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Total matchs</div>
                        <div className="text-2xl font-bold mt-1">
                          {occurrences.reduce((sum, occ) => sum + occ.stages.flatMap(s => s.matches).length, 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Termines</div>
                        <div className="text-2xl font-bold mt-1 text-emerald-400">
                          {occurrences.reduce((sum, occ) => sum + occ.stages.flatMap(s => s.matches).filter(m => m.status === 'finished').length, 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Duree totale</div>
                        <div className="text-2xl font-bold mt-1 text-purple-400">
                          {(() => {
                            const allDates = occurrences.flatMap(occ =>
                              occ.stages.flatMap(s => s.matches).map(m => m.scheduled_at).filter(Boolean) as string[]
                            );
                            if (allDates.length < 2) return '—';
                            const sorted = allDates.sort();
                            const first = new Date(sorted[0]);
                            const last = new Date(sorted[sorted.length - 1]);
                            const days = Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
                            return `${days}j`;
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Equipes uniques</div>
                        <div className="text-2xl font-bold mt-1 text-sky-400">
                          {new Set(occurrences.flatMap(occ => occ.teams.map(t => t.name))).size}
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

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

export default TournamentSimulatorPage;
