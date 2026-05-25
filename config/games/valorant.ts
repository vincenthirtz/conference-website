// config/games/valorant.ts

import type { GameDef } from './index';

const CDN = '/images/games/valorant';

export const VALORANT: GameDef = {
  slug: 'valorant',
  label: 'Valorant',
  hasMapVeto: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [
    { name: 'Ascent', type: 'standard', image: `${CDN}/ascent.jpg` },
    { name: 'Bind', type: 'standard', image: `${CDN}/bind.jpg` },
    { name: 'Haven', type: 'standard', image: `${CDN}/haven.jpg` },
    { name: 'Split', type: 'standard', image: `${CDN}/split.jpg` },
    { name: 'Lotus', type: 'standard', image: `${CDN}/lotus.jpg` },
    { name: 'Sunset', type: 'standard', image: `${CDN}/sunset.jpg` },
    { name: 'Abyss', type: 'standard', image: `${CDN}/abyss.jpg` },
    { name: 'Pearl', type: 'standard', image: `${CDN}/pearl.jpg` },
    { name: 'Icebox', type: 'standard', image: `${CDN}/icebox.jpg` },
    { name: 'Breeze', type: 'standard', image: `${CDN}/breeze.jpg` },
    { name: 'Fracture', type: 'standard', image: `${CDN}/fracture.jpg` },
  ],
};
