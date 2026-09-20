// utils/tcg/gameMascots.ts
//
// LES MASCOTTES DU JEU EN VOXEL : Pachimari et compagnie.
//
// POURQUOI CE FICHIER EXISTE À CÔTÉ DE `mascotFigure.ts`. Celui-là sculpte LE
// nœud Women's Cup — notre logo, notre bien. Celui-ci sculpte les mascottes
// d'Overwatch, sous le même arbitrage que `heroFigures.ts` : le TCG est
// gratuit, sans argent ni contrepartie, et ces figurines sont une
// représentation éloignée. Les deux fichiers restent séparés parce que le nœud
// est porté par la COULEUR D'ÉQUIPE (il change de teinte d'une carte à
// l'autre) alors qu'une mascotte a sa palette propre : Pachimari n'est pas
// rose parce que l'équipe est rose.
//
// CE QUI FAIT QU'UNE MASCOTTE SE RECONNAÎT EN 180 PX. Les mêmes trois choses
// que pour les héros — silhouette, couleur dominante, UN accessoire — mais
// avec un avantage : une mascotte EST déjà une forme simple. Pachimari est un
// bulbe, Snowball une sphère, Ganymede une boule à bec. Le piège n'est donc
// pas la complexité, c'est la MOLLESSE : trois blobs ronds crème, bleu et
// jaune se ressemblent tous si rien ne les découpe.
//
// LES RÈGLES APPRISES SUR LES HÉROS, APPLIQUÉES ICI :
//
//   1. UN VOLUME TROP FIN N'EXISTE PAS. Les tentacules de Pachimari sont le
//      cas d'école : dessinés comme des doigts (1×1), ils disparaissaient sous
//      le bulbe et la figurine devenait un œuf. Ils font 3×3 briques de
//      section, sur quatre de haut, et le bulbe les SURPLOMBE — c'est le
//      porte-à-faux qui creuse l'ombre qui les détache.
//
//   2. CE QUI EST COLLÉ FUSIONNE. Cinq tentacules de la couleur du corps,
//      serrés, formaient une jupe continue. Ils sont donc (a) espacés d'au
//      moins une case vide et (b) d'une teinte plus chaude que le bulbe.
//
//   3. UN SEUL ACCESSOIRE, GROS ET DÉTACHÉ. Pour Pachimari c'est la TIGE
//      VERTE. Première version : une colonne de 1×1 sur trois briques — à
//      l'écran, un cheveu. Ici c'est un bulbe vert de 3×3 prolongé par deux
//      feuilles épaisses qui s'écartent : ça se voit avant le reste, et c'est
//      justement ce qu'on veut, parce qu'un bulbe crème sans tige verte n'est
//      pas Pachimari, c'est un oignon.
//
//   4. CE QUI EST TROP PETIT POUR EXISTER NE SE POSE PAS. Pas de bouche, pas
//      de rougeurs aux joues, pas de coutures. Les YEUX sont la seule
//      exception, et elle a été testée expressément : deux blocs sombres de
//      2×2 EN SAILLIE sur la face avant (+x), pas plaqués — un aplat d'une
//      brique d'épaisseur ne reçoit pas d'ombre et se noie dans la courbure.
//
//   5. NE PAS DOUBLER LA RÉSOLUTION. Mêmes conclusions que pour les héros :
//      à taille d'affichage constante, plus de briques = silhouette dissoute
//      et SVG beaucoup plus lourd. Tout tient dans une vingtaine de briques de
//      haut.
//
// CE QUI N'EST PAS ICI, ET POURQUOI. Les variantes de Pachimari (Maximari,
// Nessimari, Zenyattamari, Scarimari, Pachimerry…) existent bien dans le jeu,
// mais leur apparence exacte n'est pas assez sûre de mémoire pour être
// sculptée : une variante inventée ne vaut rien — elle apprendrait aux
// joueuses un dessin qui n'existe pas. Elles s'ajouteront le jour où
// quelqu'un les aura sous les yeux.
//
// Pur : construit une scène et la rend en SVG via le moteur des maquettes.

// Imports RELATIFS, comme le reste du moteur voxel : un script Node de rendu
// (cf. scripts/render-map-previews.ts) ne résout pas l'alias `@/`.
import { SceneBuilder } from '../maps/builder';
import { renderIsoSvg } from '../maps/isoSvg';
import type { Brick, BrickRole, MapRecipe, VoxelScene } from '../maps/types';

/**
 * Version des modèles, portée par l'URL.
 *
 * Le SVG est servi avec un cache d'un an (sa sortie ne dépend que du chemin).
 * Retoucher un modèle sans changer ce numéro laisserait l'ancien dessin en
 * cache chez chaque visiteuse pendant des mois.
 */
