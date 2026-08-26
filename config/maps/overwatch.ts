// config/maps/overwatch.ts
// Recettes de maquettes voxel — pool Overwatch complet (30 maps).
//
// Une recette décrit une AMBIANCE, jamais un plan : palette dominante, type de
// lieu (architecture + décor alentour) et deux à trois silhouettes génériques.
// Aucune géométrie du jeu n'est reproduite — voir la note de posture dans
// utils/maps/types.ts et utils/maps/landmarks.ts.
//
// Ce qui fait qu'une maquette « lit » comme la map visée, par ordre d'effet :
//   1. la palette (une rue londonienne de nuit ne peut pas se confondre avec
//      une île grecque en plein jour) ;
//   2. l'architecture du bâti de remplissage (mitoyennes à toits pentus vs
//      cubes blancs à toits plats vs bandeaux vitrés continus) ;
//   3. la nappe qui entoure — mer, sable, neige, herbe ;
//   4. les silhouettes.
//
// Le `layout` reprend le mode de jeu, qui est déjà la donnée `map_type` du
// registre : control, escort, hybrid, push, flashpoint. Ne pas le détourner —
// c'est lui qui rend le mode lisible sur une vignette de 200 px.
//
// AJOUTER UNE MAP : une entrée ici, puis `npm run maps:render`. Une map absente
// de cette liste reçoit une recette dérivée (config/maps/index.ts) : le pool n'a
// jamais de trou visuel, la recette écrite ne fait que remplacer un repli.

import type { MapRecipe } from '@/utils/maps/types';

