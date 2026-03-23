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

type SimMap = { name: string; mode: string };

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

/* ------------------------------------------------------------------ */
/*  Bracket generators                                                 */
/* ------------------------------------------------------------------ */

function generateSingleElim(teams: SimTeam[], bestOf: number, mapPool: string[], startDate: string | null): SimStage {
  const size = teams.length;
  const rounds = Math.log2(size);
  const matches: SimMatch[] = [];
  let matchIndex = 0;

  for (let r = 0; r < rounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    let roundName: string;
    if (r + 1 === rounds) roundName = 'Finale';
    else if (r + 1 === rounds - 1) roundName = 'Demi-finales';
    else if (r + 1 === rounds - 2 && rounds >= 3) roundName = 'Quarts de finale';
    else roundName = `Round ${r + 1}`;

    for (let m = 0; m < matchesInRound; m++) {
      const isFirstRound = r === 0;
      const t1 = isFirstRound ? teams[m * 2] : null;
      const t2 = isFirstRound ? teams[m * 2 + 1] : null;

      const scheduled = startDate
        ? new Date(new Date(startDate).getTime() + (r * 120 + m * 30) * 60000).toISOString()
        : null;

      matches.push({
        id: fakeId(),
        round_number: r + 1,
        round_name: roundName,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: t1 ?? null,
        team2: t2 ?? null,
        team1_id: t1?.id ?? null,
        team2_id: t2?.id ?? null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: scheduled,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'wb',
        next_match_win_idx: r + 1 < rounds ? matchIndex + matchesInRound - m + Math.floor(m / 2) : null,
        next_match_win_slot: r + 1 < rounds ? ((m % 2 === 0 ? 1 : 2) as 1 | 2) : null,
        next_match_lose_idx: null,
        next_match_lose_slot: null,
      });
      matchIndex++;
    }
  }

  // Fix next_match pointers
  let offset = 0;
  for (let r = 0; r < rounds - 1; r++) {
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

function generateDoubleElim(teams: SimTeam[], bestOf: number, mapPool: string[], startDate: string | null, grandFinalReset: boolean): SimStage {
  // WB matches
  const single = generateSingleElim(teams, bestOf, mapPool, startDate);
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

function generateSwiss(teams: SimTeam[], rounds: number, bestOf: number, mapPool: string[]): SimStage {
  const matches: SimMatch[] = [];
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
        scheduled_at: null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'none',
        next_match_win_idx: null, next_match_win_slot: null,
        next_match_lose_idx: null, next_match_lose_slot: null,
      });
    }
  }
  return { id: fakeId(), name: 'Swiss System', stage_type: 'swiss', matches };
}

function generateRoundRobin(teams: SimTeam[], bestOf: number, mapPool: string[]): SimStage {
  const matches: SimMatch[] = [];
  let round = 1;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push({
        id: fakeId(),
        round_number: round,
        round_name: `Journée ${round}`,
        position_in_round: matches.length + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: teams[i],
        team2: teams[j],
        team1_id: teams[i].id,
        team2_id: teams[j].id,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'none',
        next_match_win_idx: null, next_match_win_slot: null,
        next_match_lose_idx: null, next_match_lose_slot: null,
      });
      if ((matches.length) % Math.floor(teams.length / 2) === 0) round++;
    }
  }
  return { id: fakeId(), name: 'Round Robin', stage_type: 'round_robin', matches };
}

/* ------------------------------------------------------------------ */
/*  Simulation: auto-play matches with random scores                   */
/* ------------------------------------------------------------------ */

function simulateMatch(match: SimMatch): SimMatch {
  if (match.status !== 'pending' || !match.team1 || !match.team2) return match;
  const winsNeeded = Math.ceil(match.best_of / 2);
  let s1 = 0, s2 = 0;
  while (s1 < winsNeeded && s2 < winsNeeded) {
    if (Math.random() > 0.5) s1++; else s2++;
  }
  const winner = s1 > s2 ? match.team1 : match.team2;
  return {
    ...match,
    team1_score: s1,
    team2_score: s2,
    winner_team_id: winner.id,
    status: 'finished',
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

      {/* Maps */}
      {match.maps.length > 0 && (
        <div className="border-t border-white/[0.05] px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {match.maps.map((map, i) => (
              <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-500">
                {map.name}
              </span>
            ))}
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
  startDate: string;
  stageCount: number;
};

