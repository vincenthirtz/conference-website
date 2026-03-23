// pages/admin/tournament-simulator.tsx
// Simulateur visuel de tournoi avec données fictives pour tester les configurations

import { useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import type { MatchStatus, FormatType, StageType } from '@/types/admin';

export const getServerSideProps = withStaffPage('manager');

/* ------------------------------------------------------------------ */
/*  Scheduling helpers                                                  */
/* ------------------------------------------------------------------ */

type ScheduleConfig = {
  startDate: string;           // ISO date-time string
  matchDurationMin: number;    // minutes per match
  breakBetweenMatchesMin: number; // break between consecutive matches
  breakBetweenRoundsMin: number;  // additional break between rounds
  dayStartHour: number;        // e.g. 9 (09:00)
  dayEndHour: number;          // e.g. 22 (22:00)
  matchesPerDay: number;       // max matches per day (0 = unlimited)
};

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

/** Compute real scheduled_at for each match, respecting day hours and breaks */
function computeSchedule(
  matchCount: number,
  roundNumbers: number[],
  schedule: ScheduleConfig,
): (string | null)[] {
  if (!schedule.startDate) return Array(matchCount).fill(null);

  const results: (string | null)[] = [];
  let cursor = new Date(schedule.startDate);

  // Snap to day start if before
  if (cursor.getHours() < schedule.dayStartHour) {
    cursor.setHours(schedule.dayStartHour, 0, 0, 0);
  }

  let lastRound = roundNumbers[0] ?? 1;
  let matchesToday = 0;

  for (let i = 0; i < matchCount; i++) {
    const currentRound = roundNumbers[i] ?? 1;

    // Add round break if round changed
    if (currentRound !== lastRound) {
      cursor = new Date(cursor.getTime() + schedule.breakBetweenRoundsMin * 60000);
      lastRound = currentRound;
      matchesToday = 0; // reset daily count on new round
    }

    // Check daily limits
    if (schedule.matchesPerDay > 0 && matchesToday >= schedule.matchesPerDay) {
      // Move to next day
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(schedule.dayStartHour, 0, 0, 0);
      matchesToday = 0;
    }

    // Check if past day end
    if (cursor.getHours() >= schedule.dayEndHour) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(schedule.dayStartHour, 0, 0, 0);
      matchesToday = 0;
    }

    results.push(cursor.toISOString());
    matchesToday++;

    // Advance cursor for next match
    cursor = new Date(cursor.getTime() + (schedule.matchDurationMin + schedule.breakBetweenMatchesMin) * 60000);
  }

  return results;
}

/** Format a date for display */
function formatMatchDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/** Get best-of for a given round with escalation */
function getBestOfForRound(
  roundNumber: number,
  totalRounds: number,
  escalation: EscalationConfig,
  baseBestOf: number,
): number {
  if (!escalation.enabled) return baseBestOf;
  // Finals
  if (roundNumber === totalRounds) return escalation.finalsBo;
  // Semis
  if (roundNumber === totalRounds - 1 && totalRounds >= 3) return escalation.semiFinalsBo;
  // Early rounds
  return escalation.earlyRoundsBo;
}

type EscalationConfig = {
  enabled: boolean;
  earlyRoundsBo: number;
  semiFinalsBo: number;
  finalsBo: number;
};

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

type SimTeam = {
  id: string;
  name: string;
  short_name: string;
  logo_url: null;
  seed: number;
  players: { name: string; battleTag: string }[];
};

type SimMap = { name: string; mode: string; winner_team_id?: string | null };

type SimMatch = {
  id: string;
  round_number: number;
  round_name: string;
  position_in_round: number;
  status: MatchStatus;
  match_format: string;
  best_of: number;
  team1: SimTeam | null;
  team2: SimTeam | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  maps: SimMap[];
  bracket_side: 'wb' | 'lb' | 'final' | 'none';
  next_match_win_idx: number | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_idx: number | null;
  next_match_lose_slot: 1 | 2 | null;
};

type SimStage = {
  id: string;
  name: string;
  stage_type: StageType;
  matches: SimMatch[];
};

