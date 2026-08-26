// lib/i18n/locales/en/mapsVoxelPage.ts
//
// Traductions ANGLAISES du namespace `mapsVoxelPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/mapsVoxelPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Workshop',
  title: 'The map pool, in bricks',
  lede: "The site's map thumbnails used to point at official screenshots served by a third-party CDN. They are replaced by models generated in-house: a fifteen-line recipe per map, a deterministic engine, an isometric SVG. No publisher assets, no external dependency.",
  posture:
    "A model does not reproduce a map's layout — that would be a derivative work. It evokes the kind of place: a palette, a terrain archetype derived from the game mode, a building style, a surrounding setting and two or three generic landmarks.",
  filterAll: 'All modes',
  countMaps: '{n} maps',
  modeControl: 'Control',
  modeEscort: 'Escort',
  modeHybrid: 'Hybrid',
  modePush: 'Push',
  modeFlashpoint: 'Flashpoint',
  modeStandard: 'Standard',
  archModern: 'Contemporary',
  archTerrace: 'Terraced houses',
  archWhitewash: 'Whitewashed',
  archIndustrial: 'Industrial',
  archAncient: 'Ancient',
  archColonial: 'Colonial',
  archTiered: 'Tiered roofs',
  archFuturist: 'Glass and steel',
  archAlpine: 'Alpine',
  envSea: 'Sea',
  envSand: 'Desert',
  envSnow: 'Snow',
  envGrass: 'Grassland',
  envLava: 'Lava',
  moodDay: 'Day',
  moodDusk: 'Dusk',
  moodNight: 'Night',
  labelPalette: 'Palette',
  labelLandmarks: 'Landmarks',
  labelWeight: 'Weight',
  howTitle: 'How a model is made',
  howStep1Title: 'A recipe',
  howStep1Body:
    'Fifteen lines per map: a four-colour palette, a building style, a surrounding setting and two or three landmarks drawn from a generic vocabulary. The game mode is already in the database — it serves as the skeleton.',
  howStep2Title: 'A deterministic engine',
  howStep2Body:
    'The map name is the seed: terrain, building placement and street furniture all follow from it. Same recipe, same model, every time — and two maps of the same mode never look alike.',
  howStep3Title: 'An isometric SVG',
  howStep3Body:
    'Ambient occlusion, cast shadows and aerial perspective are computed at render time. The file weighs around ten kilobytes compressed and stays sharp at any size, without a line of JavaScript.',
  vocabularyNote:
    'Landmarks are shown with their engine identifier: that is the vocabulary recipes are written in.',
};
