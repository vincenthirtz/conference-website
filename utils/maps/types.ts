// utils/maps/types.ts
// Types du générateur de maquettes voxel (« dioramas de briques ») utilisées à
// la place des screenshots officiels des éditeurs dans le map pool / veto.
//
// WHY:
//   Le catalogue `config/games/*` pointait vers des captures d'écran officielles
//   servies par un CDN tiers : dépendance non contractuelle + assets sous
//   copyright éditeur. On les remplace par des maquettes ABSTRAITES générées
//   chez nous à partir d'une « recette » de ~15 lignes par map.
//
// POSTURE:
//   La maquette n'est PAS une reproduction de la géométrie réelle de la map —
//   ce serait une œuvre dérivée. C'est une évocation : une palette, un archétype
//   de layout (déduit du `map_type` déjà stocké en base) et 1 à 3 silhouettes
//   génériques. Le résultat est une œuvre originale, reconnaissable par l'ambiance
//   et non par le plan.
//
// Le vocabulaire de silhouettes est volontairement GÉNÉRIQUE (tour, arche, dôme,
// grue…) : aucune n'est modelée sur un bâtiment précis d'un jeu.

/** Archétype de terrain. Miroir des `map_type` du registre + fallback. */
export const MAP_LAYOUTS = [
  'control',
  'escort',
  'hybrid',
  'push',
  'flashpoint',
  'standard',
] as const;
export type MapLayout = (typeof MAP_LAYOUTS)[number];

/** Silhouettes disponibles. Formes génériques, pas de copie d'un bâtiment réel. */
export const LANDMARK_KINDS = [
  'tower',
  'clocktower',
  'arch',
  'dome',
  'spire',
  'statue',
  'tree',
  'palm',
  'crane',
  'ruin',
  'billboard',
  'pyramid',
  'windmill',
  'gate',
  'amphitheatre',
  'temple',
  'lighthouse',
  'smokestack',
  'townhouses',
  'village',
  'tram',
] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

/** Style du bâti de remplissage généré par les layouts. */
export const ARCHITECTURES = ['modern', 'terrace', 'whitewash', 'industrial', 'ancient'] as const;
export type Architecture = (typeof ARCHITECTURES)[number];

/** Ambiance — n'influence que le fond et l'intensité du contraste au rendu. */
export const MAP_MOODS = ['day', 'dusk', 'night'] as const;
export type MapMood = (typeof MAP_MOODS)[number];

/**
 * Palette d'une maquette, dans cet ordre :
 *   0 = sol / terrain
 *   1 = structure / murs
 *   2 = toiture / accent
 *   3 = highlight (néons, enseignes, objectifs, éléments dorés)
 * Le rôle `environment` (mer, sable, neige) tire sa couleur de
 * `MapRecipe.environment`, pas de la palette : il n'appartient pas au bâti.
 */
export type MapPalette = readonly [string, string, string, string];

/** Rôle d'une brique — indexe la palette. Évite de figer une couleur trop tôt. */
export const BRICK_ROLES = [
  'ground',
  'structure',
  'accent',
  'highlight',
  'environment',
] as const;
export type BrickRole = (typeof BRICK_ROLES)[number];

/** Une brique = un cube unitaire sur une grille entière. y = hauteur. */
export type Brick = {
  x: number;
  y: number;
  z: number;
  role: BrickRole;
  /** Variation de teinte déterministe (-1..1) appliquée au rendu. */
  shade?: number;
};

/** Décor qui entoure le terrain jouable — c'est lui qui « pose » la map. */
export const ENVIRONMENT_KINDS = ['sea', 'sand', 'snow', 'lava', 'grass'] as const;
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];

export type MapEnvironment = {
  kind: EnvironmentKind;
  /** Couleur de la nappe. */
  color: string;
  /** Rayon de la nappe autour du centre. Défaut 21. */
  radius?: number;
};

/** Recette d'une map : l'unité d'authoring. ~15 lignes par map. */
export type MapRecipe = {
  /** Slug canonique (cf. `mapSlug`). Sert aussi de graine du PRNG. */
  slug: string;
  /** Nom lisible (celui du jeu). Usage nominatif — pas repris dans le visuel. */
  name: string;
  layout: MapLayout;
  palette: MapPalette;
  /** 0 à 3 silhouettes, placées sur les ancres du layout dans l'ordre donné. */
  landmarks: LandmarkKind[];
  mood?: MapMood;
  /** Densité des props dispersés (arbres, blocs). 0 = nu, 1 = dense. Défaut 0.4. */
  scatter?: number;
  /** Nappe de décor autour du terrain (mer, désert, neige…). */
  environment?: MapEnvironment;
  /**
   * Style du bâti de remplissage, qui porte une grande part de la
   * reconnaissance : `terrace` = rangées mitoyennes à toits pentus,
   * `whitewash` = cubes blancs à toits plats, `industrial` = volumes bas et
   * cheminées, `modern` = tours vitrées. Défaut `modern`.
   */
  architecture?: Architecture;
};

/** Sortie du générateur : la liste de briques + les métadonnées de rendu. */
export type VoxelScene = {
  recipe: MapRecipe;
  bricks: Brick[];
  /** Bornes inclusives, calculées après génération. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
};
