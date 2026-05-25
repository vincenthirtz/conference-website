// config/games/lol.ts
// League of Legends — Tournament Draft (Riot competitive ruleset).
// hasMapVeto = false (1 seule map : Summoner's Rift), hasDraft = true.

import type { GameDef } from './index';
import type { DraftFlow } from '@/types/draft';

/**
 * LoL Tournament Draft (BO1 / BO3 / BO5).
 * Phase 1 bans (3 par équipe alternés), pick phase 1 (1-2-2-2-2-1),
 * phase 2 bans (2 par équipe alternés en partant de Red), pick phase 2 (1-2-1).
 * Total : 10 bans + 10 picks = 20 étapes. Identique pour tous les formats.
 */
const LOL_TOURNAMENT_DRAFT: DraftFlow = {
  fearless: false,
  steps: [
    // Phase 1 bans (Blue / Red alternés × 3)
    { step_number: 1, phase: 'ban_1', action: 'ban', side: 'team1' },
    { step_number: 2, phase: 'ban_1', action: 'ban', side: 'team2' },
    { step_number: 3, phase: 'ban_1', action: 'ban', side: 'team1' },
    { step_number: 4, phase: 'ban_1', action: 'ban', side: 'team2' },
    { step_number: 5, phase: 'ban_1', action: 'ban', side: 'team1' },
    { step_number: 6, phase: 'ban_1', action: 'ban', side: 'team2' },
    // Phase 1 picks : Blue (1) - Red (2) - Blue (2) - Red (1)
    { step_number: 7, phase: 'pick_1', action: 'pick', side: 'team1' },
    { step_number: 8, phase: 'pick_1', action: 'pick', side: 'team2' },
    { step_number: 9, phase: 'pick_1', action: 'pick', side: 'team2' },
    { step_number: 10, phase: 'pick_1', action: 'pick', side: 'team1' },
    { step_number: 11, phase: 'pick_1', action: 'pick', side: 'team1' },
    { step_number: 12, phase: 'pick_1', action: 'pick', side: 'team2' },
    // Phase 2 bans : Red commence (Red - Blue × 2)
    { step_number: 13, phase: 'ban_2', action: 'ban', side: 'team2' },
    { step_number: 14, phase: 'ban_2', action: 'ban', side: 'team1' },
    { step_number: 15, phase: 'ban_2', action: 'ban', side: 'team2' },
    { step_number: 16, phase: 'ban_2', action: 'ban', side: 'team1' },
    // Phase 2 picks : Red (1) - Blue (2) - Red (1)
    { step_number: 17, phase: 'pick_2', action: 'pick', side: 'team2' },
    { step_number: 18, phase: 'pick_2', action: 'pick', side: 'team1' },
    { step_number: 19, phase: 'pick_2', action: 'pick', side: 'team1' },
    { step_number: 20, phase: 'pick_2', action: 'pick', side: 'team2' },
  ],
};

export const LOL: GameDef = {
  slug: 'lol',
  label: 'League of Legends',
  hasMapVeto: false,
  hasDraft: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [],
  draftFlows: {
    bo1: LOL_TOURNAMENT_DRAFT,
    bo3: LOL_TOURNAMENT_DRAFT,
    bo5: LOL_TOURNAMENT_DRAFT,
  },
};
