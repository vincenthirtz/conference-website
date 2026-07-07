// config/games/overwatch.ts

import type { GameDef } from './index';

const CDN = 'https://overfast-api.tekrop.fr/static/maps';

export const OVERWATCH: GameDef = {
  slug: 'overwatch',
  label: 'Overwatch',
  hasMapVeto: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [
    // Control
    { name: 'Antarctic Peninsula', type: 'control', image: `${CDN}/antarctic-peninsula.jpg` },
    { name: 'Busan', type: 'control', image: `${CDN}/busan.jpg` },
    { name: 'Hanaoka', type: 'control', image: `${CDN}/hanaoka.jpg` },
    { name: 'Ilios', type: 'control', image: `${CDN}/ilios.jpg` },
    { name: 'Lijiang Tower', type: 'control', image: `${CDN}/lijiang-tower.jpg` },
    { name: 'Nepal', type: 'control', image: `${CDN}/nepal.jpg` },
    { name: 'Oasis', type: 'control', image: `${CDN}/oasis.jpg` },
    { name: 'Samoa', type: 'control', image: `${CDN}/samoa.jpg` },
    // Escort
    { name: 'Circuit Royal', type: 'escort', image: `${CDN}/circuit-royal.jpg` },
    { name: 'Dorado', type: 'escort', image: `${CDN}/dorado.jpg` },
    { name: 'Havana', type: 'escort', image: `${CDN}/havana.jpg` },
    { name: 'Junkertown', type: 'escort', image: `${CDN}/junkertown.jpg` },
    { name: 'Rialto', type: 'escort', image: `${CDN}/rialto.jpg` },
    { name: 'Route 66', type: 'escort', image: `${CDN}/route-66.jpg` },
    { name: 'Shambali Monastery', type: 'escort', image: `${CDN}/shambali-monastery.jpg` },
    { name: 'Watchpoint: Gibraltar', type: 'escort', image: `${CDN}/watchpoint-gibraltar.jpg` },
    // Hybrid
    { name: 'Blizzard World', type: 'hybrid', image: `${CDN}/blizzard-world.jpg` },
    { name: 'Eichenwalde', type: 'hybrid', image: `${CDN}/eichenwalde.jpg` },
    { name: 'Hollywood', type: 'hybrid', image: `${CDN}/hollywood.jpg` },
    { name: "King's Row", type: 'hybrid', image: `${CDN}/kings-row.jpg` },
    { name: 'Midtown', type: 'hybrid', image: `${CDN}/midtown.jpg` },
    { name: 'Numbani', type: 'hybrid', image: `${CDN}/numbani.jpg` },
    { name: 'Paraíso', type: 'hybrid', image: `${CDN}/paraiso.jpg` },
    // Push
    { name: 'Colosseo', type: 'push', image: `${CDN}/colosseo.jpg` },
    { name: 'Esperança', type: 'push', image: `${CDN}/esperanca.jpg` },
    { name: 'New Queen Street', type: 'push', image: `${CDN}/new-queen-street.jpg` },
    { name: 'Runasapi', type: 'push', image: `${CDN}/runasapi.jpg` },
    // Flashpoint
    { name: 'New Junk City', type: 'flashpoint', image: `${CDN}/new-junk-city.jpg` },
    { name: 'Suravasa', type: 'flashpoint', image: `${CDN}/suravasa.jpg` },
    { name: 'Throne of Aatlis', type: 'flashpoint', image: `${CDN}/throne-of-aatlis.jpg` },
  ],
  registrationPresets: [
    {
      key: 'captain_battletag',
      label: 'BattleTag du capitaine',
      type: 'text',
      required: false,
      help: 'Format Nom#1234',
    },
    {
      key: 'rank_moyen',
      label: 'Rang moyen de l’équipe',
      type: 'select',
      required: false,
      options: [
        'Bronze',
        'Argent',
        'Or',
        'Platine',
        'Diamant',
        'Maître',
        'Grand Maître',
        'Champion',
      ],
    },
    {
      key: 'region',
      label: 'Région',
      type: 'select',
      required: false,
      options: ['Europe', 'Amérique', 'Asie', 'Océanie'],
    },
  ],
};
