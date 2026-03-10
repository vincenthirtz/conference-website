import type { BracketSide, MatchStatus } from './admin';

/* -----------------------------------------------------------
 * buildGraph types
 * ---------------------------------------------------------*/

export type MatchForGraph = {
  id: string;
  tournament_id: string;
  bracket_side: BracketSide;
  round_number: number | null;
  group_key: string | null;

  next_match_win_id: string | null;
  next_match_lose_id: string | null;
};

export type BracketMatchNode = {
  id: string;
  tournamentId: string;
  side: BracketSide;
  groupKey: string | null;
  roundNumber: number | null;

  nextWinId: string | null;
  nextLoseId: string | null;

  incomingFrom: string[];
  outgoingTo: string[];
};

export type BracketGraph = {
  nodes: Record<string, BracketMatchNode>;
  rootsBySideAndGroup: Record<string, string[]>;
  leavesBySideAndGroup: Record<string, string[]>;
};

export type BracketColumn = {
  matchIds: string[];
};

export type BracketColumnsByKey = Record<string, BracketColumn[]>;

/* -----------------------------------------------------------
 * computePaths types
 * ---------------------------------------------------------*/

export type MatchPosition = {
  sideGroupKey: string;
  columnIndex: number;
  rowIndex: number;
};

export type BracketEdgePath = {
  fromMatchId: string;
  toMatchId: string;
  from: MatchPosition;
  to: MatchPosition;
};

export type BracketLayout = {
  columnsByKey: BracketColumnsByKey;
  positions: Record<string, MatchPosition>;
  edges: BracketEdgePath[];
};

/* -----------------------------------------------------------
 * propagate types
 * ---------------------------------------------------------*/

export type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;

  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;

  bracket_side: BracketSide;
  round_number: number | null;
  group_key: string | null;

  next_match_win_id: string | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_id: string | null;
  next_match_lose_slot: 1 | 2 | null;
};

export type PropagationResult = {
  matchId: string;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  updatedWinMatchId?: string | null;
  updatedLoseMatchId?: string | null;
};