export const GAME_MASCOT_VERSION = 1;

/** Les mascottes modelées, par slug d'URL. */
export const GAME_MASCOT_SLUGS = [
  'pachimari',
  'ganymede',
  'snowball',
  'bob',
] as const;

export type GameMascotSlug = (typeof GAME_MASCOT_SLUGS)[number];

export function isGameMascotSlug(v: string): v is GameMascotSlug {
  return (GAME_MASCOT_SLUGS as readonly string[]).includes(v);
}

/** Nom libre → slug de mascotte. Insensible à la casse et à la ponctuation. */
export function gameMascotSlugFromName(
  name: string | null | undefined
): GameMascotSlug | null {
  const key = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.\s·'’-]/g, '');
  return isGameMascotSlug(key) ? key : null;
}

/*
 * REPÈRE, identique aux figurines de héros. Le moteur voit les faces +x
 * (droite, bien éclairée) et +z (gauche). La figurine regarde vers +x : sa
 * FACE est la face droite du rendu. Largeur = axe z, centrée sur 0 ;
 * profondeur = axe x.
 *
 * Toutes les mascottes sont centrées sur (cx = 1, cz = 0), comme le socle des
 * héros — c'est ce qui fait que la figurine est posée au milieu de son disque.
 */

/** Les trois teintes d'une mascotte, en plus de l'ardoise du socle. */
type MascotPalette = {
  /** La matière du corps : rôle `structure`. */
  body: string;
  /** La couleur dominante, celle qu'on cite : rôle `accent`. */
  main: string;
  /** Le détail lumineux (tige, bec, visière) : rôle `highlight`. */
  glow: string;
};

/** Ardoise du socle — et, pour Pachimari, des yeux. */
const PEDESTAL = '#2c2837';

const PALETTES: Record<GameMascotSlug, MascotPalette> = {
  // Crème du bulbe, beige chaud des tentacules, vert franc de la tige.
  pachimari: { body: '#fff8ec', main: '#e6c68f', glow: '#57bb2f' },
  // Plumage jaune, ailes et queue brunes, bec orange.
  ganymede: { body: '#8a6a44', main: '#f0c94a', glow: '#f2872e' },
  // Coque blanche, ceinture bleue de Mei, œil cyan.
  snowball: { body: '#eef4fa', main: '#3f7cc0', glow: '#8fe3ff' },
  // Costume sombre, métal crème de l'omniaque, plastron clair.
  bob: { body: '#2f3542', main: '#c6ac7e', glow: '#f0e7d4' },
};

/**
 * Le socle commun : un disque d'ardoise, bordé de la dominante.
 *
 * `ringRole` existe pour Pachimari. Avec le liseré en `accent`, il était de la
 * MÊME teinte que les tentacules, posés juste au-dessus : les deux se
 * soudaient en un seul bourrelet beige et la peluche perdait ses pattes. Un
 * liseré d'ardoise les détache.
 */
function pedestal(
  b: SceneBuilder,
  radius = 7,
  ringRole: BrickRole = 'accent'
): void {
  b.disc(1, 0, radius, 0, 1, 'ground');
  b.ring(1, 0, radius, 1, 1, 1, ringRole);
  b.disc(1, 0, radius - 1, 1, 1, 'ground');
}

/**
 * Empile des disques centrés sur (1, 0) selon un profil de rayons : un rayon
 * par niveau, du bas vers le haut. C'est la primitive de toutes les mascottes,
 * qui sont toutes des corps ronds.
 */
function stack(
  b: SceneBuilder,
  y0: number,
  radii: readonly number[],
  role: BrickRole,
  opts: { keepExisting?: boolean } = {}
): void {
  radii.forEach((r, i) => {
    if (r < 0.6) return;
    b.disc(1, 0, r, y0 + i, 1, role, opts);
  });
}

/* ---------------------------------------------------------------------------
 * Les mascottes
 * -------------------------------------------------------------------------*/

/**
 * Le profil du bulbe de Pachimari, du bas (y = 5) vers le haut.
 *
 * Un OIGNON : ventru, le maximum dans le tiers bas, un col au sommet pour la
 * tige. Premier profil essayé : une décroissance régulière jusqu'à 1,7 — elle
 * donnait un CÔNE, c'est-à-dire une gousse d'ail, pas une peluche. Il faut
 * tenir le rayon presque constant sur la moitié de la hauteur et ne le lâcher
 * qu'à la fin, et s'arrêter large (3,2) : le col est un plateau, pas une
 * pointe.
 */
