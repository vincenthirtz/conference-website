// config/games/dota2.ts
// Dota 2 — Captains Mode (Valve ranked / esports ruleset, patch 7.34+).
// hasMapVeto = false (1 seule map), hasDraft = true.

import type { GameDef } from './index';
import type { DraftFlow } from '@/types/draft';

/**
 * Dota 2 Captains Mode (current Valve format).
 * Phase 1 : 4 bans alternés (2 par équipe) → 4 picks alternés (2/2).
 * Phase 2 : 3 bans alternés → 4 picks alternés (2/2).
 * Phase 3 : 2 bans alternés → 2 picks alternés (1/1).
 * Total : 9 bans + 10 picks = 19 étapes.
 */
const DOTA2_CAPTAINS_MODE: DraftFlow = {
  fearless: false,
  steps: [
    // Phase 1 bans (4 alternés)
    { step_number: 1, phase: 'ban_1', action: 'ban', side: 'team1' },
    { step_number: 2, phase: 'ban_1', action: 'ban', side: 'team2' },
    { step_number: 3, phase: 'ban_1', action: 'ban', side: 'team1' },
    { step_number: 4, phase: 'ban_1', action: 'ban', side: 'team2' },
    // Phase 1 picks (4 alternés)
    { step_number: 5, phase: 'pick_1', action: 'pick', side: 'team1' },
    { step_number: 6, phase: 'pick_1', action: 'pick', side: 'team2' },
    { step_number: 7, phase: 'pick_1', action: 'pick', side: 'team2' },
    { step_number: 8, phase: 'pick_1', action: 'pick', side: 'team1' },
    // Phase 2 bans (3 alternés)
    { step_number: 9, phase: 'ban_2', action: 'ban', side: 'team1' },
    { step_number: 10, phase: 'ban_2', action: 'ban', side: 'team2' },
    { step_number: 11, phase: 'ban_2', action: 'ban', side: 'team1' },
    // Phase 2 picks (4 alternés)
    { step_number: 12, phase: 'pick_2', action: 'pick', side: 'team2' },
    { step_number: 13, phase: 'pick_2', action: 'pick', side: 'team1' },
    { step_number: 14, phase: 'pick_2', action: 'pick', side: 'team1' },
    { step_number: 15, phase: 'pick_2', action: 'pick', side: 'team2' },
    // Phase 3 bans (2 alternés)
    { step_number: 16, phase: 'ban_3', action: 'ban', side: 'team1' },
    { step_number: 17, phase: 'ban_3', action: 'ban', side: 'team2' },
    // Phase 3 picks (2 alternés)
    { step_number: 18, phase: 'pick_3', action: 'pick', side: 'team2' },
    { step_number: 19, phase: 'pick_3', action: 'pick', side: 'team1' },
  ],
};

export const DOTA2: GameDef = {
  slug: 'dota2',
  label: 'Dota 2',
  hasMapVeto: false,
  hasDraft: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [],
  draftFlows: {
    bo1: DOTA2_CAPTAINS_MODE,
    bo3: DOTA2_CAPTAINS_MODE,
    bo5: DOTA2_CAPTAINS_MODE,
  },
};
