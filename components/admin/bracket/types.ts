// components/admin/bracket/types.ts
// Shared types for bracket-builder sub-components

import type { MatchStatus } from '@/types/admin';

export type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export type ScheduleMatch = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  round_number: number | null;
  round_name: string | null;
  position_in_round: number | null;
  status: MatchStatus;
  match_format: string | null;
  best_of: number | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;
  winner_team_id: string | null;
  notes: string | null;
  bracket_side?: 'wb' | 'lb' | 'final' | 'none' | null;
  next_match_win_id?: string | null;
  next_match_lose_id?: string | null;
  column_index?: number | null;
  row_index?: number | null;
};

export type TournamentTeam = {
  id: string;
  team_id: string;
  seed: number | null;
  team: { id: string; name: string; logo_url: string | null };
};

export type DragPayload = { matchId: string; slot: 1 | 2 };

export type BracketRound = {
  roundNumber: number;
  roundName: string;
  matches: ScheduleMatch[];
};

export type MatchDay = {
  dateKey: string;
  label: string;
  roundName: string | null;
  matches: ScheduleMatch[];
};

/** Parse "Seed 7 vs Seed 1 — Plaid SPC" → { seed1, seed2, venue } */
export function parseNotes(notes: string | null) {
  if (!notes) return null;
  const m = notes.match(
    /Seed\s*(\d+)\s*vs\s*Seed\s*(\d+)\s*(?:—|–|-)\s*(.+)/i
  );
  if (m) return { seed1: m[1], seed2: m[2], venue: m[3].trim() };
  if (notes.toLowerCase().includes('disponible'))
    return { seed1: null, seed2: null, venue: 'Plaid SPC' };
  return null;
}