const PACHI_BULB: readonly number[] = [
  5.0, 6.0, 6.3, 6.3, 6.2, 6.0, 5.6, 5.0, 4.0, 2.8,
];

/**
 * PACHIMARI — la peluche oignon-poulpe. Silhouette : un bulbe crème posé sur
 * cinq gros tentacules courts. Accessoire : la tige verte, franche.
 */
function buildPachimari(b: SceneBuilder): void {
  pedestal(b, 8, 'ground');

  // LES TENTACULES : cinq moignons de 3×3 sur TROIS de haut, posés sur un
  // cercle PLUS LARGE que le bulbe. Deux essais à corriger avant celui-ci :
  // sur un cercle au rayon du bulbe, le ventre les recouvrait entièrement et
  // ils n'existaient plus ; sur quatre de haut, ils devenaient quatre pieds de
  // table. Courts et débordants, ce sont des moignons.
  for (const [x0, z0] of [
    [6, -1],
    [3, 5],
    [3, -7],
    [-4, 4],
    [-4, -6],
  ] as const) {
    b.box(x0, 2, z0, 3, 3, 3, 'accent');
  }

  // LE BULBE, qui déborde des tentacules et les surplombe : le porte-à-faux
  // creuse l'ombre qui dit « la peluche est POSÉE sur ses moignons ».
  stack(b, 4, PACHI_BULB, 'structure');

  // LES YEUX : deux pastilles d'ardoise (rôle `ground`, la couleur du socle)
  // posées JUSTE DEVANT la peau du bulbe, en x = 7 — elles dépassent d'une
  // brique, donc elles ont leurs propres faces éclairées, alors qu'à même la
  // surface elles n'auraient été qu'un aplat. Le contraste ardoise/crème est
  // le seul qui tienne à 180 px.
  //
  // Elles font UNE brique de profondeur : à deux, le cube sombre était plus
  // gros que l'œil, et les deux se lisaient ensemble comme une fente noire en
  // travers de la face.
  b.box(7, 10, 1, 1, 2, 2, 'ground');
  b.box(7, 10, -3, 1, 2, 2, 'ground');

  // LA TIGE : un fût de 3×3, une couronne de QUATRE bras (±x et ±z) et un
  // bourgeon au centre. Quatre versions écartées avant celle-ci :
  //   - des feuilles de 2×2 : deux antennes d'insecte ;
  //   - des feuilles montant tout droit sur deux briques : un cactus ;
  //   - des feuilles décalées en escalier : une flèche verte ;
  //   - un simple cube vert : un petit chapeau, pas une pousse.
  // Mais surtout : toutes les versions à DEUX feuilles échouaient pour la
  // raison déjà notée dans `mascotFigure.ts` — en isométrie, une paire
  // symétrique le long d'un axe se projette en DIAGONALE sur l'écran, donc en
  // S ou en éclair, jamais en V. Une couronne à quatre bras, elle, se projette
  // symétriquement quel que soit l'angle. C'est la seule forme qui se lise
  // comme une touffe de feuilles.
  b.box(0, 12, -1, 3, 3, 3, 'highlight');
  b.box(0, 14, 2, 3, 2, 2, 'highlight');
  b.box(0, 14, -3, 3, 2, 2, 'highlight');
  b.box(3, 14, -1, 2, 2, 3, 'highlight');
  b.box(-2, 14, -1, 2, 2, 3, 'highlight');
  b.box(0, 16, -1, 3, 2, 3, 'highlight');
}

/** Corps de Ganymede : une poire, ventre bas et large. */
const GANY_BODY: readonly number[] = [4.4, 5.0, 5.0, 4.8, 4.2, 3.4];

/**
 * GANYMEDE — l'oiseau de Bastion. Silhouette : une boule jaune à grosse tête,
 * sur deux pattes orange. Accessoire : le bec, gros et orange, en saillie
 * franche sur la face avant.
 *
 * LA TÊTE EST UN CUBE, pas un disque. En empilant des disques de rayon
 * décroissant, tête et corps formaient un continuum : un cône jaune. Le cube
 * donne des faces PLATES — donc un endroit où poser des yeux et un bec — et un
 * décrochement net au niveau du cou, qui est tout ce qui reste d'un cou quand
 * on n'a pas le droit d'en sculpter un (un cou est un volume fin).
 */
