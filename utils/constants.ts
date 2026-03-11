// utils/constants.ts
// Centralized enums and constants used across API routes and components.
// Import from here instead of redefining locally.

import type { MatchStatus, BracketSide, StageType, TournamentStatus } from '@/types/admin';

export const VALID_TOURNAMENT_STATUSES: TournamentStatus[] = [
  'draft',
  'published',
  'running',
  'completed',
  'archived',
];

export const VALID_MATCH_STATUSES: MatchStatus[] = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
];

export const VALID_BRACKET_SIDES: BracketSide[] = [
  'wb',
  'lb',
  'final',
  'none',
];

export const VALID_STAGE_TYPES: StageType[] = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
];

export const VALID_PARTNERSHIP_STATUSES = [
  'new',
  'read',
  'contacted',
  'negotiating',
  'accepted',
  'declined',
  'archived',
] as const;
