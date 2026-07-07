// config/games/marvel-rivals.ts
// Marvel Rivals — competitive map pool (Domination / Convoy / Convergence).

import type { GameDef } from './index';

const CDN = '/images/games/marvel-rivals';

export const MARVEL_RIVALS: GameDef = {
  slug: 'marvel-rivals',
  label: 'Marvel Rivals',
  hasMapVeto: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [
    // Domination
    { name: 'Hydra Charteris Base: Hell\'s Heaven', type: 'domination', image: `${CDN}/hydra-charteris-base.jpg` },
    { name: 'Intergalactic Empire of Wakanda: Birnin T\'Challa', type: 'domination', image: `${CDN}/wakanda-birnin-tchalla.jpg` },
    { name: 'Tokyo 2099: Shin-Shibuya', type: 'domination', image: `${CDN}/tokyo-2099-shin-shibuya.jpg` },
    { name: 'Klyntar: Symbiotic Surface', type: 'domination', image: `${CDN}/klyntar-symbiotic-surface.jpg` },
    { name: 'Yggsgard: Yggdrasill Path', type: 'domination', image: `${CDN}/yggsgard-yggdrasill-path.jpg` },
    // Convoy
    { name: 'Yggsgard: Royal Palace', type: 'convoy', image: `${CDN}/yggsgard-royal-palace.jpg` },
    { name: 'Tokyo 2099: Spider-Islands', type: 'convoy', image: `${CDN}/tokyo-2099-spider-islands.jpg` },
    { name: 'Intergalactic Empire of Wakanda: Hall of Djalia', type: 'convoy', image: `${CDN}/wakanda-hall-of-djalia.jpg` },
    // Convergence (hybrid)
    { name: 'Hellfire Gala: Krakoa', type: 'convergence', image: `${CDN}/hellfire-gala-krakoa.jpg` },
    { name: 'Empire of Eternal Night: Midtown', type: 'convergence', image: `${CDN}/empire-eternal-night-midtown.jpg` },
    { name: 'Empire of Eternal Night: Central Park', type: 'convergence', image: `${CDN}/empire-eternal-night-central-park.jpg` },
  ],
  registrationPresets: [
    {
      key: 'captain_id',
      label: 'Pseudo in-game du capitaine',
      type: 'text',
      required: false,
      help: 'Pseudo utilisé en jeu par le capitaine',
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
        'Grand Maître',
        'Éternité',
        'Un au-dessus de tout',
      ],
    },
    {
      key: 'region',
      label: 'Région',
      type: 'select',
      required: false,
      options: ['Europe', 'Amérique', 'Asie'],
    },
  ],
};
