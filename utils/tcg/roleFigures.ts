// utils/tcg/roleFigures.ts
//
// LES FIGURINES DE RÔLE du TCG : trois personnages voxel ORIGINAUX — tank,
// dégâts, soutien — qui illustrent la carte d'une joueuse sans photo.
//
// POURQUOI DES ARCHÉTYPES ET PAS LES HÉROS DU JEU. Le dépôt s'est donné une
// règle, écrite dans `utils/tcg/readCardFaces.ts` : « le héros est un nom, pas
// une image » — aucune illustration de personnage n'est sous licence ici. La
// méthode des maquettes de maps (`utils/maps/`) ne s'y transpose pas : une
// maquette ÉVOQUE un type de lieu sans reproduire la map, alors qu'un héros en
// voxel n'a d'intérêt que s'il est reconnaissable, donc s'il reproduit le
// dessin du personnage. Et une gamme Overwatch en briques existe sous licence
// Blizzard : des héros en voxel sur des cartes à collectionner seraient sur son
// terrain exact.
//
// On transpose donc la RÈGLE, pas le sujet : comme la maquette évoque un type
// de lieu, la figurine évoque un RÔLE. Aucune n'est modelée sur un héros.
// Vocabulaire volontairement générique et à nous :
//   - tank     : carrure massive, grand pavois de flanc, emblème en CRÉNEAUX
//                (le rempart) ;
//   - dégâts   : silhouette fine en fente, poing ganté d'énergie lancé en
//                avant, emblème ÉCLAIR ;
//   - soutien  : bras levé portant une lanterne, emblème CŒUR.
// Pas de croix rouge pour le soin — c'est un emblème protégé par les
// conventions de Genève, pas un pictogramme libre. Pas de tenons sur les
// faces (`studs: false`) ni de proportions de minifigurine : ni tête
// cylindrique, ni mains en pince — c'est l'habillage protégé d'un jouet.
//
// LA COULEUR D'ÉQUIPE est l'une des quatre teintes de la palette (`accent`) :
// elle porte les plaques d'armure et l'habit, et le moteur l'éclaire comme le
// reste (occlusion, faces), au lieu d'un masque CSS posé à plat par-dessus.
//
// Pur : construit une scène et la rend en SVG via le moteur des maquettes.

// Imports RELATIFS, comme le reste du moteur voxel : un script Node de rendu
// (cf. scripts/render-map-previews.ts) ne résout pas l'alias `@/`.
import { SceneBuilder } from '../maps/builder';
import { renderIsoSvg } from '../maps/isoSvg';
import type { Brick, BrickRole, MapRecipe, VoxelScene } from '../maps/types';

export const FIGURE_ROLES = ['tank', 'damage', 'support'] as const;
export type FigureRole = (typeof FIGURE_ROLES)[number];

/**
 * Version du modèle, portée par l'URL des figurines.
 *
 * Le SVG est servi avec un cache d'un an (sa sortie ne dépend que du chemin).
 * Retoucher un modèle sans changer ce numéro laisserait l'ancien dessin en
 * cache chez chaque visiteuse pendant des mois.
 */
export const FIGURE_VERSION = 1;

/** Couleur d'équipe par défaut : le violet du logo. */
export const DEFAULT_FIGURE_COLOR = '#a62edb';

/** Rôle du registre des héros (`Tank`/`Damage`/`Support`) → figurine. */
export function figureRoleFromHeroRole(
  role: string | null | undefined
): FigureRole | null {
  switch ((role ?? '').trim().toLowerCase()) {
    case 'tank':
      return 'tank';
    case 'damage':
    case 'dps':
      return 'damage';
    case 'support':
      return 'support';
    default:
      return null;
  }
}

/** `#RRGGBB` strict, sinon `null`. Ce qui entre dans un SVG passe par ici. */
export function normalizeFigureColor(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : null;
}

/** L'URL de la figurine, couleur d'équipe comprise. */
export function figureUrl(role: FigureRole, color: string | null): string {
  const hex = (normalizeFigureColor(color) ?? DEFAULT_FIGURE_COLOR).slice(1);
  return `/api/tcg/figure/v${FIGURE_VERSION}/${role}/${hex}.svg`;
}

/** Teinte de l'emblème, propre à chaque rôle — c'est lui qui le fait lire. */
const EMBLEM: Record<FigureRole, string> = {
  tank: '#8fbcff',
  damage: '#ff8a5c',
  support: '#6fe3b4',
};

/** Ardoise du socle et teinte claire de l'habit, communes aux trois. */
const PEDESTAL = '#2c2837';
const SUIT = '#dcd6e6';

/*
 * REPÈRE. Le moteur voit les faces +x (droite, bien éclairée) et +z (gauche).
 * La figurine regarde donc vers +x : sa FACE est la face droite du rendu, et
 * son flanc gauche la face gauche. Largeur de la figurine = axe z, centrée sur
 * 0 ; profondeur = axe x, avant en x maximal.
 */

type Pattern = readonly string[];

/**
 * Pose un motif (emblème) sur un plan vertical. `X` = brique, `.` = vide ; la
 * première ligne est la plus HAUTE. `plane` dit sur quelle face il s'applique.
 */
