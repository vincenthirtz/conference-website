// utils/tcg/mascotFigure.ts
//
// LA MASCOTTE VOXEL DU TCG : le nœud Women's Cup, en briques.
//
// POURQUOI CELLE-CI ET PAS UN PERSONNAGE DU JEU. `utils/tcg/roleFigures.ts`
// pose la règle du dépôt : aucune illustration de personnage sous licence sur
// les cartes, parce qu'un personnage en voxel n'a d'intérêt que s'il est
// RECONNAISSABLE — donc s'il reproduit son dessin — et qu'une gamme Overwatch
// en briques existe déjà sous licence Blizzard. Une mascotte du jeu (Pachimari
// et compagnie) tombe exactement dans cette description.
//
// Le nœud échappe à la règle pour la seule raison qui vaille : il est À NOUS.
// C'est le logo de l'association, déjà l'habillage des alertes du direct
// (`public/overlay/alerts/noeud.webm`). Le reconnaître est ici le but, pas le
// problème — et à chaque édition il reste notre bien.
//
// IL EST POSÉ À PLAT, PAS DRESSÉ. Première version essayée : un médaillon, le
// nœud dessiné dans un plan VERTICAL. En isométrie, aucun plan ne fait face à
// la caméra — un dessin vertical est vu de trois quarts et s'écrase : les deux
// ailes du nœud devenaient deux murs séparés par une colonne blanche. Les
// figurines de rôle s'en tirent parce que ce sont des VOLUMES, pas des dessins.
//
// Le nœud est donc construit comme un ruban posé à plat, dans le plan (x, z) —
// exactement ce que ce moteur sait rendre, puisque c'est celui des maquettes de
// maps. Vu de dessus en trois quarts, il se lit d'un coup : deux boucles
// CREUSES, un pli central plein et surélevé, deux rubans qui filent devant.
//
// LES BOUCLES SONT ÉVIDÉES pour la même raison : pleines, elles formaient deux
// galettes que rien ne distinguait d'un papillon ou d'une fleur. C'est le trou
// au milieu de chaque boucle qui dit « ruban noué ».
//
// Pur : construit une scène et la rend en SVG via le moteur des maquettes.

// Imports RELATIFS, comme le reste du moteur voxel : un script Node de rendu
// (cf. scripts/render-map-previews.ts) ne résout pas l'alias `@/`.
import { SceneBuilder } from '../maps/builder';
import { renderIsoSvg } from '../maps/isoSvg';
import type { Brick, BrickRole, MapRecipe, VoxelScene } from '../maps/types';
import { DEFAULT_FIGURE_COLOR, normalizeFigureColor } from './roleFigures';

/**
 * Version du modèle, portée par l'URL.
 *
 * Le SVG est servi avec un cache d'un an (sa sortie ne dépend que du chemin).
 * Retoucher le modèle sans changer ce numéro laisserait l'ancien dessin en
 * cache chez chaque visiteuse pendant des mois.
 */
export const MASCOT_VERSION = 1;

/** Le segment d'URL qui désigne la mascotte, à côté des rôles. */
export const MASCOT_SLUG = 'noeud';

/** Ardoise du socle et du cerne — la même que les figurines de rôle. */
const SLATE = '#2c2837';
/** Teinte claire du ruban, pour le pli central. */
const RIBBON_LIGHT = '#efe9f7';

/**
 * Le nœud, dessiné dans le plan (y, z).
 *
 * `X` = brique, `.` = vide ; la PREMIÈRE ligne est la plus haute. Deux
 * triangles qui se rejoignent sur un pli central, puis deux rubans qui
 * retombent en s'écartant.
 *
 * Le motif est SYMÉTRIQUE à dessein : de trois quarts, le moteur éclaire
 * différemment les deux moitiés, et une asymétrie de dessin s'ajoutait à
 * l'asymétrie de lumière — le nœud paraissait de travers.
 */
const BOW: readonly string[] = [
  '..XXX.....XXX..',
  '.XX.XX...XX.XX.',
  'XX...XX.XX...XX',
  'XX....XXX....XX',
  'XX...XXXXX...XX',
  'XX....XXX....XX',
  'XX...XX.XX...XX',
  '.XX.XX...XX.XX.',
  '..XXX.....XXX..',
];

/**
 * Les deux rubans qui retombent devant le nœud, en s'écartant.
 *
 * Ils partent du pli central et filent vers +x, c'est-à-dire vers l'avant du
 * rendu : c'est la direction la mieux éclairée, donc celle où un détail fin
 * survit.
 */