const FORMAT_LABELS: Record<FormatType, string> = {
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  swiss: 'Swiss System',
  round_robin: 'Round Robin',
  showmatch: 'Showmatch',
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
    startDate: '',
    stageCount: 1,
  });

  const [stages, setStages] = useState<SimStage[]>([]);
  const [teams, setTeams] = useState<SimTeam[]>([]);
  const [mapPool, setMapPool] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState<'bracket' | 'teams' | 'maps' | 'stats'>('bracket');

  const validTeamCounts = config.formatType === 'single_elim' || config.formatType === 'double_elim'
    ? [4, 8, 16, 32]
    : [4, 6, 8, 10, 12, 16];

  const handleGenerate = useCallback(() => {
    _idCounter = 0;
    const pool = FAKE_MAPS.slice(0, config.mapPoolSize);
    const newTeams = generateTeams(config.teamCount, config.playersPerTeam);
    const newStages: SimStage[] = [];

    const startDate = config.startDate || null;

    if (config.stageCount >= 2 && config.formatType !== 'showmatch') {
      // Multi-stage: groups → bracket
      const groupStage = generateRoundRobin(newTeams, config.bestOf, pool);
      groupStage.name = 'Phase de groupes';
      groupStage.stage_type = 'group';
      newStages.push(groupStage);

      const topTeams = newTeams.slice(0, Math.min(newTeams.length, 8));
      const bracketStage = generateSingleElim(topTeams, config.bestOf, pool, startDate);
      bracketStage.name = 'Phase finale';
      newStages.push(bracketStage);
    } else {
      switch (config.formatType) {
        case 'single_elim':
          newStages.push(generateSingleElim(newTeams, config.bestOf, pool, startDate));
          break;
        case 'double_elim':
          newStages.push(generateDoubleElim(newTeams, config.bestOf, pool, startDate, config.grandFinalReset));
          break;
        case 'swiss':
          newStages.push(generateSwiss(newTeams, config.swissRounds, config.bestOf, pool));
          break;
        case 'round_robin':
          newStages.push(generateRoundRobin(newTeams, config.bestOf, pool));
          break;
        case 'showmatch': {
          const showmatch = generateSingleElim(newTeams.slice(0, 2), config.bestOf, pool, startDate);
          showmatch.name = 'Showmatch';
          showmatch.stage_type = 'showmatch';
          newStages.push(showmatch);
          break;
        }
      }
    }

    setTeams(newTeams);
    setMapPool(pool);
    setStages(newStages);
    setGenerated(true);
    setActiveTab('bracket');
  }, [config]);

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
  }, []);

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
  }, []);

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
  }, []);

  const handleResetAll = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  // Stats computation
  const stats = useMemo(() => {
    const allMatches = stages.flatMap(s => s.matches);
    const total = allMatches.length;
    const finished = allMatches.filter(m => m.status === 'finished').length;
    const pending = allMatches.filter(m => m.status === 'pending').length;

    // Win counts
    const wins = new Map<string, number>();
    const losses = new Map<string, number>();
    for (const m of allMatches) {
      if (m.status !== 'finished' || !m.winner_team_id) continue;
      wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
      const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
      if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }

    // Map usage
    const mapCount = new Map<string, number>();
    for (const m of allMatches) {
      for (const map of m.maps) {
        mapCount.set(map.name, (mapCount.get(map.name) ?? 0) + 1);
      }
    }

    return { total, finished, pending, wins, losses, mapCount };
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
            <h2 className="text-lg font-semibold">Configuration</h2>

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

              {/* Start date */}
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">Date de debut</label>
                <input
                  type="datetime-local"
                  value={config.startDate}
                  onChange={e => setConfig(c => ({ ...c, startDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold shadow transition-colors"
            >
              Generer le tournoi
            </button>
          </div>

          {/* Generated content */}
          {generated && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <SummaryCard label="Equipes" value={teams.length} />
                <SummaryCard label="Matchs" value={stats.total} />
                <SummaryCard label="Termines" value={stats.finished} color="text-emerald-400" />
                <SummaryCard label="En attente" value={stats.pending} color="text-amber-400" />
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-6 border-b border-white/10 pb-px">
                {(['bracket', 'teams', 'maps', 'stats'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                      activeTab === tab
                        ? 'bg-white/10 text-white border-b-2 border-purple-500'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab === 'bracket' ? 'Bracket / Matchs' : tab === 'teams' ? 'Equipes' : tab === 'maps' ? 'Maps' : 'Statistiques'}
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
                  {/* Standings */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                    <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-neutral-400">Classement</h3>
                    <div className="space-y-1">
                      <div className="grid grid-cols-[auto_1fr_60px_60px_60px] gap-2 text-[10px] uppercase tracking-wider text-neutral-600 font-bold px-3 pb-2">
                        <span className="w-6">#</span>
                        <span>Equipe</span>
                        <span className="text-center">V</span>
                        <span className="text-center">D</span>
                        <span className="text-center">%</span>
                      </div>
                      {teams
                        .map(t => ({
                          team: t,
                          wins: stats.wins.get(t.id) ?? 0,
                          losses: stats.losses.get(t.id) ?? 0,
                        }))
                        .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
                        .map((row, i) => {
                          const total = row.wins + row.losses;
                          const pct = total > 0 ? Math.round((row.wins / total) * 100) : 0;
                          return (
                            <div
                              key={row.team.id}
                              className={`grid grid-cols-[auto_1fr_60px_60px_60px] gap-2 items-center px-3 py-2 rounded-lg text-sm ${
                                i < 3 ? 'bg-emerald-500/5 border border-emerald-500/10' : i % 2 === 0 ? 'bg-white/[0.01]' : ''
                              }`}
                            >
                              <span className="w-6 text-xs font-bold text-neutral-500">{i + 1}</span>
                              <span className="font-medium truncate">{row.team.name}</span>
                              <span className="text-center font-bold text-emerald-400">{row.wins}</span>
                              <span className="text-center font-bold text-red-400">{row.losses}</span>
                              <span className="text-center text-neutral-400">{pct}%</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Match format distribution */}
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
                    <p className="text-xs text-neutral-500 mt-2">
                      {stats.finished} / {stats.total} matchs termines
                    </p>
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

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color ?? 'text-white'}`}>{value}</div>
    </div>
  );
}

export default TournamentSimulatorPage;