function generateTeams(count: number, playersPerTeam: number): SimTeam[] {
  const shuffled = [...FAKE_TEAM_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({
    id: fakeId(),
    name: shuffled[i % shuffled.length],
    short_name: shuffled[i % shuffled.length].split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase(),
    logo_url: null,
    seed: i + 1,
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

/** Standard tournament seeding order for bracket of given size.
 *  Returns pairs like [0,7,3,4,1,6,2,5] for size=8
 *  so that seed 1 plays seed 8, seed 4 plays seed 5, etc. */
function bracketSeedOrder(size: number): number[] {
  if (size <= 1) return [0];
  if (size === 2) return [0, 1];
  const half = bracketSeedOrder(size / 2);
  const result: number[] = [];
  for (const s of half) {
    result.push(s, size - 1 - s);
  }
  return result;
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
      });
      matchIndex++;
      schedIdx++;
    }
  }

  // Fix next_match pointers
  let offset = 0;
  for (let r = 0; r < totalRounds - 1; r++) {
    const countInRound = size / Math.pow(2, r + 1);
    const nextOffset = offset + countInRound;
    for (let m = 0; m < countInRound; m++) {
      matches[offset + m].next_match_win_idx = nextOffset + Math.floor(m / 2);
      matches[offset + m].next_match_win_slot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
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
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const matchesInRound = Math.floor(shuffled.length / 2);
    for (let m = 0; m < matchesInRound; m++) {
      matches.push({
        id: fakeId(),
        round_number: r + 1,
        round_name: `Round ${r + 1}`,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: shuffled[m * 2],
        team2: shuffled[m * 2 + 1],
        team1_id: shuffled[m * 2].id,
        team2_id: shuffled[m * 2 + 1].id,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: scheduledDates[schedIdx] ?? null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'none',
        next_match_win_idx: null, next_match_win_slot: null,
        next_match_lose_idx: null, next_match_lose_slot: null,
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

  const matches: SimMatch[] = rawMatches.map((raw, idx) => ({
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
  }));

  return { id: fakeId(), name: 'Round Robin', stage_type: 'round_robin', matches };
}

/* ------------------------------------------------------------------ */
/*  Simulation: auto-play matches with random scores                   */
/* ------------------------------------------------------------------ */

function simulateMatch(match: SimMatch): SimMatch {
  if (match.status !== 'pending' || !match.team1 || !match.team2) return match;

  // Seed-based win probability: lower seed = higher chance
  // Seed 1 vs seed 8: ~65% for seed 1. Equal seeds: 50/50.
  const s1Seed = match.team1.seed;
  const s2Seed = match.team2.seed;
  const seedDiff = s2Seed - s1Seed; // positive means team1 has better seed
  const t1WinProb = 0.5 + seedDiff * 0.02; // +-2% per seed difference

  const winsNeeded = Math.ceil(match.best_of / 2);
  let s1 = 0, s2 = 0;
  const mapResults = [...match.maps];
  let mapIdx = 0;

  while (s1 < winsNeeded && s2 < winsNeeded) {
    const t1Wins = Math.random() < t1WinProb;
    if (t1Wins) s1++; else s2++;
    if (mapIdx < mapResults.length) {
      mapResults[mapIdx] = { ...mapResults[mapIdx], winner_team_id: t1Wins ? match.team1.id : match.team2.id };
      mapIdx++;
    }
  }

  const winner = s1 > s2 ? match.team1 : match.team2;
  return {
    ...match,
    team1_score: s1,
    team2_score: s2,
    winner_team_id: winner.id,
    status: 'finished',
    maps: mapResults,
  };
}

function propagateSingleElim(matches: SimMatch[]): SimMatch[] {
  const updated = [...matches];
  for (let i = 0; i < updated.length; i++) {
    const m = updated[i];
    if (m.status === 'finished' && m.winner_team_id && m.next_match_win_idx != null) {
      const nextIdx = m.next_match_win_idx;
      const nextSlot = m.next_match_win_slot;
      if (nextIdx < updated.length) {
        const winner = m.team1?.id === m.winner_team_id ? m.team1 : m.team2;
        if (nextSlot === 1) {
          updated[nextIdx] = { ...updated[nextIdx], team1: winner, team1_id: winner?.id ?? null };
        } else {
          updated[nextIdx] = { ...updated[nextIdx], team2: winner, team2_id: winner?.id ?? null };
        }
      }
    }
  }
  return updated;
}

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
}: {
  match: SimMatch;
  onSimulate: () => void;
  onReset: () => void;
}) {
  const statusCfg = STATUS_CONFIG[match.status];
  const t1Name = match.team1?.short_name ?? match.team1?.name ?? 'TBD';
  const t2Name = match.team2?.short_name ?? match.team2?.name ?? 'TBD';
  const w1 = match.winner_team_id === match.team1_id && !!match.winner_team_id;
  const w2 = match.winner_team_id === match.team2_id && !!match.winner_team_id;

  return (
    <div className="rounded-xl border overflow-hidden bg-[#12121a] border-white/[0.06] hover:border-purple-500/20 transition-all">
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

      {/* Actions */}
      <div className="flex border-t border-white/[0.05]">
        {match.status === 'pending' && match.team1 && match.team2 && (
          <button
            onClick={onSimulate}
            className="flex-1 text-[10px] py-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-colors font-semibold"
          >
            Simuler
          </button>
        )}
        {match.status === 'finished' && (
          <button
            onClick={onReset}
            className="flex-1 text-[10px] py-1.5 text-amber-400 hover:bg-amber-500/10 transition-colors font-semibold"
          >
            Reset
          </button>
        )}
        {match.status === 'pending' && (!match.team1 || !match.team2) && (
          <span className="flex-1 text-[10px] py-1.5 text-neutral-600 text-center italic">
            En attente
          </span>
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
  label,
  accentColor,
}: {
  rounds: RoundGroup[];
  onSimulate: (matchId: string) => void;
  onReset: (matchId: string) => void;
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
                    <SimMatchCard key={m.id} match={m} onSimulate={() => onSimulate(m.id)} onReset={() => onReset(m.id)} />
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
                        <SimMatchCard match={m} onSimulate={() => onSimulate(m.id)} onReset={() => onReset(m.id)} />
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
  const [activeTab, setActiveTab] = useState<'bracket' | 'teams' | 'maps' | 'stats' | 'timeline'>('bracket');
  const [configCollapsed, setConfigCollapsed] = useState(false);

  // Convenience accessors for current occurrence
  const stages = useMemo(() => occurrences[activeOccurrence]?.stages ?? [], [occurrences, activeOccurrence]);
  const teams = useMemo(() => occurrences[activeOccurrence]?.teams ?? [], [occurrences, activeOccurrence]);

  const setStages = useCallback((updater: (prev: SimStage[]) => SimStage[]) => {
    setOccurrences(prev => prev.map((occ, i) =>
      i === activeOccurrence ? { ...occ, stages: updater(occ.stages) } : occ
    ));
  }, [activeOccurrence]);

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
      if (mIdx === -1) return prev;
      stage.matches[mIdx] = simulateMatch(stage.matches[mIdx]);
      // Propagate for elimination brackets
      if (stage.stage_type === 'bracket') {
        stage.matches = propagateSingleElim(stage.matches);
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
      if (mIdx === -1) return prev;
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
      // For elimination, simulate round by round with propagation
      if (stage.stage_type === 'bracket') {
        const roundNums = [...new Set(matches.map(m => m.round_number))].sort((a, b) => a - b);
        for (const rn of roundNums) {
          for (let i = 0; i < matches.length; i++) {
            if (matches[i].round_number === rn && matches[i].status === 'pending') {
              matches[i] = simulateMatch(matches[i]);
            }
          }
          matches = propagateSingleElim(matches);
        }
      } else {
        matches = matches.map(m => m.status === 'pending' ? simulateMatch(m) : m);
      }
      return { ...stage, matches };
    }));
  }, [setStages]);

  /** Simulate only the next incomplete round across all stages */
  const handleSimulateNextRound = useCallback(() => {
    setStages(prev => prev.map(stage => {
      let matches = [...stage.matches];
      const pendingRounds = [...new Set(
        matches.filter(m => m.status === 'pending' && m.team1 && m.team2).map(m => m.round_number)
      )].sort((a, b) => a - b);
      if (pendingRounds.length === 0) return stage;
      const nextRound = pendingRounds[0];
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].round_number === nextRound && matches[i].status === 'pending') {
          matches[i] = simulateMatch(matches[i]);
        }
      }
      if (stage.stage_type === 'bracket') {
        matches = propagateSingleElim(matches);
      }
      return { ...stage, matches };
    }));
  }, [setStages]);

  const handleResetAll = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

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

    return { total, finished, pending, wins, losses, mapWins, mapLosses, mapCount, nextRound, nextRoundName, estimatedDuration };
  }, [stages]);

  return (
    <>
      <Head>
        <title>Admin · Simulateur de Tournoi</title>
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
              <div className="flex gap-2">
                <button
                  onClick={handleSimulateNextRound}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold shadow transition-colors"
                  title="Simule uniquement le prochain round jouable"
                >
                  Round suivant
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
              </div>
            )}
          </div>

          {/* Configuration panel */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 mb-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Configuration</h2>
              <div className="flex items-center gap-3">
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

            <button
              onClick={handleGenerate}
              className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold shadow transition-colors"
            >
              Generer le tournoi{config.occurrence.enabled ? ` (${config.occurrence.count} occurrences)` : ''}
            </button>
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
              <div className="flex gap-1 mb-6 border-b border-white/10 pb-px">
                {(['bracket', 'teams', 'maps', 'stats', ...(occurrences.length > 1 ? ['timeline' as const] : [])] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as typeof activeTab)}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                      activeTab === tab
                        ? 'bg-white/10 text-white border-b-2 border-purple-500'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab === 'bracket' ? 'Bracket / Matchs' : tab === 'teams' ? 'Equipes' : tab === 'maps' ? 'Maps' : tab === 'timeline' ? 'Timeline' : 'Statistiques'}
                  </button>
                ))}
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
                            label={stage.matches.some(m => m.bracket_side === 'lb') ? 'Winners Bracket' : undefined}
                          />
                          {/* LB */}
                          {stage.matches.some(m => m.bracket_side === 'lb') && (
                            <div className="mt-6">
                              <EliminationView
                                rounds={groupByRound(stage.matches, 'lb')}
                                onSimulate={id => handleSimulateMatch(stageIdx, id)}
                                onReset={id => handleResetMatch(stageIdx, id)}
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
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'teams' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {teams.map(team => (
                    <div key={team.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300">
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