const TAILS: readonly string[] = [
  '......X.X......',
  '.....X...X.....',
  '....XX.....XX..',
  '....X.......X..',
];

/** Le pli central, plein et surélevé : c'est lui qui noue les deux boucles. */
const KNOT: readonly string[] = [
  '.....XXXXX.....',
  '.....XXXXX.....',
  '.....XXXXX.....',
];

/** Hauteur du ruban au-dessus du socle. */
const BASE_Y = 1;
/** Largeur du motif (axe z) et profondeur (axe x), centrées sur 0. */
const WIDTH = BOW[0].length;
const Z0 = -Math.floor(WIDTH / 2);
const X0 = -Math.floor(BOW.length / 2);

/**
 * Pose un motif À PLAT dans le plan (x, z), sur `h` briques de haut.
 * Les lignes courent le long de x (vers l'avant), les colonnes le long de z.
 */
function stampFlat(
  b: SceneBuilder,
  pattern: readonly string[],
  role: BrickRole,
  at: { x0: number; y0: number; z0: number; h: number },
  opts: { keepExisting?: boolean } = {}
): void {
  pattern.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell !== 'X') return;
      for (let y = 0; y < at.h; y += 1) {
        b.place(at.x0 + r, at.y0 + y, at.z0 + c, role, opts);
      }
    });
  });
}

export function buildMascotFigure(teamColor: string | null): VoxelScene {
  const b = new SceneBuilder();

  // PAS DE SOCLE, contrairement aux figurines de rôle. Essayé : un disque
  // d'ardoise sous un ruban plat de deux briques donnait une assiette avec un
  // motif peint dessus — le socle occupait les deux tiers de l'image et le nœud
  // n'était plus qu'une décoration posée. Une figurine debout a besoin d'un sol
  // ; un objet posé à plat se suffit, et le fond transparent le détoure.
  //
  // Le ruban : deux boucles creuses, hautes de trois briques. À deux, elles se
  // lisaient comme un tracé au sol ; à trois, elles ont une tranche, donc une
  // ombre, donc un volume.
  stampFlat(b, BOW, 'accent', { x0: X0, y0: BASE_Y, z0: Z0, h: 3 });

  // Les rubans qui filent devant, une brique plus bas que les boucles : ils
  // RETOMBENT, ils ne prolongent pas le nœud à plat.
  stampFlat(b, TAILS, 'accent', {
    x0: X0 + BOW.length - 1,
    y0: BASE_Y,
    z0: Z0,
    h: 2,
  });

  // Le pli central, surélevé d'une brique et coiffé de clair : c'est le seul
  // relief du modèle, donc le seul endroit où la lumière dit « c'est noué ».
  stampFlat(
    b,
    KNOT,
    'accent',
    { x0: X0 + 3, y0: BASE_Y, z0: Z0, h: 5 },
    { keepExisting: false }
  );
  stampFlat(
    b,
    KNOT,
    'highlight',
    { x0: X0 + 3, y0: BASE_Y + 4, z0: Z0, h: 1 },
    { keepExisting: false }
  );

  const recipe: MapRecipe = {
    slug: 'tcg-mascot-noeud',
    name: 'Nœud Women’s Cup',
    layout: 'standard',
    palette: [
      SLATE,
      SLATE,
      normalizeFigureColor(teamColor) ?? DEFAULT_FIGURE_COLOR,
      RIBBON_LIGHT,
    ],
    landmarks: [],
    mood: 'day',
  };

  const bricks = b.toBricks();
  return { recipe, bricks, bounds: boundsOf(bricks) };
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

/** Le SVG de la mascotte, dans la couleur donnée. */
export function renderMascotSvg(teamColor: string | null): string {
  return renderIsoSvg(buildMascotFigure(teamColor), {
    tile: 14,
    cubeHeight: 9,
    padding: 12,
    aspect: 3 / 4,
    studs: false,
    background: false,
    decorative: true,
    idPrefix: 'mascot-noeud-',
  });
}

/** L'URL de la mascotte, couleur comprise. */
export function mascotUrl(color: string | null): string {
  const hex = (normalizeFigureColor(color) ?? DEFAULT_FIGURE_COLOR).slice(1);
  return `/api/tcg/figure/v${MASCOT_VERSION}/${MASCOT_SLUG}/${hex}.svg`;
}
