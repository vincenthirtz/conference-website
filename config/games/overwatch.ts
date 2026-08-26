// config/games/overwatch.ts
//
// Les vignettes de maps sont des MAQUETTES VOXEL générées et servies par nous
// (`public/img/maps/overwatch/*.svg`, cf. utils/maps + config/maps).
//
// WHY: elles pointaient auparavant vers `overfast-api.tekrop.fr`, un CDN tiers
// qui relaie les captures d'écran officielles de l'éditeur. Double problème —
// des assets sous copyright, et une dépendance sans aucun contrat qui pouvait
// disparaître du jour au lendemain (d'où l'état `brokenImages` de MapDrawPanel).
//
// Le nom de fichier est le slug de la map (`mapSlug`) : « King's Row » ->
// `kings-row.svg`. La correspondance est vérifiée par
// tests/unit/voxelMaps.test.ts, qui contrôle que chaque chemin déclaré ici
// existe bien sur le disque — sans quoi une map ajoutée sans `npm run
// maps:render` afficherait une image cassée en production.

import type { GameDef } from './index';

const ART = '/img/maps/overwatch';

export const OVERWATCH: GameDef = {
  slug: 'overwatch',
  label: 'Overwatch',
  hasMapVeto: true,
  matchFormats: ['bo1', 'bo3', 'bo5'],
  mapPool: [
    // Control
    { name: 'Antarctic Peninsula', type: 'control', image: `${ART}/antarctic-peninsula.svg` },
    { name: 'Busan', type: 'control', image: `${ART}/busan.svg` },
    { name: 'Hanaoka', type: 'control', image: `${ART}/hanaoka.svg` },
    { name: 'Ilios', type: 'control', image: `${ART}/ilios.svg` },
    { name: 'Lijiang Tower', type: 'control', image: `${ART}/lijiang-tower.svg` },
    { name: 'Nepal', type: 'control', image: `${ART}/nepal.svg` },
    { name: 'Oasis', type: 'control', image: `${ART}/oasis.svg` },
    { name: 'Samoa', type: 'control', image: `${ART}/samoa.svg` },
    // Escort
    { name: 'Circuit Royal', type: 'escort', image: `${ART}/circuit-royal.svg` },
    { name: 'Dorado', type: 'escort', image: `${ART}/dorado.svg` },
    { name: 'Havana', type: 'escort', image: `${ART}/havana.svg` },
    { name: 'Junkertown', type: 'escort', image: `${ART}/junkertown.svg` },
    { name: 'Rialto', type: 'escort', image: `${ART}/rialto.svg` },
    { name: 'Route 66', type: 'escort', image: `${ART}/route-66.svg` },
    { name: 'Shambali Monastery', type: 'escort', image: `${ART}/shambali-monastery.svg` },
    { name: 'Watchpoint: Gibraltar', type: 'escort', image: `${ART}/watchpoint-gibraltar.svg` },
    // Hybrid
    { name: 'Blizzard World', type: 'hybrid', image: `${ART}/blizzard-world.svg` },
    { name: 'Eichenwalde', type: 'hybrid', image: `${ART}/eichenwalde.svg` },
    { name: 'Hollywood', type: 'hybrid', image: `${ART}/hollywood.svg` },
    { name: "King's Row", type: 'hybrid', image: `${ART}/kings-row.svg` },
    { name: 'Midtown', type: 'hybrid', image: `${ART}/midtown.svg` },
    { name: 'Numbani', type: 'hybrid', image: `${ART}/numbani.svg` },
    { name: 'Paraíso', type: 'hybrid', image: `${ART}/paraiso.svg` },
    // Push
    { name: 'Colosseo', type: 'push', image: `${ART}/colosseo.svg` },
    { name: 'Esperança', type: 'push', image: `${ART}/esperanca.svg` },
    { name: 'New Queen Street', type: 'push', image: `${ART}/new-queen-street.svg` },
    { name: 'Runasapi', type: 'push', image: `${ART}/runasapi.svg` },
    // Flashpoint
    { name: 'New Junk City', type: 'flashpoint', image: `${ART}/new-junk-city.svg` },
    { name: 'Suravasa', type: 'flashpoint', image: `${ART}/suravasa.svg` },
    { name: 'Throne of Aatlis', type: 'flashpoint', image: `${ART}/throne-of-aatlis.svg` },
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