function buildGanymede(b: SceneBuilder): void {
  // Liseré d'ardoise : avec un liseré `accent`, le socle était JAUNE comme
  // l'oiseau et l'ensemble se lisait comme un seul tas.
  pedestal(b, 6, 'ground');

  // Pattes trapues. Deux briques de large : à une, elles s'évaporaient.
  b.box(0, 2, -3, 2, 2, 2, 'highlight');
  b.box(0, 2, 1, 2, 2, 2, 'highlight');

  // Le corps jaune : une poire, ventre bas.
  stack(b, 4, GANY_BODY, 'accent');

  // Les ailes : deux plaques brunes SUR les flancs, posées en force
  // (`keepExisting: false`) et débordant d'une brique. Plaquées à l'intérieur
  // du volume, elles n'étaient qu'une tache de couleur.
  b.box(0, 5, 5, 3, 4, 2, 'structure', { keepExisting: false });
  b.box(0, 5, -7, 3, 4, 2, 'structure', { keepExisting: false });

  // La queue : UN coin épais qui file vers l'arrière. Première version : deux
  // dalles empilées et décalées, longues de sept briques — une planche, qui
  // pesait plus lourd que l'oiseau.
  b.box(-6, 6, -2, 4, 3, 5, 'structure');

  // La tête, cube de 5×5×6, et le bec qui en sort de trois briques.
  b.box(0, 10, -3, 5, 5, 6, 'accent');
  // Le bec : deux briques pleines puis une pointe. En pavé de 3×2×2, il
  // faisait un BEC DE CANARD et l'oiseau devenait un jouet de bain.
  b.box(5, 10, -1, 2, 2, 2, 'highlight');
  b.box(7, 10, -1, 1, 1, 2, 'highlight');

  // Les yeux, AU-DESSUS du bec, en saillie d'une brique sur la face avant,
  // avec deux cases vides entre eux : à une seule, les deux blocs se
  // rejoignaient en un bandeau. Et pas plus haut que la quatrième rangée de la
  // tête : posés sur la rangée du dessus, ils débordaient de l'arête et se
  // lisaient comme deux petites cornes.
  b.box(5, 12, 1, 1, 2, 2, 'ground');
  b.box(5, 12, -3, 1, 2, 2, 'ground');
}

/**
 * SNOWBALL — le drone de Mei. Silhouette : une sphère claire juchée sur un
 * monticule de givre. Accessoire : la visière sombre à œil cyan.
 */
function buildSnowball(b: SceneBuilder): void {
  pedestal(b, 7);

  // LE MONTICULE DE GIVRE. Il ne sert pas à décorer : sans lui, la sphère
  // flottait à trois briques du socle et le rendu montrait deux objets sans
  // rapport. Il monte jusqu'à toucher le bas de la sphère. Il est BLEU et non
  // blanc : en blanc, le monticule et la coque ne faisaient qu'un volume, et
  // le drone devenait un bonhomme de neige.
  b.disc(1, 0, 3.6, 2, 2, 'accent');
  b.disc(1, 0, 2.6, 4, 2, 'accent');

  // La coque : une sphère, rayon 5,8, posée sur le monticule.
  const cy = 11;
  for (let y = 6; y <= 16; y += 1) {
    const dy = (y - cy) / 5.8;
    const r = 5.8 * Math.sqrt(Math.max(0, 1 - dy * dy));
    if (r < 0.9) continue;
    b.disc(1, 0, r, y, 1, 'structure');
  }

  // La ceinture bleue à l'équateur : elle donne sa courbure à la sphère (une
  // sphère d'une seule teinte se lit comme un disque) et c'est la couleur de
  // Mei.
  for (let y = 9; y <= 11; y += 1) {
    const dy = (y - cy) / 5.8;
    const r = 5.8 * Math.sqrt(Math.max(0, 1 - dy * dy));
    b.ring(1, 0, r, 1.6, y, 1, 'accent', { keepExisting: false });
  }
  // PAS DE CALOTTE BLEUE EN PLUS. Essayée : avec la ceinture, le monticule et
  // les propulseurs, ça faisait quatre zones bleues sur un petit volume, et la
  // sphère se fragmentait en morceaux sans rapport.

  // L'ŒIL : un cerne d'ardoise ROND, en saillie de deux briques, avec une
  // pupille cyan qui en sort encore d'une. Deux versions écartées :
  //   - une plaque cyan de 4×6 à même la sphère : un écran plat collé sur un
  //     cube, pas un œil ;
  //   - le même cerne en RECTANGLE : une visière, donc un casque.
  // C'est la rondeur du cerne sombre qui fait l'œil, pas la couleur.
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dz = -4; dz <= 4; dz += 1) {
      if (dz * dz + 1.8 * dy * dy > 17) continue;
      b.box(6, 11 + dy, dz, 2, 1, 1, 'ground');
    }
  }
  b.box(8, 10, -1, 1, 3, 3, 'highlight');

  // Deux propulseurs, petits et bas, à l'arrière des flancs : ils disent
  // « engin », sans carrer la silhouette comme le faisaient les grands
  // ailerons à l'équateur.
  b.box(-3, 8, 5, 3, 3, 3, 'accent');
  b.box(-3, 8, -7, 3, 3, 3, 'accent');
}

