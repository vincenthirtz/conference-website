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
  registrationPresets: [
    {
      key: 'captain_epic_id',
      label: 'Epic ID du capitaine',
      type: 'text',
      required: false,
      help: 'Identifiant Epic Games du capitaine',
    },
    {
      key: 'rank',
      label: 'Rang moyen de l’équipe',
      type: 'select',
      required: false,
      options: [
        'Bronze',
        'Argent',
        'Or',
        'Platine',
        'Diamant',
        'Champion',
        'Grand Champion',
        'SSL',
      ],
    },
    {
      key: 'platform',
      label: 'Plateforme',
      type: 'select',
      required: false,
      options: ['PC', 'PlayStation', 'Xbox', 'Switch'],
    },
  ],
};