export const OVERWATCH_RECIPES: MapRecipe[] = [
  // ---------------------------------------------------------------- Contrôle
  {
    slug: 'antarctic-peninsula',
    name: 'Antarctic Peninsula',
    layout: 'control',
    // Glace, coques de station polaire, acier peint, projecteurs froids.
    palette: ['#c3d2dd', '#93a8ba', '#3f6a8c', '#eaf4ff'],
    architecture: 'industrial',
    landmarks: ['dish', 'crane', 'tower'],
    environment: { kind: 'snow', color: '#dfeaf3' },
    mood: 'day',
    scatter: 0.2,
  },
  {
    slug: 'busan',
    name: 'Busan',
    layout: 'control',
    // Béton portuaire, sanctuaire laqué, enseignes de néon.
    palette: ['#7d8a93', '#e9e3d7', '#b03a3a', '#f4c552'],
    architecture: 'tiered',
    landmarks: ['pagoda', 'market', 'tower'],
    environment: { kind: 'sea', color: '#2b6e8f' },
    mood: 'dusk',
    scatter: 0.5,
  },
  {
    slug: 'hanaoka',
    name: 'Hanaoka',
    layout: 'control',
    // Enceinte de château, plâtre blanc, tuiles sombres, érables.
    palette: ['#7c8a6d', '#f0eade', '#3c4a52', '#e0b25a'],
    architecture: 'tiered',
    landmarks: ['castle', 'pagoda', 'tree'],
    environment: { kind: 'grass', color: '#5f7f52' },
    mood: 'day',
    scatter: 0.45,
  },
  {
    slug: 'ilios',
    name: 'Ilios',
    layout: 'control',
    // Falaise calcaire, chaux blanche, coupoles bleues, or.
    palette: ['#cbb695', '#f5f1e8', '#2f7fa3', '#f2c750'],
    architecture: 'whitewash',
    landmarks: ['village', 'windmill', 'ruin'],
    environment: { kind: 'sea', color: '#1f6f96' },
    mood: 'day',
    scatter: 0.3,
  },
  {
    slug: 'lijiang-tower',
    name: 'Lijiang Tower',
    layout: 'control',
    // Nuit de marché : pierre grise, bois sombre, laque rouge, lanternes.
    palette: ['#4d4750', '#6f5a56', '#c0392f', '#ffd166'],
    architecture: 'tiered',
    landmarks: ['pagoda', 'market', 'bridge'],
    mood: 'night',
    scatter: 0.6,
  },
  {
    slug: 'nepal',
    name: 'Nepal',
    layout: 'control',
    // Neige, bois peint, toits grenat, cuivre des moulins à prières.
    palette: ['#cfd9e2', '#8a6a52', '#7d3f3f', '#e8c86a'],
    architecture: 'alpine',
    landmarks: ['stupa', 'village', 'tree'],
    environment: { kind: 'snow', color: '#e9f0f6' },
    mood: 'day',
    scatter: 0.35,
  },
  {
    slug: 'oasis',
    name: 'Oasis',
    layout: 'control',
    // Ville-laboratoire dans le désert : grès pâle, verre turquoise, or.
    palette: ['#d8c39a', '#f3ede1', '#2fa3a3', '#e8c04a'],
    architecture: 'futurist',
    landmarks: ['dome', 'tower', 'palm'],
    environment: { kind: 'sand', color: '#dcbb7e' },
    mood: 'day',
    scatter: 0.3,
  },
  {
    slug: 'samoa',
    name: 'Samoa',
    layout: 'control',
    // Roche volcanique, bois clair, végétation dense, lagon.
    palette: ['#6e5a4a', '#e7dfcd', '#2f8f6a', '#f0b24a'],
    architecture: 'whitewash',
    landmarks: ['village', 'palm', 'ruin'],
    environment: { kind: 'sea', color: '#1f8fa0' },
    mood: 'day',
    scatter: 0.55,
  },

  // ----------------------------------------------------------------- Escorte
  {
    slug: 'circuit-royal',
    name: 'Circuit Royal',
    layout: 'escort',
    // Front de mer huppé : pierre claire, marbre, bleu profond, dorures.
    palette: ['#c9c2b4', '#f3eee3', '#2d4f7c', '#e6c25a'],
    architecture: 'colonial',
    landmarks: ['tower', 'arch', 'palm'],
    environment: { kind: 'sea', color: '#1d5f8c' },
    mood: 'day',
    scatter: 0.35,
  },
  {
    slug: 'dorado',
    name: 'Dorado',
    layout: 'escort',
    // Nuit de fête : murs ocre, tuiles cuites, guirlandes.
    palette: ['#8f6a44', '#e0bd85', '#a8452f', '#f7b93a'],
    architecture: 'colonial',
    landmarks: ['market', 'bridge', 'tower'],
    mood: 'night',
    scatter: 0.6,
  },
  {
    slug: 'havana',
    name: 'Havana',
    layout: 'escort',
    // Façades pastel écaillées, tuiles cuites, menuiseries turquoise.
    palette: ['#c9a97e', '#f1dab6', '#c2543a', '#4fb0c8'],
    architecture: 'colonial',
    landmarks: ['bridge', 'market', 'lighthouse'],
    environment: { kind: 'sea', color: '#2a7f9e' },
    mood: 'day',
    scatter: 0.5,
  },
  {
    slug: 'junkertown',
    name: 'Junkertown',
    layout: 'escort',
    // Sable, tôle rouillée, laque écaillée, signalétique jaune.
    palette: ['#bf8a4f', '#7d4a2e', '#b8422f', '#f5cb3a'],
    architecture: 'industrial',
    landmarks: ['gate', 'crane', 'billboard'],
    environment: { kind: 'sand', color: '#d7a765' },
    mood: 'day',
    scatter: 0.6,
  },
  {
    slug: 'rialto',
    name: 'Rialto',
    layout: 'escort',
    // Canaux : enduits ocre, volets, eau verte, pierre d'Istrie.
    palette: ['#b58a6a', '#e9d5b9', '#8c4a3c', '#e8c46a'],
    architecture: 'colonial',
    landmarks: ['bridge', 'tower', 'dome'],
    environment: { kind: 'sea', color: '#3f7f8c' },
    mood: 'day',
    scatter: 0.4,
  },
  {
    slug: 'route-66',
    name: 'Route 66',
    layout: 'escort',
    // Canyon au couchant : grès délavé, bardage passé, néons de motel.
    palette: ['#cfa06a', '#a9784f', '#8e4030', '#f6d24e'],
    architecture: 'industrial',
    landmarks: ['billboard', 'ruin', 'bridge'],
    environment: { kind: 'sand', color: '#d8a86a' },
    mood: 'dusk',
    scatter: 0.45,
  },
  {
    slug: 'shambali-monastery',
    name: 'Shambali Monastery',
    layout: 'escort',
    // Monastère de haute altitude : neige, bois, grenat, laiton.
    palette: ['#cfd9e2', '#7d6a56', '#a83c3c', '#e8c86a'],
    architecture: 'alpine',
    landmarks: ['stupa', 'statue', 'tree'],
    environment: { kind: 'snow', color: '#e6eef6' },
    mood: 'day',
    scatter: 0.3,
  },
  {
    slug: 'watchpoint-gibraltar',
    name: 'Watchpoint: Gibraltar',
    layout: 'escort',
    // Base de lancement sur le rocher : béton, acier, bleu d'agence, orange.
    palette: ['#9aa3ab', '#d9d3c7', '#2f5f8c', '#f2a03a'],
    architecture: 'industrial',
    landmarks: ['rocket', 'dish', 'crane'],
    environment: { kind: 'sea', color: '#1f5f7f' },
    mood: 'day',
    scatter: 0.3,
  },

  // ----------------------------------------------------------------- Hybride
  {
    slug: 'blizzard-world',
    name: 'Blizzard World',
    layout: 'hybrid',
    // Parc d'attractions : violet de façade, pierre de conte, enseignes.
    palette: ['#6a5a8c', '#e9ddc9', '#c93f5a', '#f6c94e'],
    architecture: 'colonial',
    landmarks: ['castle', 'ferriswheel', 'billboard'],
    mood: 'dusk',
    scatter: 0.6,
  },
  {
    slug: 'eichenwalde',
    name: 'Eichenwalde',
    layout: 'hybrid',
    // Village à colombages sous un château, feuillage d'automne.
    palette: ['#6e5a44', '#d9c9a9', '#7d3f3c', '#e8b44a'],
    architecture: 'alpine',
    landmarks: ['castle', 'townhouses', 'tree'],
    environment: { kind: 'grass', color: '#6a7a4a' },
    mood: 'dusk',
    scatter: 0.5,
  },
  {
    slug: 'hollywood',
    name: 'Hollywood',
    layout: 'hybrid',
    // Studios et boulevard : stuc crème, marquises rouges, palmiers.
    palette: ['#c9b28a', '#f1e7d3', '#c93f4a', '#f4c94e'],
    architecture: 'colonial',
    landmarks: ['billboard', 'tower', 'palm'],
    mood: 'dusk',
    scatter: 0.45,
  },
  {
    slug: 'kings-row',
    name: "King's Row",
    layout: 'hybrid',
    // Pavé humide, brique londonienne, ardoise, halo des réverbères.
    palette: ['#57545f', '#8a5442', '#3f4a58', '#ffd489'],
    architecture: 'terrace',
    landmarks: ['clocktower', 'townhouses', 'tram'],
    mood: 'night',
    scatter: 0.55,
  },
  {
    slug: 'midtown',
    name: 'Midtown',
    layout: 'hybrid',
    // Avenue de gratte-ciel la nuit : granit, verre, taxis, enseignes.
    palette: ['#585d68', '#8b909b', '#3c4652', '#f6cd4c'],
    architecture: 'futurist',
    landmarks: ['tower', 'billboard', 'tram'],
    mood: 'night',
    scatter: 0.4,
  },
  {
    slug: 'numbani',
    name: 'Numbani',
    layout: 'hybrid',
    // Métropole-jardin : blanc éclatant, verre turquoise, végétation.
    palette: ['#8a9a7a', '#f2f4f0', '#2fa8c0', '#e8c04a'],
    architecture: 'futurist',
    landmarks: ['tower', 'statue', 'tree'],
    environment: { kind: 'grass', color: '#5f8f5a' },
    mood: 'day',
    scatter: 0.4,
  },
  {
    slug: 'paraiso',
    name: 'Paraíso',
    layout: 'hybrid',
    // Favela au-dessus de la baie : façades vives, verdure, carnaval.
    palette: ['#c98f6d', '#f1daa9', '#2f9f8a', '#f25a4a'],
    architecture: 'colonial',
    landmarks: ['statue', 'village', 'palm'],
    environment: { kind: 'sea', color: '#1f8fa8' },
    mood: 'day',
    scatter: 0.6,
  },

  // ------------------------------------------------------------------ Poussée
  {
    slug: 'colosseo',
    name: 'Colosseo',
    layout: 'push',
    // Travertin, terre cuite, brique romaine, dorures au couchant.
    palette: ['#c6a97e', '#a8794f', '#b5452f', '#f3dda6'],
    architecture: 'ancient',
    landmarks: ['amphitheatre', 'ruin', 'ruin'],
    mood: 'dusk',
    scatter: 0.3,
  },
  {
    slug: 'esperanca',
    name: 'Esperança',
    layout: 'push',
    // Bourg en terrasses : chaux, tuiles rouges, azulejos, collines.
    palette: ['#c9a97e', '#f3eee3', '#a83c3c', '#e8c46a'],
    architecture: 'terrace',
    landmarks: ['townhouses', 'bridge', 'tower'],
    environment: { kind: 'grass', color: '#7d8f5a' },
    mood: 'day',
    scatter: 0.5,
  },
  {
    slug: 'new-queen-street',
    name: 'New Queen Street',
    layout: 'push',
    // Centre-ville contemporain : béton clair, verre froid, tramway.
    palette: ['#6a707a', '#cacdd3', '#3c4a5c', '#f6cd4c'],
    architecture: 'futurist',
    landmarks: ['tower', 'tram', 'billboard'],
    mood: 'day',
    scatter: 0.35,
  },
  {
    slug: 'runasapi',
    name: 'Runasapi',
    layout: 'push',
    // Ville andine : pierre taillée, adobe, textiles, terrasses.
    palette: ['#b58a5a', '#e9d3a9', '#a83c3c', '#e8c04a'],
    architecture: 'terrace',
    landmarks: ['pyramid', 'townhouses', 'market'],
    environment: { kind: 'grass', color: '#7d8f5a' },
    mood: 'day',
    scatter: 0.5,
  },

  // -------------------------------------------------------------- Point chaud
  {
    slug: 'new-junk-city',
    name: 'New Junk City',
    layout: 'flashpoint',
    // Bidonville de récupération : tôle, bâches, néons de fortune.
    palette: ['#b58a4a', '#7d4a2e', '#8c9a3c', '#f2c230'],
    architecture: 'industrial',
    landmarks: ['crane', 'billboard', 'tower'],
    environment: { kind: 'sand', color: '#c9a25a' },
    mood: 'day',
    scatter: 0.65,
  },
  {
    slug: 'suravasa',
    name: 'Suravasa',
    layout: 'flashpoint',
    // Grès rose, marbre crème, bassins turquoise, or.
    palette: ['#c98f6d', '#f0e3cf', '#2fa8a0', '#eec24a'],
    architecture: 'whitewash',
    landmarks: ['temple', 'dome', 'arch'],
    environment: { kind: 'grass', color: '#5d8f5a' },
    mood: 'day',
    scatter: 0.4,
  },
  {
    slug: 'throne-of-aatlis',
    name: 'Throne of Aatlis',
    layout: 'flashpoint',
    // Médina au bord du désert : terre battue, chaux, zellige, laiton.
    palette: ['#c98f5a', '#e9d3a9', '#2f8f9a', '#e8c04a'],
    architecture: 'whitewash',
    landmarks: ['dome', 'market', 'palm'],
    environment: { kind: 'sand', color: '#d8ae70' },
    mood: 'day',
    scatter: 0.5,
  },
];
