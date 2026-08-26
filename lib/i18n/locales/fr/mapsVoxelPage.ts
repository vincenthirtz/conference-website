// lib/i18n/locales/fr/mapsVoxelPage.ts
//
// Traductions FRANCAISES du namespace `mapsVoxelPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('mapsVoxelPage', {
  eyebrow: 'Atelier',
  title: 'Le map pool, en briques',
  lede: "Les vignettes de maps du site pointaient vers des captures d'écran officielles servies par un CDN tiers. Elles sont remplacées par des maquettes générées chez nous : une recette d'une quinzaine de lignes par map, un moteur déterministe, un SVG isométrique. Aucun asset d'éditeur, aucune dépendance externe.",
  posture:
    "Une maquette ne reproduit pas le plan d'une map — ce serait une œuvre dérivée. Elle en évoque le type de lieu : une palette, un archétype de terrain déduit du mode de jeu, un style de bâti, un décor alentour et deux ou trois silhouettes génériques.",

  filterAll: 'Tous les modes',
  countMaps: '{n} maps',

  modeControl: 'Contrôle',
  modeEscort: 'Escorte',
  modeHybrid: 'Hybride',
  modePush: 'Poussée',
  modeFlashpoint: 'Point chaud',
  modeStandard: 'Standard',

  archModern: 'Contemporain',
  archTerrace: 'Mitoyennes',
  archWhitewash: 'Chaux blanche',
  archIndustrial: 'Industriel',
  archAncient: 'Antique',
  archColonial: 'Colonial',
  archTiered: 'Toits étagés',
  archFuturist: 'Verre et acier',
  archAlpine: 'Alpin',

  envSea: 'Mer',
  envSand: 'Désert',
  envSnow: 'Neige',
  envGrass: 'Prairie',
  envLava: 'Lave',

  moodDay: 'Jour',
  moodDusk: 'Couchant',
  moodNight: 'Nuit',

  labelPalette: 'Palette',
  labelLandmarks: 'Silhouettes',
  labelWeight: 'Poids',

  howTitle: 'Comment une maquette est fabriquée',
  howStep1Title: 'Une recette',
  howStep1Body:
    "Quinze lignes par map : une palette de quatre couleurs, un style de bâti, un décor alentour et deux ou trois silhouettes prises dans un vocabulaire générique. Le mode de jeu, lui, est déjà en base — il sert de squelette.",
  howStep2Title: 'Un moteur déterministe',
  howStep2Body:
    "Le nom de la map sert de graine : le terrain, l'implantation du bâti et le mobilier en découlent. Même recette, même maquette, toujours — et deux maps du même mode ne se ressemblent pas.",
  howStep3Title: 'Un SVG isométrique',
  howStep3Body:
    "Occlusion ambiante, ombre portée et perspective aérienne sont calculées au rendu. Le fichier pèse une dizaine de kilo-octets compressé et reste net à toutes les tailles, sans une ligne de JavaScript.",

  vocabularyNote:
    "Les silhouettes sont affichées avec leur identifiant du moteur : c'est le vocabulaire dans lequel s'écrivent les recettes.",
});