function stamp(
  b: SceneBuilder,
  pattern: Pattern,
  role: BrickRole,
  at: { plane: 'front' | 'left'; x: number; z: number; yTop: number }
): void {
  pattern.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell !== 'X') return;
      const y = at.yTop - r;
      if (at.plane === 'front') {
        // Face avant (+x) : les colonnes du motif courent le long de z.
        b.place(at.x, y, at.z + c, role, { keepExisting: false });
      } else {
        // Flanc gauche (+z) : les colonnes courent le long de x, vers l'avant.
        b.place(at.x + c, y, at.z, role, { keepExisting: false });
      }
    });
  });
}

/** Le socle commun : un disque d'ardoise, bordé de la couleur d'équipe. */
function pedestal(b: SceneBuilder): void {
  b.disc(1, 0, 6, 0, 1, 'ground');
  b.ring(1, 0, 6, 1, 1, 1, 'accent');
  b.disc(1, 0, 5, 1, 1, 'ground');
}

/**
 * Tête cubique 4×4×4 à visière lumineuse. Volontairement GROSSE (proportions
 * « chibi ») : c'est ce qui donne un personnage à une figurine lue en 180 px
 * de large. Cubique et sans tenon — ni tête cylindrique de minifigurine, ni
 * relief de brique de jouet.
 */
function head(b: SceneBuilder, y0: number, z0: number): void {
  b.box(0, y0, z0, 4, 4, 4, 'structure');
  // Casque : calotte et nuque à la couleur d'équipe.
  b.box(0, y0 + 3, z0, 4, 1, 4, 'accent', { keepExisting: false });
  b.box(0, y0, z0, 1, 4, 4, 'accent', { keepExisting: false });
  // Visière en bandeau sur la face avant, dans la teinte du rôle.
  b.box(3, y0 + 1, z0, 1, 1, 4, 'highlight', { keepExisting: false });
}

function buildTank(b: SceneBuilder): void {
  pedestal(b);
  // Jambes larges, bien plantées ; bottes et ceinture à la couleur d'équipe.
  b.box(0, 2, -3, 3, 5, 2, 'structure');
  b.box(0, 2, 0, 3, 5, 2, 'structure');
  b.box(0, 2, -3, 3, 1, 2, 'accent', { keepExisting: false });
  b.box(0, 2, 0, 3, 1, 2, 'accent', { keepExisting: false });
  b.box(0, 7, -3, 3, 2, 5, 'accent');
  // Buste massif, plus large que la taille : c'est la carrure qui dit « tank ».
  b.box(-1, 9, -4, 5, 6, 8, 'structure');
  b.box(3, 10, -3, 1, 4, 6, 'accent', { keepExisting: false });
  // Épaulières débordantes.
  b.box(-1, 14, -6, 5, 2, 2, 'accent');
  b.box(-1, 14, 4, 5, 2, 2, 'accent');
  // Bras libre (côté caché) ; l'autre tient le pavois.
  b.box(0, 9, -6, 3, 5, 2, 'structure');
  head(b, 15, -2);
  // Grand pavois porté sur le flanc gauche (+z) : on le voit de face sur le
  // rendu, avec l'emblème du rempart en relief.
  b.box(-2, 3, 6, 7, 12, 1, 'structure');
  b.box(-2, 14, 6, 7, 1, 1, 'accent', { keepExisting: false });
  b.box(-2, 3, 6, 7, 1, 1, 'accent', { keepExisting: false });
  b.box(4, 3, 6, 1, 12, 1, 'accent', { keepExisting: false });
  stamp(b, ['X.X.X.', 'XXXXXX', 'XXXXXX', 'XXXXXX'], 'highlight', {
    plane: 'left',
    x: -2,
    z: 7,
    yTop: 11,
  });
}

function buildDamage(b: SceneBuilder): void {
  pedestal(b);
  // Fente : jambe avant en avant, jambe arrière reculée.
  b.box(1, 2, -3, 2, 5, 2, 'structure');
  b.box(-1, 2, 0, 2, 5, 2, 'structure');
  b.box(1, 2, -3, 2, 1, 2, 'accent', { keepExisting: false });
  b.box(-1, 2, 0, 2, 1, 2, 'accent', { keepExisting: false });
  b.box(0, 7, -3, 3, 2, 5, 'accent');
  // Buste fin : la silhouette élancée dit « dégâts ».
  b.box(0, 9, -3, 3, 6, 5, 'structure');
  b.box(2, 10, -3, 1, 4, 5, 'accent', { keepExisting: false });
  b.box(0, 9, -5, 2, 5, 2, 'structure');
  head(b, 15, -3);
  // Bras (+z) lancé vers l'avant, poing ganté d'énergie : l'élan dit
  // « attaque » sans arme à dessiner. Une lance a été essayée : vue de biais,
  // son fer se lisait comme une croix, puis comme un pouce levé — un objet fin
  // et pointu n'a pas de bonne forme en voxels à cette taille.
  // Le poing part de côté et en avant, pas droit devant : de face, il
  // masquait l'éclair du plastron, qui est ce qui dit le rôle.
  b.box(1, 12, 2, 2, 2, 3, 'structure');
  b.box(3, 12, 4, 2, 2, 1, 'structure');
  // Gant à la couleur d'équipe, liseré d'énergie sur les phalanges : tout en
  // teinte de rôle, il se fondait avec l'éclair voisin en une seule tache.
  b.box(5, 11, 4, 2, 3, 2, 'accent');
  b.box(6, 12, 4, 1, 1, 2, 'highlight', { keepExisting: false });
  // Éclair en relief sur le plastron.
  stamp(b, ['...XX', '..XX.', '.XXXX', '.XX..', 'XX...'], 'highlight', {
    plane: 'front',
    x: 3,
    z: -3,
    yTop: 13,
  });
}

