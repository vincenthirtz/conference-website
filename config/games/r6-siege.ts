// config/games/r6-siege.ts
// Rainbow Six Siege — competitive (Ranked / Esports) map pool.

import type { GameDef } from './index';

const CDN = '/images/games/r6-siege';

export const R6_SIEGE: GameDef = {
  slug: 'r6-siege',
  label: 'Rainbow Six Siege',
  hasMapVeto: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [
    { name: 'Bank', type: 'ranked', image: `${CDN}/bank.jpg` },
    { name: 'Border', type: 'ranked', image: `${CDN}/border.jpg` },
    { name: 'Chalet', type: 'ranked', image: `${CDN}/chalet.jpg` },
    { name: 'Clubhouse', type: 'ranked', image: `${CDN}/clubhouse.jpg` },
    { name: 'Coastline', type: 'ranked', image: `${CDN}/coastline.jpg` },
    { name: 'Consulate', type: 'ranked', image: `${CDN}/consulate.jpg` },
    { name: 'Kafe Dostoyevsky', type: 'ranked', image: `${CDN}/kafe-dostoyevsky.jpg` },
    { name: 'Lair', type: 'ranked', image: `${CDN}/lair.jpg` },
    { name: 'Nighthaven Labs', type: 'ranked', image: `${CDN}/nighthaven-labs.jpg` },
    { name: 'Skyscraper', type: 'ranked', image: `${CDN}/skyscraper.jpg` },
    { name: 'Villa', type: 'ranked', image: `${CDN}/villa.jpg` },
  ],
  registrationPresets: [
    {
      key: 'captain_ubisoft_id',
      label: 'Ubisoft ID du capitaine',
      type: 'text',
      required: false,
      help: 'Identifiant Ubisoft Connect du capitaine',
    },
    {
      key: 'rank',
      label: 'Rang moyen de l’équipe',
      type: 'select',
      required: false,
      options: [
        'Cuivre',
        'Bronze',
        'Argent',
        'Or',
        'Platine',
        'Émeraude',
        'Diamant',
        'Champion',
      ],
    },
    {
      key: 'region',
      label: 'Région',
      type: 'select',
      required: false,
      options: ['EU', 'NA', 'APAC'],
    },
  ],
};