/**
 * BOB — l'omniaque majordome d'Ashe. Silhouette : le plus massif du lot, tout
 * en épaules, avant-bras énormes, petite tête. Accessoire : le plastron clair
 * du costume, col compris.
 *
 * LE COSTUME EST SOMBRE, LE MÉTAL EST RARE. Première version : épaules, bras
 * et tête en métal crème, costume réduit au torse — il en sortait un grand
 * robot doré, sans rien d'un majordome. Le métal ne reste donc qu'aux
 * AVANT-BRAS et à la TÊTE, c'est-à-dire là où un majordome a la peau nue.
 */
function buildBob(b: SceneBuilder): void {
  pedestal(b, 8);

  // Jambes : courtes et larges, pantalon sombre.
  b.box(0, 2, -5, 4, 6, 4, 'structure');
  b.box(0, 2, 1, 4, 6, 4, 'structure');

  // Le torse : taille étroite, poitrine large, épaules en surplomb. C'est ce
  // triangle qui porte à lui seul la carrure.
  b.box(0, 8, -5, 4, 4, 10, 'structure');
  b.box(-1, 12, -7, 5, 5, 14, 'structure');
  b.box(-1, 17, -8, 5, 2, 16, 'structure');

  // Le plastron clair, en saillie d'une brique, et le col qui le coiffe.
  b.box(4, 12, -2, 1, 5, 4, 'highlight');
  b.box(4, 17, -3, 1, 2, 6, 'highlight');
  // Le nœud papillon : un bloc d'ardoise sur le col, en saillie.
  b.box(5, 17, -2, 1, 2, 4, 'ground');

  // Les bras : manche sombre en haut, AVANT-BRAS de métal en bas. Le
  // changement de matière à mi-bras évite le bras d'un seul tenant, qui se
  // fondait dans le torse. Ils TOUCHENT les épaules : écartés d'une case, ils
  // se lisaient comme deux poteaux plantés à côté du personnage.
  b.box(0, 12, -11, 4, 6, 4, 'structure');
  b.box(0, 6, -11, 4, 6, 4, 'accent');
  b.box(0, 12, 8, 4, 6, 4, 'structure');
  b.box(0, 6, 8, 4, 6, 4, 'accent');

  // La tête, petite au regard des épaules : c'est ce RAPPORT qui fait BOB.
  b.box(0, 19, -2, 4, 4, 4, 'accent');
  // Les yeux, bandeau d'ardoise en saillie.
  b.box(4, 21, -2, 1, 1, 4, 'ground');
  // La moustache : une barre claire sous les yeux, en saillie. Quatre briques,
  // le minimum pour qu'un détail existe encore à 180 px.
  b.box(4, 19, -2, 1, 1, 4, 'highlight');
}

const BUILDERS: Record<GameMascotSlug, (b: SceneBuilder) => void> = {
  pachimari: buildPachimari,
  ganymede: buildGanymede,
  snowball: buildSnowball,
  bob: buildBob,
};

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

export function buildGameMascot(slug: GameMascotSlug): VoxelScene {
  const b = new SceneBuilder();
  BUILDERS[slug](b);

  const palette = PALETTES[slug];
  const recipe: MapRecipe = {
    slug: `tcg-mascot-${slug}`,
    name: slug,
    layout: 'standard',
    palette: [PEDESTAL, palette.body, palette.main, palette.glow],
    landmarks: [],
    mood: 'day',
  };

  const bricks = b.toBricks();
  return { recipe, bricks, bounds: boundsOf(bricks) };
}

export function renderGameMascotSvg(slug: GameMascotSlug): string {
  return renderIsoSvg(buildGameMascot(slug), {
    tile: 14,
    cubeHeight: 9,
    padding: 12,
    aspect: 3 / 4,
    studs: false,
    background: false,
    decorative: true,
    idPrefix: `mascot-${slug}-`,
  });
}

/** L'URL de la figurine d'une mascotte. */
export function gameMascotUrl(slug: GameMascotSlug): string {
  return `/api/tcg/mascot/v${GAME_MASCOT_VERSION}/${slug}.svg`;
}
