// config/games/rocket-league.ts
// Rocket League competitive play uses a fixed arena (DFH Stadium / standard maps)
// without a map veto — the entire tournament logic skips the veto phase.

import type { GameDef } from './index';

export const ROCKET_LEAGUE: GameDef = {
  slug: 'rocket-league',
  label: 'Rocket League',
  hasMapVeto: false,
  matchFormats: ['bo3', 'bo5', 'bo7'],
  mapPool: [],
};
