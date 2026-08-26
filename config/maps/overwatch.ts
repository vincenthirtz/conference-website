// config/maps/overwatch.ts
// Recettes de maquettes voxel — lot pilote Overwatch.
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
//      cubes blancs à toits plats vs hangars industriels) ;
//   3. la nappe qui entoure — mer, sable, neige ;
//   4. la silhouette principale.
//
// Les maps non listées ici retombent sur la recette dérivée automatiquement
// (config/maps/index.ts) : le map pool n'a donc jamais de trou visuel.

import type { MapRecipe } from '@/utils/maps/types';

export const OVERWATCH_RECIPES: MapRecipe[] = [
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
];