function buildSupport(b: SceneBuilder): void {
  pedestal(b);
  b.box(0, 2, -3, 2, 5, 2, 'structure');
  b.box(0, 2, 0, 2, 5, 2, 'structure');
  b.box(0, 2, -3, 2, 1, 2, 'accent', { keepExisting: false });
  b.box(0, 2, 0, 2, 1, 2, 'accent', { keepExisting: false });
  // Tunique évasée à la couleur d'équipe.
  b.box(-1, 6, -4, 4, 4, 8, 'accent');
  b.box(0, 10, -3, 3, 5, 7, 'structure');
  b.box(2, 10, -3, 1, 5, 7, 'accent', { keepExisting: false });
  // Bras bas (côté caché) ; bras levé (+z) qui porte la lanterne.
  b.box(0, 10, -5, 2, 5, 2, 'structure');
  b.box(0, 13, 4, 2, 7, 2, 'structure');
  head(b, 15, -2);
  // Lanterne : un noyau lumineux dans une cage à la couleur d'équipe.
  b.box(-1, 20, 3, 4, 1, 4, 'accent');
  b.box(0, 21, 4, 2, 3, 2, 'highlight');
  b.box(-1, 24, 3, 4, 1, 4, 'accent');
  for (const [x, z] of [
    [-1, 3],
    [2, 3],
    [-1, 6],
    [2, 6],
  ] as const) {
    b.box(x, 21, z, 1, 3, 1, 'accent');
  }
  // Cœur en relief, assez grand pour se lire comme un cœur : à 5 × 4 il
  // passait pour une croix verte — exactement le symbole à ne pas employer.
  stamp(
    b,
    ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    'highlight',
    { plane: 'front', x: 3, z: -3, yTop: 14 }
  );
}

/** Bornes inclusives d'une liste de briques. */
function boundsOf(bricks: Brick[]): VoxelScene['bounds'] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const { x, y, z } of bricks) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** La scène voxel d'une figurine, dans la couleur d'équipe donnée. */
export function buildRoleFigure(
  role: FigureRole,
  teamColor: string | null
): VoxelScene {
  const b = new SceneBuilder();
  if (role === 'tank') buildTank(b);
  else if (role === 'damage') buildDamage(b);
  else buildSupport(b);

  const recipe: MapRecipe = {
    slug: `tcg-figure-${role}`,
    name: role,
    layout: 'standard',
    palette: [
      PEDESTAL,
      SUIT,
      normalizeFigureColor(teamColor) ?? DEFAULT_FIGURE_COLOR,
      EMBLEM[role],
    ],
    landmarks: [],
    mood: 'day',
  };

  const bricks = b.toBricks();
  return { recipe, bricks, bounds: boundsOf(bricks) };
}

/**
 * Le SVG d'une figurine : fond transparent, cadré au format de la carte (3/4).
 * Le fond est celui de la carte elle-même, c'est ce qui lui garde son cadre de
 * rareté.
 */
export function renderRoleFigureSvg(
  role: FigureRole,
  teamColor: string | null
): string {
  return renderIsoSvg(buildRoleFigure(role, teamColor), {
    tile: 14,
    cubeHeight: 9,
    padding: 12,
    aspect: 3 / 4,
    studs: false,
    background: false,
    decorative: true,
    idPrefix: `fig-${role}-`,
  });
}

/** Ce que la carte reçoit pour dessiner une figurine. */
export type CardFigure = {
  role: FigureRole;
  color: string | null;
  heroName: string | null;
  heroSource: 'pick' | 'role' | null;
};

/**
 * La figurine d'une face joueuse, telle que les routes la transmettent à la
 * carte — une projection unique, pour que la collection, les paquets et la
 * fiche publique ne divergent pas. `null` sans rôle connu.
 *
 * Structurelle (pas d'import de `readCardFaces`) : ce module est aussi chargé
 * côté navigateur par la carte, et ne doit tirer aucun code serveur.
 */
export function cardFigureOf(
  face:
    | {
        figureRole: FigureRole | null;
        teamColor: string | null;
        heroName: string | null;
        heroSource: 'pick' | 'role' | null;
      }
    | null
    | undefined
): CardFigure | null {
  if (!face?.figureRole) return null;
  return {
    role: face.figureRole,
    color: face.teamColor,
    heroName: face.heroName,
    heroSource: face.heroSource,
  };
}
