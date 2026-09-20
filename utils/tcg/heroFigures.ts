// utils/tcg/heroFigures.ts
//
// LES HÉROS OVERWATCH EN VOXEL, pour les cartes du TCG.
//
// CE FICHIER LÈVE UNE RÈGLE QUE LE DÉPÔT S'ÉTAIT DONNÉE, et il faut le dire ici
// plutôt que de laisser deux fichiers se contredire. `utils/tcg/roleFigures.ts`
// posait : aucune illustration de personnage sous licence sur les cartes, au
// motif qu'un héros en voxel n'a d'intérêt que s'il est reconnaissable — donc
// qu'il reproduit son dessin — et qu'une gamme Overwatch en briques existe sous
// licence Blizzard.
//
// Arbitrage de l'association, le 2026-09-20 : le TCG est GRATUIT, sans argent
// ni contrepartie, et ces figurines sont une représentation éloignée, sans
// profit. Décision prise en connaissance de la règle, qui est réécrite en
// conséquence dans `roleFigures.ts` — les figurines de rôle restent, non plus
// comme un substitut imposé, mais comme le repli quand aucun héros n'est
// déclaré sur une carte.
//
// CE QUI FAIT QU'UN HÉROS SE RECONNAÎT EN 180 PX. Pas le visage — il n'y a pas
// assez de briques pour un visage. Trois choses, dans cet ordre :
//   1. la SILHOUETTE (un colosse, une petite rapide, une méca, un gorille) ;
//   2. la COULEUR dominante, celle qu'on cite quand on décrit le personnage ;
//   3. UN accessoire, un seul, celui qu'on dessinerait de mémoire.
// Ajouter un quatrième détail ne rend jamais plus reconnaissable : il rend le
// modèle plus chargé, et à cette taille un modèle chargé devient une tache.
//
// LE STYLE EST CELUI DES FIGURINES DE RÔLE, volontairement : proportions
// « chibi » (tête grosse, corps court), pas de tenons sur les faces, pas de
// main en pince ni de tête cylindrique — l'habillage d'un jouet de brique reste
// hors sujet. On sculpte un personnage, on n'imite pas une gamme.
//
// TOUS TRAPUS, ET AU MÊME GRAIN QUE LES FIGURINES DE RÔLE. Le premier lot l'a
// montré sans appel : ce moteur rend très bien les volumes épais et très mal
// les silhouettes fines. Reinhardt et D.Va, qui sont des blocs, se nommaient au
// premier coup d'œil ; Tracer et Mercy, minces, se perdaient. D'où le gabarit
// COMMUN : corps court et large, membres épais, quelle que soit la morphologie
// d'origine. Les héros se ressemblent un peu plus entre eux qu'ils ne se
// ressemblent dans le jeu, et c'est le prix assumé de la lisibilité.
//
// DOUBLER LA RÉSOLUTION A ÉTÉ ESSAYÉ, LE 2026-09-20, ET REJETÉ. À taille
// d'affichage constante — une carte fait 180 px — deux fois plus de briques
// divise par deux la taille de chaque brique à l'écran : les arêtes qui
// séparaient les volumes deviennent un grésillement et la silhouette se
// dissout. Reinhardt y perdait sa tête, fondue dans le torse, et son marteau,
// noyé dans la masse ; son SVG passait au passage de 25 à 121 ko, à multiplier
// par 45 héros et par carte affichée. La résolution n'aiderait que si l'image
// grandissait aussi. Ne pas refaire l'essai sans changer d'abord la taille
// d'affichage.
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
export const HERO_FIGURE_VERSION = 1;

/**
 * Les héros modelés, par slug d'URL.
 *
 * Le registre `utils/heroes/overwatch.ts` en compte 45 : celui-ci se remplit
 * par lots, chacun relu avant le suivant. Un héros absent d'ici retombe sur la
 * figurine de son rôle — jamais sur un trou.
 */
export const HERO_FIGURE_SLUGS = [
  'reinhardt',
  'tracer',
  'mercy',
  'dva',
  'winston',
  'roadhog',
  'bastion',
  'zarya',
  'orisa',
  'doomfist',
  'junkerqueen',
  'mauga',
  'ramattra',
  'wreckingball',
  'sigma',
  'hazard',
  'ashe',
  'cassidy',
  'reaper',
  'echo',
  'genji',
  'hanzo',
  'junkrat',
  'mei',
  'venture',
  'vendetta',
  'pharah',
  'sojourn',
  'soldier76',
  'sombra',
  'symmetra',
  'torbjorn',
  'widowmaker',
  'ana',
  'baptiste',
  'brigitte',
  'illari',
  'kiriko',
  'lifeweaver',
  'lucio',
  'moira',
  'zenyatta',
] as const;

export type HeroFigureSlug = (typeof HERO_FIGURE_SLUGS)[number];

export function isHeroFigureSlug(v: string): v is HeroFigureSlug {
  return (HERO_FIGURE_SLUGS as readonly string[]).includes(v);
}

/** Nom du registre → slug de figurine. Insensible à la casse et aux points. */
export function heroFigureSlugFromName(
  name: string | null | undefined
): HeroFigureSlug | null {
  const key = (name ?? '')
    .trim()
    .toLowerCase()
    // LES ACCENTS D'ABORD : « Lúcio » et « Torbjörn » sont les orthographes
    // OFFICIELLES du jeu. Le registre les écrit sans accent, mais rien ne
    // garantit que toute source fasse de même — une préférence saisie à la
    // main, un import, une API éditeur.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    // PUIS TOUT CE QUI N'EST NI LETTRE NI CHIFFRE. La version précédente
    // n'enlevait que `.`, les espaces et `·` — et laissait donc les
    // DEUX-POINTS. « Soldier: 76 » devenait `soldier:76`, qui ne
    // correspondait à aucun slug : sa figurine ÉTAIT sculptée
    // (`soldier76`) et ne s'est jamais affichée. La carte retombait sur la
    // figurine générique de son rôle, sans que rien ne le signale.
    .replace(/[^a-z0-9]/g, '');
  return isHeroFigureSlug(key) ? key : null;
}

/*
 * REPÈRE, identique aux figurines de rôle. Le moteur voit les faces +x (droite,
 * bien éclairée) et +z (gauche). La figurine regarde vers +x : sa FACE est la
 * face droite du rendu. Largeur = axe z, centrée sur 0 ; profondeur = axe x.
 */

/** Les quatre teintes d'un héros : socle, corps, dominante, détail clair. */
type HeroPalette = {
  /** La couleur qu'on cite quand on décrit le personnage. */
  main: string;
  /** Le détail lumineux : visière, énergie, métal clair. */
  glow: string;
  /** La matière du corps (tissu, peau, métal sombre). */
  body: string;
};

const PEDESTAL = '#2c2837';

const PALETTES: Record<HeroFigureSlug, HeroPalette> = {
  // Acier bleu et braise : l'armure Crusader et la fournaise du marteau.
  reinhardt: { main: '#4a6fa5', glow: '#ffb347', body: '#8d99ae' },
  // Orange de l'accélérateur, blouson brun, collant sombre.
  tracer: { main: '#f4801f', glow: '#7fd4ff', body: '#5a4632' },
  // Blanc et or, halo bleu du bâton.
  mercy: { main: '#f4f1e8', glow: '#ffd166', body: '#cbb994' },
  // Rose de la méca, cockpit bleuté.
  dva: { main: '#f45fa0', glow: '#9fe8ff', body: '#3a3f58' },
  // Pelage sombre, armure claire, lunettes lumineuses.
  winston: { main: '#6f6a78', glow: '#8fe3ff', body: '#39343f' },
  // Cuir brun de la panse, masque clair, harnais sombre.
  roadhog: { main: '#a9743f', glow: '#e8dcc8', body: '#4a3b31' },
  // Vert-de-gris militaire, œil bleu, oiseau clair.
  bastion: { main: '#7f8b6b', glow: '#9fe8ff', body: '#4e5546' },
  // Rose des cheveux, armure claire, gris de l'équipement.
  zarya: { main: '#f06ca0', glow: '#ffd9e6', body: '#5b6072' },
  // Or et blanc du châssis, vert du canon.
  orisa: { main: '#d9a441', glow: '#8fe3a0', body: '#4a4638' },
  // Or du gantelet, armure noire, jointures incandescentes.
  doomfist: { main: '#c9973f', glow: '#ff8a3d', body: '#33333c' },
  // Acier bleuté de la ferraille, crinière blonde, cuir sombre.
  junkerqueen: { main: '#6f8fa8', glow: '#f2d16b', body: '#4a3c34' },
  // Rouge du harnais, peau brune, feu des canons.
  mauga: { main: '#c94b3c', glow: '#ffb347', body: '#6d4a3a' },
  // Violet d'omniaque, noyau lumineux, châssis sombre.
  ramattra: { main: '#6b4f9e', glow: '#c68bff', body: '#2f2b3a' },
  // Orange du blindage, verrière claire, métal gris.
  wreckingball: { main: '#c97f3a', glow: '#ffd27a', body: '#57585e' },
  // Bleu nuit du costume, halo de gravité, roche sombre.
  sigma: { main: '#4a5a78', glow: '#9be0ff', body: '#2f3646' },
  // Vert acide de l'énergie, carapace sombre, pointes claires.
  hazard: { main: '#5f8f4a', glow: '#c6ff6b', body: '#33373a' },
  // Manteau noir, chevelure blanche, rouge du gilet.
  ashe: { main: '#33343d', glow: '#f2efe8', body: '#7d2f38' },
  // Rouge du serape, chapeau clair, cuir brun.
  cassidy: { main: '#a8322f', glow: '#e8d5a8', body: '#4a3a2e' },
  // Noir du manteau, masque d'os, cuir gris.
  reaper: { main: '#26262e', glow: '#e8e4dc', body: '#3a3a44' },
  // Blanc de porcelaine, visage violet, articulations grises.
  echo: { main: '#f0eeea', glow: '#a86bff', body: '#8f96a8' },
  // Vert du cyborg, énergie claire, métal sombre.
  genji: { main: '#4fa85f', glow: '#a8ff8d', body: '#4a4f57' },
  // Bleu du kimono, peau nue, laque sombre de l'arc.
  hanzo: { main: '#43607f', glow: '#e0b183', body: '#2f3a4a' },
  // Jaune de la ferraille, flamme orange, suie.
  junkrat: { main: '#e0b83a', glow: '#ff8a3d', body: '#463f36' },
  // Bleu de la parka, glace claire, fourrure brune.
  mei: { main: '#6fb3dd', glow: '#eef6ff', body: '#8a6a4a' },
  // Orange de la combinaison, métal clair de la foreuse, kaki du sac.
  venture: { main: '#d9782f', glow: '#e8dcc8', body: '#5e5140' },
  // Cramoisi de la cape, acier de l'arbalète, noir de l'habit.
  vendetta: { main: '#8e2440', glow: '#c9d4de', body: '#2a2733' },
  // Bleu du blindage, or de l'œil, gris des jointures.
  pharah: { main: '#3a6bb5', glow: '#ffd166', body: '#4a5060' },
  // Rouge de la veste, bleu nuit de l'armure, énergie du railgun.
  sojourn: { main: '#c23b3b', glow: '#7fd4ff', body: '#2e3a4f' },
  // Bleu du blouson, visière rouge, gris du treillis.
  soldier76: { main: '#33559e', glow: '#ff4d4d', body: '#4e5560' },
  // Violet du manteau, néon magenta, combinaison noire.
  sombra: { main: '#7a3fb5', glow: '#d98bff', body: '#2f2a3a' },
  // Turquoise de la tenue, lumière dure, cheveux sombres.
  symmetra: { main: '#2fb5b5', glow: '#a8f2ea', body: '#4a3f4a' },
  // Orange de l'armure, barbe blonde, cuir sombre.
  torbjorn: { main: '#c94f3a', glow: '#e8c98a', body: '#4a4038' },
  // Violet de la combinaison, peau bleue, visière rouge.
  widowmaker: { main: '#6b4fa8', glow: '#ff5c7a', body: '#6b8fd4' },
  // Bleu du manteau, voile et cheveux blancs, peau hâlée.
  ana: { main: '#2f5fa8', glow: '#f2efe8', body: '#7a5240' },
  // Bleu-vert de l'armure, ambre du champ, peau sombre.
  baptiste: { main: '#2f7a8c', glow: '#ffd166', body: '#4a3126' },
  // Rouille de l'armure, natte blonde, acier du bouclier.
  brigitte: { main: '#a8562f', glow: '#f2d16b', body: '#8d99ae' },
  // Or solaire, lumière blanche du pylône, rouge de la tenue.
  illari: { main: '#e0a53a', glow: '#fff0c0', body: '#8c3a2f' },
  // Rouge du hakama, blanc du masque, cheveux noirs.
  kiriko: { main: '#c9384a', glow: '#f2efe8', body: '#33313d' },
  // Rose du lotus, sève verte, robe sombre.
  lifeweaver: { main: '#e06ba8', glow: '#8dff9e', body: '#3f3a4a' },
  // Vert et lime de l'ampli, combinaison sombre.
  lucio: { main: '#6fc26b', glow: '#d9f96a', body: '#2f3b45' },
  // Violet du manteau, or du bras de soin, noir du reste.
  moira: { main: '#6b3fa0', glow: '#f2c14e', body: '#191625' },
  // Laiton de l'omniaque, cyan des sphères.
  zenyatta: { main: '#d9b061', glow: '#8fe3ff', body: '#4a4234' },
};

/** Le socle commun : un disque d'ardoise, bordé de la dominante du héros. */
function pedestal(b: SceneBuilder, radius = 6): void {
  b.disc(1, 0, radius, 0, 1, 'ground');
  b.ring(1, 0, radius, 1, 1, 1, 'accent');
  b.disc(1, 0, radius - 1, 1, 1, 'ground');
}

/**
 * Tête cubique 4×4×4 à bandeau lumineux — le gabarit « chibi » commun.
 * `visor` pose le bandeau sur la face avant ; sans lui, la tête reste nue et
 * l'accessoire du héros porte seul la reconnaissance.
 */
function head(
  b: SceneBuilder,
  y0: number,
  z0: number,
  opts: { cap?: BrickRole; visor?: boolean } = {}
): void {
  b.box(0, y0, z0, 4, 4, 4, 'structure');
  if (opts.cap) {
    b.box(0, y0 + 3, z0, 4, 1, 4, opts.cap, { keepExisting: false });
    b.box(0, y0, z0, 1, 4, 4, opts.cap, { keepExisting: false });
  }
  if (opts.visor !== false) {
    b.box(3, y0 + 1, z0, 1, 1, 4, 'highlight', { keepExisting: false });
  }
}

/* ---------------------------------------------------------------------------
 * Les héros
 * -------------------------------------------------------------------------*/

/**
 * REINHARDT — le colosse. Silhouette : deux fois plus large que haute d'épaules,
 * jambes courtes. Accessoire : le marteau, porté verticalement côté visible.
 */
function buildReinhardt(b: SceneBuilder): void {
  pedestal(b, 7);
  // Jambes trapues, cuissards d'acier.
  b.box(0, 2, -4, 4, 5, 3, 'structure');
  b.box(0, 2, 1, 4, 5, 3, 'structure');
  b.box(0, 2, -4, 4, 2, 3, 'accent', { keepExisting: false });
  b.box(0, 2, 1, 4, 2, 3, 'accent', { keepExisting: false });
  // Ceinturon.
  b.box(-1, 7, -4, 5, 2, 8, 'accent');
  // Buste très large : c'est la carrure qui fait Reinhardt avant tout le reste.
  b.box(-1, 9, -6, 5, 7, 12, 'structure');
  b.box(3, 10, -4, 1, 5, 8, 'accent', { keepExisting: false });
  // Épaulières débordantes, plus hautes que les épaules.
  b.box(-1, 14, -8, 5, 4, 3, 'accent');
  b.box(-1, 14, 5, 5, 4, 3, 'accent');
  head(b, 16, -2, { cap: 'accent' });
  // Le marteau : manche long côté +z, tête massive en bas.
  b.box(1, 6, 8, 2, 14, 2, 'structure');
  b.box(0, 4, 7, 4, 3, 4, 'accent');
  b.box(0, 4, 7, 4, 1, 4, 'highlight', { keepExisting: false });
}

/**
 * TRACER — la petite rapide. Silhouette : courte, penchée en avant, appuyée sur
 * la jambe avant. Accessoire : l'accélérateur, un disque lumineux sur la
 * poitrine, cerclé d'orange.
 */
function buildTracer(b: SceneBuilder): void {
  pedestal(b, 6);
  // Fente marquée, sur des jambes ÉPAISSES : au premier jet elles étaient
  // fines « parce que Tracer est fine », et la pose se réduisait à deux traits.
  b.box(2, 2, -3, 3, 4, 3, 'structure');
  b.box(-2, 2, 1, 3, 4, 3, 'structure');
  b.box(2, 2, -3, 3, 1, 3, 'accent', { keepExisting: false });
  b.box(-2, 2, 1, 3, 1, 3, 'accent', { keepExisting: false });
  // Buste court et LARGE, blouson par-dessus.
  b.box(0, 6, -4, 4, 6, 8, 'structure');
  b.box(-1, 7, -5, 5, 4, 10, 'accent');
  // L'ACCÉLÉRATEUR EN VOLUME, pas en motif plaqué. Premier jet : un anneau
  // tamponné sur la face avant — à cette taille, une gravure d'une brique
  // d'épaisseur ne reçoit aucune ombre et se perd dans le blouson. En saillie,
  // il porte une ombre et devient le point de lecture du personnage.
  b.box(4, 8, -3, 2, 4, 6, 'accent');
  b.box(6, 9, -2, 1, 2, 4, 'highlight');
  // Harnais : deux sangles épaisses qui passent sur les épaules et rejoignent
  // l'accélérateur. C'est elles qui disent « il est SANGLÉ sur elle ».
  b.box(2, 11, -4, 3, 2, 2, 'accent');
  b.box(2, 11, 2, 3, 2, 2, 'accent');
  // Bras arrière seulement : le bras avant tendu et son pistolet formaient un
  // doigt fin devant la poitrine, qui masquait l'accélérateur sans rien dire.
  b.box(-1, 8, 5, 3, 4, 3, 'structure');
  head(b, 12, -2, { visor: false });
  // Mèche courte en pointe vers l'arrière — la coiffure fait la silhouette.
  b.box(-1, 15, -2, 2, 2, 4, 'structure');
  b.box(-3, 16, -1, 2, 2, 2, 'structure');
}

/**
 * MERCY — les ailes. Silhouette : élancée, deux ailes déployées derrière, plus
 * larges que le personnage. Accessoire : le bâton, tenu haut, à halo bleu.
 *
 * Les ailes sont posées EN ESCALIER plutôt qu'en plaque : une plaque se lisait
 * comme une cape, l'escalier donne les plumes.
 */
function buildMercy(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -2, 2, 5, 2, 'structure');
  b.box(0, 2, 1, 2, 5, 2, 'structure');
  // Robe évasée, claire, liserée d'or.
  b.box(-1, 6, -4, 4, 4, 8, 'accent');
  b.box(-1, 6, -4, 4, 1, 8, 'highlight', { keepExisting: false });
  b.box(0, 10, -3, 3, 5, 6, 'accent');
  b.box(3, 11, -2, 1, 3, 4, 'highlight', { keepExisting: false });
  head(b, 15, -2, { cap: 'highlight', visor: false });

  // AILES : deux éventails ACCROCHÉS AUX ÉPAULES, pas un escalier de cubes.
  //
  // Premier essai : des cubes montant en diagonale vers l'arrière ET vers
  // l'extérieur — ils se détachaient du corps et flottaient, trois taches
  // jaunes sans rapport avec la silhouette. Une aile doit partir du dos et
  // s'étaler : elle est donc bâtie comme un plan vertical collé au buste, dont
  // le bord supérieur monte par marches vers l'arrière.
  for (const side of [-1, 1] as const) {
    const z = side < 0 ? -4 : 3;
    for (let i = 0; i < 5; i += 1) {
      // `i` court vers l'ARRIÈRE (x décroissant) ; la plume est d'autant plus
      // haute qu'elle est proche du dos.
      const height = 8 - i;
      b.box(-1 - i, 10, z, 1, height, 2, 'highlight');
    }
  }

  // Bâton : hampe côté +z, halo en haut.
  b.box(1, 9, 6, 1, 12, 1, 'structure');
  b.box(0, 20, 5, 3, 2, 3, 'highlight');
}

/**
 * D.VA — la méca. Silhouette : un bloc trapu sur deux pattes courtes, deux
 * canons frontaux plus gros que les bras. Accessoire : le cockpit, une vitre
 * bleutée au centre du torse.
 *
 * Pas de pilote : à cette taille, une figurine dans une figurine devient une
 * bouillie. La méca seule est déjà la silhouette qu'on cite.
 */
function buildDva(b: SceneBuilder): void {
  pedestal(b, 7);
  // Pattes courtes et écartées, pieds larges.
  b.box(0, 2, -5, 4, 4, 3, 'accent');
  b.box(0, 2, 2, 4, 4, 3, 'accent');
  b.box(-1, 2, -6, 6, 2, 4, 'structure');
  b.box(-1, 2, 2, 6, 2, 4, 'structure');
  // Coque : large, basse, bombée à l'avant.
  b.box(-2, 6, -6, 7, 8, 12, 'accent');
  b.box(-3, 8, -4, 1, 5, 8, 'accent');
  // Cockpit : vitre bleutée, bien au centre.
  b.box(5, 9, -3, 1, 4, 6, 'highlight', { keepExisting: false });
  b.box(4, 13, -3, 2, 1, 6, 'structure', { keepExisting: false });
  // Les deux canons, portés en avant : ce sont eux qu'on dessine de mémoire.
  for (const z of [-8, 5] as const) {
    b.box(1, 8, z, 6, 4, 3, 'structure');
    b.box(7, 9, z, 2, 2, 3, 'accent');
    b.box(9, 9, z + 1, 1, 2, 1, 'highlight');
  }
}

/**
 * WINSTON — le gorille. Silhouette : torse énorme, bras plus longs que les
 * jambes, appui sur les poings. Accessoire : les lunettes, une barre lumineuse
 * en travers de la tête.
 */
function buildWinston(b: SceneBuilder): void {
  pedestal(b, 7);
  // Jambes courtes et repliées, presque cachées sous le torse.
  b.box(0, 2, -4, 3, 3, 3, 'structure');
  b.box(0, 2, 1, 3, 3, 3, 'structure');
  // Torse énorme, penché en avant.
  b.box(-1, 5, -5, 5, 8, 10, 'structure');
  b.box(3, 7, -3, 1, 5, 6, 'accent', { keepExisting: false });
  // Harnais d'armure sur les épaules.
  b.box(-1, 12, -6, 5, 2, 12, 'accent');
  // BRAS ÉPAIS, POSÉS AU SOL, ÉCARTÉS du corps. Au premier jet ils étaient
  // collés au torse et de même épaisseur que lui : la masse devenait un bloc
  // unique et l'appui sur les poings — ce qui fait le gorille — disparaissait.
  for (const z of [-8, 6] as const) {
    b.box(0, 5, z, 4, 8, 3, 'structure');
    // Poing : plus large que le bras, posé à plat sur le socle.
    b.box(-1, 2, z - 1, 6, 3, 5, 'structure');
    b.box(-1, 2, z - 1, 6, 1, 5, 'accent', { keepExisting: false });
  }
  // Tête basse, enfoncée dans les épaules — pas de cou.
  head(b, 13, -2, { visor: false });
  // Lunettes : une barre lumineuse en travers, le seul détail du visage.
  b.box(3, 15, -2, 1, 1, 4, 'highlight', { keepExisting: false });
  b.box(3, 15, -3, 1, 1, 1, 'accent', { keepExisting: false });
  b.box(3, 15, 2, 1, 1, 1, 'accent', { keepExisting: false });
}

/**
 * ROADHOG — la panse. Silhouette : le plus large du lot, tout en bas-ventre,
 * jambes minuscules. Accessoire : le masque à groin et le crochet.
 */
function buildRoadhog(b: SceneBuilder): void {
  pedestal(b, 8);
  b.box(0, 2, -4, 3, 3, 3, 'structure');
  b.box(0, 2, 1, 3, 3, 3, 'structure');
  // La panse : plus large que haute, débordant très au-delà des jambes.
  b.box(-2, 5, -8, 7, 9, 16, 'accent');
  // Bretelles croisées sur le ventre.
  b.box(4, 6, -6, 1, 7, 2, 'structure', { keepExisting: false });
  b.box(4, 6, 4, 1, 7, 2, 'structure', { keepExisting: false });
  // Bras courts et gros.
  b.box(0, 8, -10, 4, 5, 3, 'accent');
  b.box(0, 8, 7, 4, 5, 3, 'accent');
  head(b, 14, -2, { visor: false });
  // Masque : groin clair au centre, filtres de part et d'autre.
  b.box(4, 15, -1, 1, 2, 2, 'highlight');
  b.box(3, 15, -3, 1, 2, 1, 'structure', { keepExisting: false });
  b.box(3, 15, 2, 1, 2, 1, 'structure', { keepExisting: false });
  // Crochet : chaîne courte côté +z, pointe recourbée.
  b.box(1, 10, 11, 2, 2, 2, 'structure');
  b.box(1, 8, 12, 2, 3, 1, 'structure');
  b.box(1, 8, 10, 2, 1, 2, 'highlight');
}

/**
 * BASTION — le bloc mécanique. Silhouette : trapue, asymétrique, une grosse
 * pièce d'un côté. Accessoire : le canon, et l'oiseau perché sur l'épaule.
 */
function buildBastion(b: SceneBuilder): void {
  pedestal(b, 7);
  // Pied unique et large — il n'a pas deux jambes, c'est ce qui le fait lire.
  b.box(-1, 2, -4, 6, 4, 8, 'structure');
  b.box(-1, 2, -4, 6, 1, 8, 'accent', { keepExisting: false });
  // Caisse centrale, haute et étroite : elle doit rester plus petite que le
  // canon, sinon le canon n'est qu'un bras.
  b.box(0, 6, -3, 4, 9, 6, 'accent');
  b.box(3, 8, -2, 1, 5, 4, 'structure', { keepExisting: false });
  // LE CANON, ÉNORME ET DÉTACHÉ, porté côté -z. Premier jet : une pièce à peine
  // plus grosse que l'épaule, collée au corps — elle se lisait comme un bras
  // épais. Ici il fait le tiers du modèle, avec un fût qui dépasse franchement.
  b.box(-1, 7, -11, 6, 6, 6, 'structure');
  b.box(5, 8, -10, 4, 4, 4, 'structure');
  b.box(9, 9, -9, 3, 2, 2, 'accent');
  b.box(12, 9, -9, 1, 2, 2, 'highlight');
  // Épaule opposée, plus fine, pour l'asymétrie.
  b.box(0, 10, 4, 3, 4, 3, 'accent');
  head(b, 15, -2, { visor: true });
  // PAS D'OISEAU. Trois briques claires sur l'épaule : à cette taille, elles ne
  // formaient rien — ni oiseau, ni détail, juste un accident de couleur. Ce qui
  // est trop petit pour exister ne doit pas être posé.
}

/**
 * ZARYA — la carrure. Silhouette : épaules très larges, taille marquée, jambes
 * plantées. Accessoire : le canon à particules, tenu en travers.
 */
function buildZarya(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  b.box(-1, 8, -4, 5, 2, 8, 'structure');
  // Buste en V : large en haut, resserré à la taille.
  b.box(-1, 10, -6, 5, 6, 12, 'accent');
  b.box(0, 10, -4, 3, 3, 8, 'accent');
  b.box(3, 11, -4, 1, 4, 8, 'highlight', { keepExisting: false });
  // Bras épais.
  b.box(0, 11, -8, 3, 5, 2, 'accent');
  b.box(0, 11, 7, 3, 5, 2, 'accent');
  head(b, 16, -2, { cap: 'highlight', visor: false });
  // LE CANON PORTÉ DEBOUT, côté +z, et non plus en travers devant elle.
  // En travers, il croisait le torse de trois quarts : un bâton posé sur une
  // masse de la même couleur, que le regard lisait comme une arête du buste.
  // Debout et détaché, il a sa propre silhouette — c'est ce qui fait marcher le
  // marteau de Reinhardt.
  b.box(1, 8, 9, 3, 12, 3, 'structure');
  b.box(0, 17, 8, 5, 4, 5, 'structure');
  b.box(0, 20, 8, 5, 2, 5, 'highlight', { keepExisting: false });
  b.box(1, 6, 9, 3, 2, 3, 'accent');
}

/**
 * ORISA — le quadrupède. Silhouette : un corps porté par quatre pattes, plus
 * long que haut. Accessoire : le canon d'épaule et le cou dressé.
 */
function buildOrisa(b: SceneBuilder): void {
  pedestal(b, 8);
  // Quatre pattes : c'est la seule du lot à ne pas tenir sur deux jambes.
  for (const [x, z] of [
    [-3, -5],
    [-3, 3],
    [3, -5],
    [3, 3],
  ] as const) {
    b.box(x, 2, z, 2, 5, 2, 'structure');
    b.box(x, 2, z, 2, 1, 2, 'accent', { keepExisting: false });
  }
  // Corps allongé, porté haut.
  b.box(-4, 7, -5, 9, 5, 10, 'accent');
  b.box(-4, 7, -5, 9, 1, 10, 'structure', { keepExisting: false });
  // Cou dressé vers l'avant, tête haute.
  b.box(2, 12, -2, 3, 4, 4, 'accent');
  head(b, 16, -2, { visor: true });
  // Canon d'épaule côté +z.
  b.box(0, 12, 5, 3, 3, 4, 'structure');
  b.box(3, 13, 6, 3, 1, 2, 'highlight');
}

/**
 * Repeint les briques DÉJÀ POSÉES d'une boîte, sans jamais en créer.
 *
 * Sert aux surfaces courbes : poser un cadre au `box` sur une sphère ajoute un
 * pavé qui déborde de la courbure et se lit comme une dalle collée dessus
 * (essayé sur la verrière de Wrecking Ball, tranché net).
 */
function paint(
  b: SceneBuilder,
  x0: number,
  y0: number,
  z0: number,
  w: number,
  h: number,
  d: number,
  role: BrickRole
): void {
  for (let x = x0; x < x0 + w; x += 1) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let z = z0; z < z0 + d; z += 1) {
        if (b.has(x, y, z)) b.place(x, y, z, role, { keepExisting: false });
      }
    }
  }
}

/**
 * DOOMFIST — le gantelet. Silhouette : carrure d'armoire, et un bras droit
 * démesuré qui descend jusqu'au socle. Accessoire : le poing, posé bas, deux
 * fois plus large que le bras qui le porte.
 */
function buildDoomfist(b: SceneBuilder): void {
  pedestal(b, 8);
  b.box(0, 2, -3, 4, 5, 3, 'structure');
  b.box(0, 2, 1, 4, 5, 3, 'structure');
  b.box(-1, 2, -4, 6, 2, 4, 'structure');
  b.box(-1, 2, 1, 6, 2, 4, 'structure');
  // Ceinturon doré, seule ligne claire du bas du corps.
  b.box(-1, 7, -4, 5, 1, 8, 'accent');
  // Torse large, plastron doré sur la face avant.
  b.box(-1, 8, -5, 5, 7, 10, 'structure');
  b.box(3, 9, -3, 1, 5, 6, 'accent', { keepExisting: false });
  b.box(-1, 13, 5, 5, 3, 3, 'accent');
  head(b, 15, -2, { visor: true });
  // LE GANTELET. Premier jet : un cube d'or à hauteur d'épaule, séparé du bras
  // par un vide — il flottait, et se lisait comme une caisse posée derrière lui.
  // Le bras DESCEND maintenant sans rupture de l'épaule jusqu'au sol, et le
  // poing repose sur le socle : c'est l'appui au sol qui lui donne son poids,
  // exactement comme les poings de Winston.
  b.box(0, 7, -8, 4, 7, 3, 'accent');
  b.box(-2, 2, -12, 7, 6, 6, 'accent');
  // Jointures : trois bosses en saillie sur la face avant, pas un liseré plaqué.
  for (const z of [-12, -10, -8] as const) {
    b.box(5, 5, z, 2, 2, 2, 'highlight');
  }
  b.box(-2, 2, -12, 7, 1, 6, 'highlight', { keepExisting: false });
  // Bras gauche court, pour que l'asymétrie se voie.
  b.box(0, 9, 6, 3, 4, 3, 'structure');
}

/**
 * JUNKER QUEEN — la crinière et la hache. Silhouette : épaules de ferraille,
 * crête blonde qui prolonge la tête vers le haut. Accessoire : la hache, plantée
 * debout côté +z, lame large.
 */
function buildJunkerqueen(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 4, 6, 3, 'structure');
  b.box(0, 2, 1, 4, 6, 3, 'structure');
  b.box(-1, 8, -5, 5, 6, 10, 'accent');
  b.box(3, 9, -3, 1, 4, 6, 'structure', { keepExisting: false });
  // Une seule épaulière, énorme : la ferraille est asymétrique.
  b.box(-2, 12, -9, 6, 5, 4, 'accent');
  b.box(-2, 16, -9, 6, 1, 4, 'structure', { keepExisting: false });
  b.box(0, 12, 6, 3, 4, 3, 'structure');
  head(b, 14, -2, { visor: false });
  // Crinière : une masse blonde qui déborde la tête, plus une crête au sommet.
  b.box(-1, 14, -3, 4, 4, 6, 'highlight');
  b.box(0, 18, -2, 3, 2, 4, 'highlight');
  b.box(-3, 12, -2, 2, 6, 4, 'highlight');
  // LA HACHE. Premier jet : une lame large en z, de part et d'autre du manche —
  // vue de trois quarts elle formait un bloc carré, et l'ensemble se lisait
  // comme une torche. La lame est maintenant une PLAQUE MINCE EN z, étendue en
  // x : sa grande face est tournée vers la caméra et donne le profil de hache.
  // La lame est en ACIER CLAIR et le manche sombre : au deuxième jet les deux
  // étaient de la même teinte et la hache entière se lisait comme une planche.
  b.box(1, 2, 12, 2, 18, 2, 'structure');
  b.box(3, 11, 12, 6, 9, 2, 'accent');
  b.box(8, 12, 12, 1, 7, 2, 'highlight');
  b.box(3, 19, 12, 6, 1, 2, 'highlight');
  // Tranchant en croissant : un rectangle plein se lisait comme une pancarte.
  b.carveBox(7, 11, 12, 2, 2, 2);
  b.carveBox(3, 11, 12, 2, 1, 2);
  b.carveBox(8, 19, 12, 1, 1, 2);
}

/**
 * MAUGA — la masse et les deux canons. Silhouette : le plus haut ET le plus
 * large du lot, poitrine bombée qui déborde des jambes. Accessoire : les deux
 * mitrailleuses, portées en avant comme celles de D.Va.
 */
function buildMauga(b: SceneBuilder): void {
  pedestal(b, 8);
  // Pantalon rouge : le rouge doit tenir le BAS, sinon la peau brune mange tout.
  b.box(0, 2, -5, 4, 5, 4, 'accent');
  b.box(0, 2, 2, 4, 5, 4, 'accent');
  b.box(-1, 2, -6, 6, 2, 5, 'structure');
  b.box(-1, 2, 2, 6, 2, 5, 'structure');
  // Poitrine énorme mais RESSERRÉE : au premier jet elle faisait 16 de large et
  // les canons, collés à ses flancs, n'étaient plus que deux bosses.
  b.box(-2, 7, -6, 7, 8, 13, 'structure');
  b.box(-2, 13, -6, 7, 2, 13, 'accent');
  b.box(3, 8, -4, 1, 5, 2, 'accent', { keepExisting: false });
  b.box(3, 8, 3, 1, 5, 2, 'accent', { keepExisting: false });
  head(b, 15, -2, { cap: 'accent', visor: false });
  // Les deux canons, DÉTACHÉS de la poitrine et portés loin en avant.
  // Canons ROUGES : en gris-brun ils avaient la teinte du torse et se
  // rabattaient dessus ; le rouge les découpe sur la masse de peau.
  for (const z of [-10, 8] as const) {
    b.box(0, 8, z, 4, 5, 3, 'structure');
    b.box(4, 8, z, 8, 4, 3, 'accent');
    b.box(4, 8, z, 8, 1, 3, 'structure', { keepExisting: false });
    b.box(12, 9, z + 1, 1, 2, 1, 'highlight');
  }
}

/**
 * RAMATTRA — l'omniaque cornu. Silhouette : carrure de Nemesis, tête prolongée
 * par deux cornes qui montent vers l'arrière. Accessoire : le bâton, debout
 * côté +z, pointe lumineuse.
 */
function buildRamattra(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 4, 6, 3, 'structure');
  b.box(0, 2, 1, 4, 6, 3, 'structure');
  b.box(-1, 8, -6, 5, 7, 12, 'accent');
  // Noyau lumineux au centre de la poitrine, en saillie.
  b.box(4, 10, -2, 2, 3, 4, 'accent');
  b.box(6, 11, -1, 1, 1, 2, 'highlight');
  // Épaulières pointues, plus hautes que la tête des épaules.
  b.box(-1, 14, -9, 5, 4, 4, 'accent');
  b.box(-1, 14, 5, 5, 4, 4, 'accent');
  b.box(-1, 17, -9, 5, 2, 2, 'structure');
  b.box(-1, 17, 7, 5, 2, 2, 'structure');
  // Bras longs, écartés, qui descendent le long du corps.
  b.box(0, 8, -9, 3, 6, 3, 'structure');
  b.box(0, 8, 7, 3, 6, 3, 'structure');
  head(b, 16, -2, { visor: true });
  // CORNES : deux arêtes qui montent et partent vers l'arrière — c'est elles
  // qui distinguent l'omniaque d'un tank en armure quelconque.
  for (const z of [-2, 3] as const) {
    b.box(1, 19, z, 3, 3, 1, 'accent');
    b.box(-1, 21, z, 3, 2, 1, 'accent');
    b.box(-3, 22, z, 3, 2, 1, 'accent');
  }
  // Le bâton.
  b.box(1, 6, 9, 2, 15, 2, 'structure');
  b.box(0, 21, 8, 4, 3, 4, 'accent');
  b.box(0, 24, 8, 4, 2, 4, 'highlight');
}

/**
 * WRECKING BALL — la boule. Silhouette : une sphère qui fait tout le modèle,
 * posée sur quatre pattes courtes. Accessoire : aucun — la boule EST
 * l'accessoire, et rien d'autre ne doit venir la parasiter.
 *
 * Pas de hamster : une figurine dans une figurine, à cette taille, c'est la
 * même bouillie que le pilote de D.Va.
 */
function buildWreckingball(b: SceneBuilder): void {
  pedestal(b, 8);
  // Quatre pattes trapues, griffes au sol.
  for (const [x, z] of [
    [-4, -6],
    [-4, 4],
    [2, -6],
    [2, 4],
  ] as const) {
    b.box(x, 2, z, 2, 5, 2, 'structure');
    b.box(x - 1, 2, z - 1, 4, 2, 4, 'structure');
  }
  // La sphère : empilement de disques, rayon en cosinus.
  const cy = 13;
  for (let y = 6; y <= 20; y += 1) {
    const dy = (y - cy) / 7.5;
    const r = 7.5 * Math.sqrt(Math.max(0, 1 - dy * dy));
    if (r < 0.9) continue;
    b.disc(0, 0, r, y, 1, 'accent');
  }
  // Calottes de blindage sombre en haut et en bas : deux BANDES FRANCHES.
  // Premier jet : un anneau à l'équateur, recalculé à chaque étage — la
  // discrétisation en faisait un damier moucheté sur toute la boule.
  for (let y = 6; y <= 8; y += 1) {
    const dy = (y - cy) / 7.5;
    const r = 7.5 * Math.sqrt(Math.max(0, 1 - dy * dy));
    if (r >= 0.9) b.disc(0, 0, r, y, 1, 'structure', { keepExisting: false });
  }
  for (let y = 19; y <= 20; y += 1) {
    const dy = (y - cy) / 7.5;
    const r = 7.5 * Math.sqrt(Math.max(0, 1 - dy * dy));
    if (r >= 0.9) b.disc(0, 0, r, y, 1, 'structure', { keepExisting: false });
  }
  // Verrière PEINTE sur la sphère, jamais posée dessus : au premier jet le
  // cadre était une boîte, qui débordait de la courbure et découpait une dalle
  // grise sur tout le flanc.
  paint(b, 5, 10, -4, 4, 7, 8, 'structure');
  paint(b, 5, 11, -3, 4, 5, 6, 'highlight');
}

/**
 * SIGMA — celui qui flotte. Silhouette : un VIDE entre le socle et lui, pieds
 * qui pendent. Accessoire : le bloc de roche en lévitation à sa gauche.
 *
 * Le vide est tout le personnage : c'est la seule figurine du lot qui ne touche
 * pas son socle, et ça se voit avant la couleur.
 */
function buildSigma(b: SceneBuilder): void {
  pedestal(b, 6);
  // Jambes pendantes, repliées, qui commencent en l'air.
  b.box(0, 6, -4, 3, 5, 3, 'structure');
  b.box(0, 6, 1, 3, 5, 3, 'structure');
  b.box(1, 6, -4, 3, 2, 3, 'accent', { keepExisting: false });
  b.box(1, 6, 1, 3, 2, 3, 'accent', { keepExisting: false });
  // Torse voûté, épaules remontées jusqu'aux oreilles.
  b.box(-1, 11, -5, 5, 6, 10, 'accent');
  b.box(3, 12, -3, 1, 4, 6, 'structure', { keepExisting: false });
  b.box(-1, 16, -6, 5, 3, 12, 'structure');
  // Bras écartés du buste, mains ouvertes vers le bas.
  b.box(0, 11, -8, 3, 6, 3, 'accent');
  b.box(0, 11, 6, 3, 6, 3, 'accent');
  head(b, 18, -2, { visor: false });
  // Anneau de gravité sur la poitrine, en saillie.
  b.box(4, 13, -2, 2, 3, 4, 'accent');
  b.box(6, 14, -1, 1, 1, 2, 'highlight');
  // LE BLOC DE ROCHE, en lévitation côté +z, bien détaché du corps.
  for (let y = 12; y <= 18; y += 1) {
    const dy = (y - 15) / 3.6;
    const r = 3.6 * Math.sqrt(Math.max(0, 1 - dy * dy));
    if (r >= 0.9) b.disc(1, 13, r, y, 1, 'structure');
  }
  b.box(3, 14, 11, 2, 2, 2, 'highlight');
  b.box(-1, 16, 13, 2, 2, 2, 'highlight');
}

/**
 * HAZARD — la carapace hérissée. Silhouette : penché en avant, trois pointes
 * dressées dans le dos. Accessoire : la griffe, un bloc fendu porté bas.
 */
function buildHazard(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 4, 5, 3, 'structure');
  b.box(0, 2, 1, 4, 5, 3, 'structure');
  b.box(-1, 2, -5, 6, 2, 4, 'structure');
  b.box(-1, 2, 1, 6, 2, 4, 'structure');
  // Torse penché : plus épais en haut qu'en bas, l'avant qui plonge.
  b.box(-1, 7, -5, 5, 7, 10, 'accent');
  b.box(4, 9, -4, 2, 4, 8, 'accent');
  b.box(6, 10, -2, 1, 2, 4, 'highlight');
  b.box(-1, 13, -7, 5, 3, 14, 'structure');
  head(b, 15, -1, { visor: true });
  // TROIS POINTES DANS LE DOS, côté -x : c'est la seule silhouette du lot qui
  // dépasse vers l'arrière, et c'est ce qui la distingue des autres tanks.
  for (const [z, h] of [
    [-5, 5],
    [-1, 7],
    [3, 5],
  ] as const) {
    b.box(-3, 12, z, 2, h, 2, 'accent');
    b.box(-3, 12 + h, z, 2, 2, 2, 'highlight');
  }
  // LA GRIFFE : un bloc fendu en trois, porté bas côté -z.
  b.box(0, 9, -9, 4, 4, 3, 'structure');
  b.box(-1, 4, -12, 5, 5, 4, 'accent');
  // Trois doigts SÉPARÉS : au premier jet, deux lames d'une brique d'épaisseur
  // formaient une barre verte continue, sans aucune fente lisible.
  for (const z of [-12, -10, -8] as const) {
    b.box(3, 4, z, 4, 3, 1, 'highlight');
  }
  b.box(0, 9, 7, 3, 4, 3, 'structure');
}

/**
 * ASHE — le manteau et la crinière blanche. Silhouette : longue veste évasée,
 * masse de cheveux clairs qui double la tête. Accessoire : la carabine, debout
 * côté +z, crosse au sol.
 */
function buildAshe(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -3, 3, 5, 3, 'structure');
  b.box(0, 2, 1, 3, 5, 3, 'structure');
  // Manteau : il descend plus bas que les hanches et s'évase.
  b.box(-1, 5, -5, 5, 5, 10, 'accent');
  b.box(-1, 10, -4, 5, 5, 8, 'accent');
  // Gilet rouge entrouvert sur la face avant.
  b.box(3, 10, -2, 1, 5, 4, 'structure', { keepExisting: false });
  b.box(0, 11, -7, 3, 4, 3, 'accent');
  b.box(0, 11, 5, 3, 4, 3, 'accent');
  head(b, 15, -2, { visor: false });
  // La chevelure : une masse claire au-dessus et DERRIÈRE la tête. Au premier
  // jet elle enveloppait aussi la face : la tête devenait un cube blanc plein,
  // qui se lisait comme un casque et non comme une coiffure.
  b.box(-1, 18, -3, 5, 3, 6, 'highlight');
  b.box(-2, 13, -2, 2, 6, 4, 'highlight');
  b.box(-1, 15, -3, 4, 3, 1, 'highlight');
  b.box(-1, 15, 2, 4, 3, 1, 'highlight');
  // LA CARABINE, debout côté +z, crosse posée : le canon seul serait un trait.
  b.box(1, 2, 8, 2, 16, 2, 'accent');
  b.box(0, 2, 7, 4, 4, 3, 'accent');
  b.box(1, 12, 7, 2, 2, 4, 'highlight');
}

/**
 * CASSIDY — le chapeau. Silhouette : un bord de chapeau plus large que les
 * épaules, qui fait ombre sur tout le personnage. Accessoire : ce chapeau, et
 * rien d'autre — aucun autre héros n'a ce disque au-dessus de la tête.
 */
function buildCassidy(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 4, 5, 3, 'structure');
  b.box(0, 2, 1, 4, 5, 3, 'structure');
  // Ceinturon large, boucle claire au centre.
  b.box(-1, 7, -4, 5, 2, 8, 'structure');
  b.box(4, 7, -1, 1, 2, 2, 'highlight');
  // Serape rouge sur une épaule, tombant en biais.
  b.box(-1, 9, -5, 5, 6, 10, 'accent');
  b.box(-1, 9, -6, 5, 4, 2, 'accent');
  b.box(0, 10, -8, 3, 5, 3, 'structure');
  b.box(0, 10, 6, 3, 5, 3, 'structure');
  head(b, 15, -2, { visor: false });
  // LE CHAPEAU : bord de 7 × 8, très au-delà des épaules, puis la calotte.
  b.box(-2, 19, -5, 7, 1, 9, 'highlight');
  b.box(-1, 19, -4, 5, 1, 7, 'highlight');
  b.box(0, 20, -2, 4, 2, 4, 'highlight');
  b.box(0, 20, -2, 4, 1, 4, 'structure', { keepExisting: false });
}

/**
 * REAPER — le manteau et le masque. Silhouette : un cône noir sans jambes, très
 * large en bas, capuche englobante. Accessoire : le masque d'os, seule tache
 * claire du modèle.
 */
function buildReaper(b: SceneBuilder): void {
  pedestal(b, 7);
  // Manteau en trois gradins : pas de jambes, la robe touche le socle.
  b.box(-2, 2, -7, 7, 4, 14, 'accent');
  b.box(-1, 6, -6, 5, 4, 12, 'accent');
  b.box(-1, 10, -5, 5, 5, 10, 'accent');
  // Bandoulières claires croisées sur la poitrine, en saillie d'une brique.
  b.box(4, 11, -3, 1, 4, 2, 'highlight');
  b.box(4, 11, 1, 1, 4, 2, 'highlight');
  // Épaulières à pointes, très larges : elles portent la silhouette en haut.
  for (const z of [-8, 5] as const) {
    b.box(-1, 13, z, 5, 3, 3, 'structure');
    b.box(0, 16, z, 3, 2, 2, 'structure');
    b.box(0, 18, z, 2, 2, 2, 'accent');
  }
  head(b, 15, -2, { visor: false });
  // Capuche : elle enveloppe la tête sans l'effacer (les cases de la tête sont
  // déjà prises, et `keepExisting` les protège).
  b.box(-1, 15, -3, 5, 5, 6, 'accent');
  b.carveBox(4, 16, -2, 1, 3, 4);
  // LE MASQUE, sur la face avant.
  b.box(3, 16, -2, 1, 3, 4, 'highlight', { keepExisting: false });
  b.box(3, 17, -1, 1, 1, 2, 'accent', { keepExisting: false });
}

/**
 * ECHO — la porcelaine en vol. Silhouette : blanche, sans jambes, en lévitation
 * au-dessus du socle, quatre plumes de métal en éventail dans le dos.
 * Accessoire : le visage violet, seule couleur du modèle.
 */
function buildEcho(b: SceneBuilder): void {
  pedestal(b, 6);
  // Queue effilée : elle remplace les jambes et dit « ça vole ».
  b.box(0, 5, -2, 3, 3, 4, 'accent');
  b.box(-1, 8, -3, 5, 4, 6, 'accent');
  // Corps court et large. Deux reprises pour en arriver là : filiforme au
  // premier jet, puis noyé sous un éventail d'ailes en escalier qui se lisait
  // comme des bois de cerf. Les ailes s'écartent maintenant à plat.
  b.box(-2, 12, -4, 6, 6, 8, 'accent');
  b.box(-2, 16, -5, 6, 2, 10, 'accent');
  for (const z of [-10, 5] as const) {
    b.box(-3, 13, z, 5, 4, 5, 'accent');
    b.box(-4, 15, z, 4, 2, 5, 'structure');
  }
  head(b, 18, -2, { visor: false });
  b.box(3, 18, -2, 1, 3, 4, 'highlight', { keepExisting: false });
  b.box(4, 13, -2, 2, 3, 4, 'highlight');
  b.box(-2, 22, -3, 6, 1, 6, 'structure');
}

/**
 * GENJI — le cyborg vert. Silhouette : corps de métal sombre, plaques vertes,
 * visière pleine. Accessoire : le sabre, debout côté +z, tranchant clair.
 */
function buildGenji(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 3, 5, 3, 'structure');
  b.box(0, 2, 1, 3, 5, 3, 'structure');
  b.box(0, 2, -4, 3, 1, 3, 'accent', { keepExisting: false });
  b.box(0, 2, 1, 3, 1, 3, 'accent', { keepExisting: false });
  // Torse : carapace verte par-dessus un châssis sombre.
  b.box(-1, 7, -4, 5, 7, 8, 'structure');
  b.box(3, 8, -3, 1, 5, 6, 'accent', { keepExisting: false });
  b.box(-1, 12, -5, 5, 2, 10, 'accent');
  // Bras écartés, plaques vertes aux épaules.
  b.box(0, 8, -7, 3, 5, 3, 'structure');
  b.box(0, 8, 5, 3, 5, 3, 'structure');
  b.box(-1, 11, -7, 5, 3, 3, 'accent');
  b.box(-1, 11, 5, 5, 3, 3, 'accent');
  head(b, 14, -2, { cap: 'accent', visor: true });
  // LE SABRE : lame debout côté +z, garde marquée, pointe claire. Une lame
  // d'une seule brique d'épaisseur disparaîtrait : elle en fait deux.
  b.box(1, 6, 8, 2, 4, 2, 'structure');
  b.box(0, 10, 8, 4, 2, 2, 'accent');
  b.box(1, 12, 8, 2, 9, 2, 'structure');
  b.box(3, 12, 8, 1, 9, 2, 'highlight');
}

/**
 * HANZO — l'arc. Silhouette : bras et épaule nus d'un côté, kimono de l'autre.
 * Accessoire : l'arc, un grand arc de cercle debout côté +z — la seule courbe
 * du lot, et c'est elle qui le nomme.
 */
function buildHanzo(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 4, 6, 3, 'accent');
  b.box(0, 2, 1, 4, 6, 3, 'accent');
  // Torse bleu, et UNE épaule nue : l'asymétrie est tout le costume.
  b.box(-1, 8, -5, 5, 6, 10, 'accent');
  b.box(0, 9, -8, 3, 6, 3, 'highlight');
  b.box(-1, 12, -8, 5, 2, 3, 'highlight');
  b.box(0, 9, 6, 3, 5, 3, 'accent');
  b.box(3, 9, -4, 1, 4, 3, 'highlight', { keepExisting: false });
  head(b, 14, -2, { visor: false });
  b.box(0, 14, -2, 4, 4, 4, 'highlight', { keepExisting: false });
  // Chignon sombre, en arrière.
  b.box(-1, 17, -1, 3, 2, 2, 'structure');
  b.box(0, 18, -1, 3, 2, 2, 'structure');
  b.box(-1, 14, -1, 1, 4, 2, 'structure', { keepExisting: false });
  // L'ARC. Il est en LAQUE SOMBRE : au premier jet il avait la teinte de la
  // peau, et le bras nu qui le tient le mangeait entièrement.
  const cx = -5;
  const cy = 12;
  const radius = 10;
  for (let t = -78; t <= 78; t += 4) {
    const a = (t * Math.PI) / 180;
    const x = Math.round(cx + radius * Math.cos(a));
    const y = Math.round(cy + radius * Math.sin(a));
    b.box(x, y, 9, 2, 2, 3, 'structure');
  }
  // La corde ferme le « C ». Elle relie les POINTES, côté -x : posée du côté
  // du ventre de l'arc (l'erreur du premier jet), elle doublait la courbe au
  // lieu de la fermer, et l'ensemble se lisait comme un bâton tordu.
  for (let y = 4; y <= 20; y += 1) b.box(-3, y, 9, 1, 1, 2, 'structure');
}

/**
 * JUNKRAT — le pneu. Silhouette : voûtée, une jambe de bois, tignasse en
 * pointes. Accessoire : le pneu, un anneau debout posé à côté de lui — c'est la
 * seule forme creuse du lot.
 */
function buildJunkrat(b: SceneBuilder): void {
  pedestal(b, 7);
  // Une jambe pleine, une jambe de bois : l'asymétrie fait le personnage.
  b.box(0, 2, -4, 4, 5, 3, 'structure');
  b.box(1, 2, 2, 2, 5, 2, 'accent');
  b.box(0, 2, 1, 4, 2, 4, 'accent');
  // Torse voûté, épaules en avant, pas de haut : la peau est le vêtement.
  b.box(-1, 7, -4, 5, 6, 8, 'structure');
  b.box(3, 8, -3, 1, 4, 6, 'accent', { keepExisting: false });
  b.box(0, 11, -7, 3, 4, 3, 'structure');
  b.box(0, 11, 5, 3, 4, 3, 'structure');
  head(b, 13, -2, { visor: false });
  // Tignasse : trois pointes jaunes, hautes, vers l'arrière.
  b.box(-1, 16, -2, 4, 2, 4, 'accent');
  b.box(0, 18, -1, 2, 2, 2, 'accent');
  b.box(-2, 17, -1, 2, 3, 2, 'highlight');
  // LE PNEU : un anneau vertical, bâti case par case dans le plan (x, y).
  const tireY = 9;
  for (let x = -7; x <= 7; x += 1) {
    for (let y = 1; y <= 17; y += 1) {
      const d = Math.hypot(x - 0, y - tireY);
      if (d > 6.5 || d < 4.2) continue;
      b.box(x, y, 9, 1, 1, 3, 'structure');
    }
  }
  for (let x = -7; x <= 7; x += 1) {
    for (let y = 1; y <= 17; y += 1) {
      const d = Math.hypot(x - 0, y - tireY);
      if (d > 6.5 || d < 5.6) continue;
      b.box(x, y, 9, 1, 1, 3, 'accent', { keepExisting: false });
    }
  }
}

/**
 * MEI — la parka ronde. Silhouette : un tonneau, la plus ronde du lot, capuche
 * bordée de fourrure. Accessoire : le blaster, porté en avant côté -z, embout
 * de glace.
 */
function buildMei(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -3, 3, 3, 3, 'structure');
  b.box(0, 2, 1, 3, 3, 3, 'structure');
  // La parka : un tonneau qui part large en bas et reste large en haut.
  for (let y = 4; y <= 14; y += 1) {
    const r = y <= 5 ? 5.4 : y >= 13 ? 4.4 : 5.8;
    b.disc(1, 0, r, y, 1, 'accent');
  }
  // Ourlet et poches de fourrure.
  b.ring(1, 0, 5.6, 1.4, 4, 1, 'structure', { keepExisting: false });
  b.box(5, 8, -3, 2, 4, 6, 'accent');
  b.box(7, 9, -2, 1, 2, 4, 'highlight');
  head(b, 15, -2, { visor: false });
  // Capuche : un col de fourrure qui DÉBORDE la tête tout autour.
  b.ring(1, 0, 4.2, 1.6, 15, 2, 'structure');
  b.box(-1, 19, -3, 5, 2, 6, 'accent');
  // Lunettes : un bandeau clair large, sur la face avant.
  b.box(3, 16, -2, 1, 1, 4, 'highlight', { keepExisting: false });
  // LE BLASTER, porté en avant côté -z, embout clair.
  b.box(0, 8, -9, 4, 4, 3, 'structure');
  b.box(4, 8, -9, 5, 3, 3, 'accent');
  b.box(9, 8, -9, 3, 3, 3, 'highlight');
}

/**
 * VENTURE — la foreuse. Silhouette : la plus courte du lot sur deux jambes, sac
 * à dos qui déborde derrière. Accessoire : la foreuse, un cône qui pointe loin
 * devant et fait presque la moitié de la largeur du modèle.
 */
function buildVenture(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 4, 4, 3, 'structure');
  b.box(0, 2, 1, 4, 4, 3, 'structure');
  b.box(-1, 6, -5, 5, 6, 10, 'accent');
  // Sac à dos côté -x : il pousse la silhouette vers l'arrière.
  b.box(-4, 7, -4, 3, 6, 8, 'structure');
  b.box(-4, 11, -4, 3, 1, 8, 'accent', { keepExisting: false });
  b.box(-1, 12, -5, 5, 1, 10, 'highlight');
  head(b, 13, -2, { visor: true });
  b.box(-1, 16, -3, 5, 2, 6, 'structure');
  b.box(0, 8, 6, 3, 4, 3, 'accent');
  // LA FOREUSE : quatre étages qui se resserrent, portés loin en avant.
  b.box(0, 7, -9, 4, 4, 3, 'accent');
  b.box(4, 6, -11, 3, 6, 7, 'structure');
  b.box(7, 7, -10, 3, 4, 5, 'highlight');
  b.box(10, 8, -9, 2, 2, 3, 'highlight');
  b.box(12, 8, -8, 1, 2, 1, 'structure');
}

/**
 * VENDETTA — L'INCONNUE DU LOT. Aucune référence n'était consultable au moment
 * de la sculpture : ce modèle est une SUPPOSITION (silhouette encapuchonnée,
 * cape cramoisie sur une épaule, arbalète en travers), à refaire dès qu'une
 * image du personnage sera disponible. Il est bâti pour ne pas se confondre
 * avec Reaper : deux jambes visibles, cramoisi plutôt que noir, et une arme en
 * croix plutôt qu'un masque.
 */
function buildVendetta(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  b.box(-1, 8, -5, 5, 6, 10, 'structure');
  // Cape cramoisie sur UNE épaule seulement : l'asymétrie est la signature.
  b.box(-2, 9, 3, 6, 8, 4, 'accent');
  b.box(-1, 14, -6, 5, 3, 12, 'accent');
  b.box(0, 9, -8, 3, 5, 3, 'structure');
  head(b, 16, -2, { visor: true });
  b.box(-1, 16, -3, 5, 5, 6, 'accent');
  b.carveBox(3, 17, -2, 1, 3, 4);
  // L'ARBALÈTE : une croix portée à plat devant, côté -z. La barre des branches
  // traverse toute la largeur, sinon l'arme se lit comme un avant-bras.
  // L'ARME : une faux debout côté -z. Deux essais d'arbalète (barre en travers,
  // puis branches en V) ont donné la même chose — une planche claire posée en
  // diagonale, sans rien qui dise « arme ». Une hampe verticale et une lame
  // large, c'est le seul agencement que ce moteur rend sans ambiguïté.
  b.box(0, 10, -9, 4, 4, 3, 'structure');
  b.box(1, 3, -11, 2, 17, 2, 'structure');
  b.box(3, 14, -11, 6, 6, 2, 'highlight');
  b.box(3, 19, -11, 6, 1, 2, 'structure');
  b.carveBox(7, 14, -11, 2, 2, 2);
}

/**
 * PHARAH — le réacteur dorsal. Silhouette : une armure bleue lestée d'un bloc
 * derrière, avec deux tuyères sous les reins. Accessoire : le lance-roquettes
 * d'épaule, côté +z.
 */
function buildPharah(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 4, 5, 3, 'accent');
  b.box(0, 2, 1, 4, 5, 3, 'accent');
  b.box(-1, 2, -5, 6, 2, 4, 'structure');
  b.box(-1, 2, 1, 6, 2, 4, 'structure');
  b.box(-1, 7, -5, 5, 7, 10, 'accent');
  // L'œil d'Horus, doré, en saillie sur la poitrine.
  b.box(3, 9, -2, 2, 4, 4, 'accent');
  b.box(5, 10, -1, 1, 2, 2, 'highlight');
  b.box(-1, 13, -8, 5, 3, 4, 'accent');
  b.box(-1, 13, 5, 5, 3, 4, 'accent');
  // LE RÉACTEUR : un bloc derrière, deux ailerons, deux tuyères qui crachent
  // vers le bas — c'est lui qui distingue Pharah de tout autre soldat blindé.
  b.box(-5, 8, -4, 4, 8, 8, 'structure');
  b.box(-7, 10, -7, 2, 6, 3, 'structure');
  b.box(-7, 10, 4, 2, 6, 3, 'structure');
  b.box(-5, 5, -4, 4, 3, 3, 'structure');
  b.box(-5, 5, 1, 4, 3, 3, 'structure');
  b.box(-5, 5, -4, 4, 1, 3, 'highlight', { keepExisting: false });
  b.box(-5, 5, 1, 4, 1, 3, 'highlight', { keepExisting: false });
  head(b, 16, -2, { cap: 'accent', visor: true });
  // Le lance-roquettes, posé sur l'épaule OPPOSÉE au réacteur et en bleu : du
  // même côté et de la même teinte grise que les ailerons, il se fondait dedans
  // et la figurine n'avait plus qu'un gros bloc gris derrière elle.
  b.box(0, 13, -11, 4, 4, 4, 'accent');
  b.box(4, 14, -10, 6, 3, 3, 'accent');
  b.box(10, 14, -10, 1, 3, 3, 'highlight');
}

/**
 * SOJOURN — les jambes de métal. Silhouette : le genou qui part en arrière,
 * seule du lot à ne pas avoir de tibias droits. Accessoire : le railgun, porté
 * devant, avec sa ligne d'énergie.
 */
function buildSojourn(b: SceneBuilder): void {
  pedestal(b, 6);
  // Jambes cybernétiques : le pied part en avant, le tibia repart en arrière.
  for (const z of [-4, 1] as const) {
    b.box(2, 2, z, 3, 2, 3, 'structure');
    b.box(-1, 4, z, 3, 4, 3, 'structure');
    b.box(1, 8, z, 3, 3, 3, 'structure');
  }
  // Veste rouge à longs pans, fendue dans le dos.
  b.box(-1, 11, -5, 5, 6, 10, 'accent');
  b.box(-3, 6, -5, 2, 6, 3, 'accent');
  b.box(-3, 6, 2, 2, 6, 3, 'accent');
  b.box(3, 12, -2, 1, 4, 4, 'structure', { keepExisting: false });
  b.box(-1, 15, -7, 5, 3, 14, 'accent');
  b.box(0, 11, 7, 3, 5, 3, 'structure');
  head(b, 18, -2, { visor: true });
  // LE RAILGUN. Premier jet : tenu EN TRAVERS du torse, rail lumineux vers le
  // haut — une dalle bleue posée à plat sur le buste, qui effaçait le corps.
  // C'est très exactement l'erreur du canon de Zarya. Il est maintenant porté
  // en avant, hors du buste, côté -z.
  b.box(0, 11, -9, 4, 4, 3, 'structure');
  b.box(3, 11, -11, 9, 4, 4, 'structure');
  b.box(3, 14, -11, 9, 1, 4, 'accent', { keepExisting: false });
  b.box(12, 12, -10, 2, 2, 2, 'highlight');
}

/**
 * SOLDIER : 76 — la visière. Silhouette : soldat carré, blouson bleu, arme
 * lourde tenue à l'horizontale. Accessoire : le bandeau rouge en travers du
 * visage, qui se voit avant tout le reste.
 */
function buildSoldier76(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 4, 6, 3, 'structure');
  b.box(0, 2, 1, 4, 6, 3, 'structure');
  b.box(-1, 2, -5, 6, 2, 4, 'structure');
  b.box(-1, 2, 1, 6, 2, 4, 'structure');
  // Blouson bleu, col haut, épaules carrées.
  b.box(-1, 8, -5, 5, 7, 10, 'accent');
  b.box(-1, 14, -6, 5, 2, 12, 'accent');
  b.box(3, 9, -1, 1, 5, 2, 'structure', { keepExisting: false });
  b.box(0, 9, 6, 3, 5, 3, 'accent');
  head(b, 16, -2, { visor: false });
  // LA VISIÈRE : un bandeau rouge qui fait toute la largeur du visage et
  // déborde sur les côtés. Plaqué à ras, il ne prenait aucune ombre.
  b.box(3, 17, -3, 2, 2, 6, 'highlight');
  b.box(-1, 19, -3, 5, 2, 6, 'structure');
  // Le fusil, tenu à l'horizontale devant lui, côté -z.
  b.box(0, 9, -8, 4, 4, 3, 'structure');
  b.box(2, 9, -9, 3, 3, 3, 'structure');
  b.box(5, 10, -9, 7, 3, 3, 'accent');
  b.box(12, 10, -8, 1, 2, 1, 'highlight');
}

/**
 * SOMBRA — la coiffure. DEUXIÈME REPRISE.
 *
 * Premier jet : un bloc violet sur un bloc noir, rien qui la nomme. Deuxième :
 * je l'ai faite ACCROUPIE pour qu'elle soit la plus basse du lot — ça la
 * distinguait d'une silhouette debout, mais « basse » n'est pas « Sombra ».
 * L'erreur était de chercher à sculpter son ATTITUDE (furtive, embusquée) :
 * il n'y a rien à modeler dans « discrète ».
 *
 * Ce qu'on peut modeler, c'est sa TÊTE. Sa coiffure — nuque rasée sombre,
 * masse claire balayée haut vers l'arrière — casse la silhouette du crâne,
 * et c'est le seul héros du lot dont le contour de la tête n'est pas un cube.
 * À cette échelle, un contour qui sort du gabarit commun vaut dix détails.
 * Même levier que les quatre pattes d'Orisa ou le vide sous Zenyatta.
 */
function buildSombra(b: SceneBuilder): void {
  pedestal(b, 6);
  // Debout, jambes fines mais épaisses en briques, appui égal.
  b.box(0, 2, -4, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  // Manteau violet mi-long : le violet COUVRE, il ne ponctue pas.
  b.box(-1, 8, -5, 5, 7, 10, 'accent');
  b.box(-2, 8, -4, 1, 5, 8, 'accent');
  // Circuits lumineux sur le devant du manteau, en saillie d'une brique.
  b.box(4, 10, -3, 1, 1, 6, 'highlight');
  b.box(4, 12, -2, 1, 1, 4, 'highlight');
  // Bras tendu, main ouverte, et le halo du piratage AU BOUT — écarté du
  // corps mais RATTACHÉ au bras, jamais flottant.
  b.box(1, 11, -8, 3, 3, 3, 'accent');
  b.box(3, 10, -11, 3, 5, 4, 'highlight');
  // Tête : nuque et bas du crâne sombres — la partie rasée.
  b.box(0, 15, -2, 4, 4, 4, 'structure');
  // LA COIFFURE, l'élément qui porte tout : une masse claire posée sur le
  // dessus, qui DÉBORDE vers l'arrière et monte en marches. Elle double la
  // hauteur de la tête et lui donne un profil que personne d'autre n'a.
  b.box(0, 19, -2, 4, 2, 4, 'highlight');
  b.box(-2, 20, -2, 3, 2, 4, 'highlight');
  b.box(-4, 21, -1, 3, 2, 3, 'highlight');
  b.box(-6, 22, -1, 2, 2, 2, 'highlight');
}

/**
 * SYMMETRA — la géométrie. REPRISE : le premier jet était un amas turquoise
 * sans silhouette, avec des cubes flottants sur le côté.
 *
 * Son motif est la CONSTRUCTION ordonnée : ce qui la nomme n'est ni sa
 * silhouette ni une arme, mais une tourelle géométrique posée devant elle.
 * On sculpte donc une figure sobre et droite, et un objet net à côté — deux
 * volumes propres valent mieux qu'un tas de cubes « techniques ».
 */
function buildSymmetra(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -3, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  // Robe droite, longue, fendue : une silhouette VERTICALE et calme.
  b.box(-1, 6, -4, 5, 8, 8, 'accent');
  b.box(0, 14, -3, 3, 4, 6, 'accent');
  b.box(3, 7, -3, 1, 8, 6, 'highlight', { keepExisting: false });
  head(b, 18, -2, { visor: false });
  // Chignon bas, un bloc net.
  b.box(-2, 18, -2, 2, 3, 4, 'structure');
  // Bras tendu vers la tourelle : c'est lui qui RELIE la figure à l'objet.
  b.box(1, 14, -6, 3, 3, 3, 'accent');
  // LA TOURELLE : une pyramide à trois étages, posée au sol à côté d'elle.
  // Franche, géométrique, séparée — mais alignée sur le bras, donc lue comme
  // « son » objet et non comme un cube égaré.
  b.box(0, 2, -11, 5, 2, 5, 'highlight');
  b.box(1, 4, -10, 3, 2, 3, 'highlight');
  b.box(2, 6, -9, 1, 3, 1, 'accent');
}

/**
 * TORBJÖRN — le nabot barbu. Silhouette : LA PLUS COURTE du lot, de loin — il
 * arrive à la ceinture des autres, et cette différence de taille est sa
 * première signature. Accessoire : la tourelle posée à ses pieds.
 */
function buildTorbjorn(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 4, 3, 3, 'structure');
  b.box(0, 2, 1, 4, 3, 3, 'structure');
  // Tronc large et bas, plastron orange.
  b.box(-1, 5, -5, 5, 5, 10, 'accent');
  b.box(-1, 6, -8, 5, 3, 3, 'accent');
  b.box(-1, 6, 5, 5, 3, 3, 'accent');
  // LA BARBE : une masse claire qui couvre toute la poitrine et descend plus
  // bas que les bras. Une barbe de deux briques ne serait qu'un menton clair.
  b.box(3, 6, -4, 3, 6, 8, 'highlight');
  b.box(5, 8, -3, 1, 3, 6, 'highlight');
  head(b, 10, -2, { visor: false });
  // Casque de chantier : bord débordant, puis calotte.
  b.box(-2, 14, -4, 7, 1, 8, 'accent');
  b.box(0, 15, -2, 4, 2, 4, 'accent');
  // La tourelle, au sol côté -z : socle, fût, deux canons.
  b.box(-2, 2, -13, 7, 2, 7, 'structure');
  b.box(-1, 4, -12, 5, 4, 5, 'accent');
  b.box(0, 8, -11, 4, 3, 3, 'structure');
  b.box(4, 8, -11, 4, 1, 1, 'highlight');
  b.box(4, 8, -9, 4, 1, 1, 'highlight');
}

/**
 * WIDOWMAKER — le fusil. REPRISE : le premier jet était une masse violette
 * indistincte avec un fusil rouge trop petit, posé contre le corps.
 *
 * Elle n'a qu'une chose à dire, et c'est son ARME. Le fusil devient donc la
 * pièce la plus grosse du modèle — un tiers de la figurine — tenu à l'écart du
 * torse et à l'horizontale, comme le marteau de Reinhardt est tenu debout.
 * Tout le reste est du support.
 */
function buildWidowmaker(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  b.box(0, 2, -4, 3, 1, 3, 'accent', { keepExisting: false });
  b.box(0, 2, 1, 3, 1, 3, 'accent', { keepExisting: false });
  // Buste et combinaison violette.
  b.box(-1, 8, -4, 5, 7, 8, 'accent');
  b.box(3, 9, -3, 1, 5, 6, 'structure', { keepExisting: false });
  head(b, 15, -2, { visor: true });
  // Cheveux ramassés en un bloc dans le dos.
  b.box(-2, 15, -2, 2, 4, 4, 'structure');
  // LE FUSIL, énorme et horizontal, tenu écarté côté +z. Fût long vers
  // l'avant, lunette en saillie sur le dessus, crosse en arrière.
  b.box(-3, 10, 6, 13, 3, 3, 'structure');
  b.box(7, 13, 7, 4, 2, 2, 'highlight');
  b.box(-4, 9, 6, 3, 4, 3, 'structure');
  // Bras qui le porte : il RELIE l'arme au corps, sinon elle flotte.
  b.box(1, 10, 4, 3, 3, 3, 'accent');
}

/**
 * ANA — le voile et la lunette. Silhouette : manteau long, capuche claire qui
 * double la tête. Accessoire : le fusil, debout côté +z, grosse lunette.
 */
function buildAna(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -4, 3, 5, 3, 'structure');
  b.box(0, 2, 1, 3, 5, 3, 'structure');
  // Manteau bleu, long, évasé jusqu'aux mollets.
  b.box(-1, 5, -5, 5, 6, 10, 'accent');
  b.box(-1, 11, -4, 5, 4, 8, 'accent');
  b.box(3, 11, -2, 1, 4, 4, 'structure', { keepExisting: false });
  b.box(0, 11, -7, 3, 4, 3, 'accent');
  b.box(0, 11, 5, 3, 4, 3, 'accent');
  head(b, 15, -2, { visor: false });
  // LE VOILE : il enveloppe le crâne et retombe sur les épaules, clair sur un
  // manteau sombre — c'est lui qui la sépare de tous les autres tireurs.
  b.box(-1, 15, -3, 5, 5, 6, 'highlight');
  b.carveBox(3, 16, -2, 1, 3, 4);
  b.box(-2, 12, -3, 2, 6, 6, 'highlight');
  b.box(3, 16, -2, 1, 3, 4, 'structure', { keepExisting: false });
  b.box(4, 17, -2, 1, 1, 2, 'accent');
  // Le fusil biotique, debout côté +z.
  b.box(1, 3, 9, 2, 16, 2, 'accent');
  b.box(0, 3, 8, 4, 3, 3, 'accent');
  b.box(3, 13, 8, 2, 2, 4, 'structure');
  b.box(1, 19, 9, 2, 2, 2, 'highlight');
}

/**
 * BAPTISTE — l'épaulière et les bottes. Silhouette : une épaulière énorme d'un
 * seul côté, des mollets d'exosquelette plus épais que les cuisses.
 * Accessoire : le lanceur, porté en avant, embout ambré.
 */
function buildBaptiste(b: SceneBuilder): void {
  pedestal(b, 7);
  // Bottes d'exosquelette : le bas de jambe est PLUS GROS que la cuisse, ce qui
  // n'arrive chez personne d'autre.
  for (const z of [-4, 1] as const) {
    b.box(-1, 2, z - 1, 6, 4, 5, 'accent');
    b.box(-1, 3, z - 1, 6, 1, 5, 'highlight', { keepExisting: false });
    b.box(0, 6, z, 3, 3, 3, 'structure');
  }
  b.box(-1, 9, -5, 5, 6, 10, 'structure');
  b.box(3, 10, -3, 1, 4, 6, 'accent', { keepExisting: false });
  // L'épaulière, d'un seul côté, haute et débordante.
  b.box(-2, 13, -9, 6, 5, 4, 'accent');
  b.box(-2, 17, -9, 6, 1, 4, 'highlight', { keepExisting: false });
  b.box(0, 12, 6, 3, 4, 3, 'accent');
  head(b, 15, -2, { cap: 'accent', visor: true });
  // Le lanceur, porté en avant côté +z.
  b.box(0, 10, 7, 4, 4, 3, 'accent');
  b.box(4, 10, 7, 7, 3, 3, 'structure');
  b.box(11, 10, 7, 2, 3, 3, 'highlight');
}

/**
 * BRIGITTE — le bouclier. Silhouette : armure carrée, natte blonde dans le dos.
 * Accessoire : le pavois, une plaque d'acier plus large que son torse, portée
 * bien à l'écart côté -z.
 */
function buildBrigitte(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 4, 5, 3, 'structure');
  b.box(0, 2, 1, 4, 5, 3, 'structure');
  b.box(0, 2, -4, 4, 2, 3, 'accent', { keepExisting: false });
  b.box(0, 2, 1, 4, 2, 3, 'accent', { keepExisting: false });
  b.box(-1, 7, -5, 5, 7, 10, 'accent');
  b.box(3, 8, -3, 1, 5, 6, 'structure', { keepExisting: false });
  b.box(-1, 13, -7, 5, 3, 14, 'structure');
  b.box(0, 8, 7, 3, 5, 3, 'accent');
  head(b, 16, -2, { visor: false });
  // Natte blonde, épaisse, qui descend le long du dos.
  b.box(0, 16, -2, 4, 4, 4, 'highlight', { keepExisting: false });
  b.box(-2, 8, -1, 2, 10, 2, 'highlight');
  // LE PAVOIS : une plaque debout, mince en z pour montrer sa grande face,
  // bordée d'acier. Posée à plat contre le bras, elle aurait disparu.
  b.box(0, 8, -9, 4, 3, 3, 'structure');
  b.box(-3, 3, -12, 9, 14, 2, 'structure');
  b.box(-3, 3, -12, 9, 1, 2, 'accent', { keepExisting: false });
  b.box(-3, 16, -12, 9, 1, 2, 'accent', { keepExisting: false });
  b.box(0, 7, -12, 3, 6, 2, 'accent', { keepExisting: false });
}

/**
 * ILLARI — le pylône. Silhouette : cape solaire dans le dos, tenue rouge et or.
 * Accessoire : le pylône, une colonne dorée plantée à côté d'elle, couronnée de
 * lumière — la seule pièce verticale isolée du lot à ne pas être une arme.
 */
function buildIllari(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -4, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  b.box(-1, 8, -5, 5, 6, 10, 'structure');
  b.box(3, 9, -3, 1, 4, 6, 'accent', { keepExisting: false });
  b.box(-1, 13, -6, 5, 3, 12, 'accent');
  b.box(0, 9, -8, 3, 5, 3, 'accent');
  // LE DISQUE SOLAIRE dans le dos : un demi-disque doré qui dépasse des épaules
  // de tous les côtés, posé côté -x.
  for (let i = 0; i < 5; i += 1) {
    b.box(-3, 9 + i, -5 + i, 2, 1, 10 - 2 * i, 'accent');
  }
  b.box(-4, 10, -3, 1, 4, 6, 'highlight');
  head(b, 16, -2, { visor: false });
  b.box(-1, 16, -3, 3, 4, 6, 'structure');
  // Le pylône, planté au sol côté +z.
  b.box(0, 2, 9, 4, 3, 4, 'accent');
  b.box(1, 5, 10, 2, 10, 2, 'accent');
  b.box(0, 15, 9, 4, 3, 4, 'accent');
  b.box(0, 18, 9, 4, 2, 4, 'highlight');
  b.box(1, 20, 10, 2, 2, 2, 'highlight');
}

/**
 * KIRIKO — le masque de renard. Silhouette : hakama rouge très évasé, haut
 * blanc. Accessoire : le masque, porté SUR LE CÔTÉ de la tête, blanc marqué de
 * rouge — il double la tête et se voit de loin.
 */
function buildKiriko(b: SceneBuilder): void {
  pedestal(b, 7);
  // Hakama : un pantalon si large qu'il se lit comme une jupe.
  for (let y = 2; y <= 11; y += 1) {
    const r = 5.8 - (y - 2) * 0.22;
    b.disc(1, 0, r, y, 1, 'accent');
  }
  b.ring(1, 0, 5.8, 1.4, 2, 1, 'structure', { keepExisting: false });
  // Haut blanc, manches larges.
  b.box(-1, 11, -5, 5, 5, 10, 'highlight');
  b.box(-1, 12, -8, 5, 4, 3, 'highlight');
  b.box(-1, 12, 5, 5, 4, 3, 'highlight');
  b.box(3, 12, -2, 1, 4, 4, 'accent', { keepExisting: false });
  head(b, 16, -2, { visor: false });
  // Chevelure noire, queue haute vers l'arrière.
  b.box(-1, 16, -3, 4, 4, 6, 'structure');
  b.box(-3, 14, -2, 2, 5, 4, 'structure');
  // LE MASQUE, sur le flanc gauche de la tête.
  b.box(1, 16, -4, 3, 4, 1, 'highlight');
  b.box(2, 17, -5, 2, 2, 1, 'highlight');
  b.box(2, 18, -4, 1, 1, 1, 'accent', { keepExisting: false });
  b.box(2, 16, -4, 1, 1, 1, 'accent', { keepExisting: false });
}

/**
 * LIFEWEAVER — les pétales. REPRISE : le premier jet posait quatre cubes roses
 * SANS CONTACT avec le corps. Détachés au point de flotter, ils ne se lisaient
 * pas comme des pétales mais comme un défaut de rendu.
 *
 * « Détaché » voulait dire ÉCARTÉ tout en restant rattaché — c'est ce qui fait
 * marcher les poings de Winston. Ici, les pétales partent donc de l'épaule et
 * s'ouvrent en éventail, chacun touchant le précédent.
 */
function buildLifeweaver(b: SceneBuilder): void {
  pedestal(b, 7);
  b.box(0, 2, -3, 3, 6, 3, 'structure');
  b.box(0, 2, 1, 3, 6, 3, 'structure');
  // Tunique longue, rose, évasée.
  b.box(-2, 6, -5, 6, 6, 10, 'accent');
  b.box(-1, 12, -3, 5, 5, 6, 'accent');
  b.box(3, 13, -2, 1, 3, 4, 'highlight', { keepExisting: false });
  head(b, 17, -2, { visor: false });
  // Chignon haut.
  b.box(0, 21, -1, 3, 2, 2, 'structure');
  // LES PÉTALES : un éventail ANCRÉ à l'épaule (+z), chaque élément en contact
  // avec le suivant, montant et s'écartant. Trois suffisent — un quatrième
  // sortait du cadre et se retrouvait isolé.
  b.box(0, 13, 4, 4, 4, 3, 'highlight');
  b.box(-1, 16, 6, 4, 4, 3, 'highlight');
  b.box(-2, 19, 8, 4, 4, 3, 'highlight');
  // Le bras qui les porte, pour que l'éventail parte de QUELQUE CHOSE.
  b.box(1, 12, 3, 3, 3, 2, 'accent');
}

/**
 * LÚCIO — l'ampli. Silhouette : trapue, en appui bas sur des patins épais.
 * Accessoire : l'amplificateur sonore, porté en avant, gros et carré.
 *
 * Les dreadlocks sont un piège connu : dessinées en mèches, elles n'existent
 * pas. Ici, un bloc épais qui déborde derrière la tête — c'est la masse qui
 * dit la coiffure, pas le détail.
 */
function buildLucio(b: SceneBuilder): void {
  pedestal(b, 6);
  // Patins : pieds volontairement plus larges que les jambes, posés à plat.
  b.box(-1, 2, -4, 6, 2, 3, 'highlight');
  b.box(-1, 2, 1, 6, 2, 3, 'highlight');
  b.box(0, 4, -4, 3, 4, 3, 'structure');
  b.box(0, 4, 1, 3, 4, 3, 'structure');
  // Buste court et large, veste verte par-dessus.
  b.box(0, 8, -4, 4, 6, 8, 'structure');
  b.box(-1, 9, -5, 5, 4, 10, 'accent');
  // Bras qui porte l'ampli, écarté du torse pour ne pas fusionner avec lui.
  b.box(1, 10, -8, 3, 3, 3, 'structure');
  // L'AMPLI : gros, carré, en saillie franche — le seul accessoire.
  b.box(3, 8, -11, 4, 6, 5, 'accent');
  b.box(7, 9, -10, 1, 4, 3, 'highlight');
  head(b, 14, -2, { visor: false });
  // Dreads : un bloc épais qui déborde derrière et sur les côtés.
  b.box(-2, 14, -3, 2, 5, 6, 'structure');
  b.box(-3, 15, -2, 1, 3, 4, 'structure');
}

/**
 * MOIRA — l'asymétrie. Silhouette : haute et droite, manteau qui s'évase,
 * col montant. Accessoire : SES DEUX BRAS, de couleurs opposées — c'est la
 * seule du lot dont la signature est une asymétrie de couleur et non un objet.
 */
function buildMoira(b: SceneBuilder): void {
  pedestal(b, 6);
  b.box(0, 2, -3, 3, 5, 2, 'structure');
  b.box(0, 2, 1, 3, 5, 2, 'structure');
  // Manteau : évasé en bas, resserré à la taille.
  b.box(-1, 6, -5, 5, 5, 10, 'structure');
  b.box(0, 11, -3, 3, 6, 6, 'structure');
  // Plastron violet sur la face vue.
  b.box(3, 12, -3, 1, 4, 6, 'accent', { keepExisting: false });
  // LES DEUX BRAS, opposés. Le doré est du côté VISIBLE (+z) : de trois
  // quarts, c'est lui qu'on voit en premier, donc lui qui porte la lecture.
  b.box(0, 11, 5, 3, 6, 3, 'highlight');
  b.box(0, 9, 6, 3, 3, 2, 'highlight');
  b.box(0, 11, -7, 3, 6, 3, 'accent');
  b.box(0, 9, -8, 3, 3, 2, 'accent');
  // Col montant, plus large que la tête : il l'encadre.
  b.box(-1, 16, -4, 5, 3, 8, 'accent');
  head(b, 17, -2, { visor: false });
}

/**
 * ZENYATTA — le flottant. Silhouette : PAS DE JAMBES AU SOL. Le corps est
 * suspendu au-dessus du socle, jambes repliées en un bloc plat sous lui.
 *
 * C'est le même levier qu'Orisa, dont les quatre pattes suffisent à la nommer :
 * quand la silhouette contredit le gabarit humain, elle se lit d'un coup. Le
 * vide sous le corps est donc l'élément le plus important du modèle — ne pas le
 * combler.
 */
function buildZenyatta(b: SceneBuilder): void {
  pedestal(b, 6);
  // Jambes repliées : un bloc large et plat, SUSPENDU (y = 6, socle à y = 1).
  b.box(-1, 6, -5, 5, 2, 10, 'structure');
  b.box(-1, 6, -5, 5, 1, 10, 'accent', { keepExisting: false });
  // Buste droit, étroit.
  b.box(0, 8, -3, 3, 7, 6, 'structure');
  b.box(2, 9, -3, 1, 5, 6, 'accent', { keepExisting: false });
  // Bras posés sur les genoux, écartés du buste.
  b.box(0, 9, -6, 3, 3, 3, 'structure');
  b.box(0, 9, 4, 3, 3, 3, 'structure');
  head(b, 15, -2, { cap: 'accent', visor: true });
  // LES SPHÈRES : un collier de cubes autour des épaules. Individuellement
  // trop petites pour exister, elles se lisent comme un ANNEAU — c'est
  // l'ensemble qui porte le sens, pas chaque sphère.
  for (const [x, z] of [
    [0, -6],
    [3, -5],
    [4, -1],
    [4, 2],
    [3, 4],
    [0, 5],
  ] as const) {
    b.box(x, 13, z, 2, 2, 2, 'highlight');
  }
}

const BUILDERS: Record<HeroFigureSlug, (b: SceneBuilder) => void> = {
  reinhardt: buildReinhardt,
  tracer: buildTracer,
  mercy: buildMercy,
  dva: buildDva,
  winston: buildWinston,
  roadhog: buildRoadhog,
  bastion: buildBastion,
  zarya: buildZarya,
  orisa: buildOrisa,
  doomfist: buildDoomfist,
  junkerqueen: buildJunkerqueen,
  mauga: buildMauga,
  ramattra: buildRamattra,
  wreckingball: buildWreckingball,
  sigma: buildSigma,
  hazard: buildHazard,
  ashe: buildAshe,
  cassidy: buildCassidy,
  reaper: buildReaper,
  echo: buildEcho,
  genji: buildGenji,
  hanzo: buildHanzo,
  junkrat: buildJunkrat,
  mei: buildMei,
  venture: buildVenture,
  vendetta: buildVendetta,
  pharah: buildPharah,
  sojourn: buildSojourn,
  soldier76: buildSoldier76,
  sombra: buildSombra,
  symmetra: buildSymmetra,
  torbjorn: buildTorbjorn,
  widowmaker: buildWidowmaker,
  ana: buildAna,
  baptiste: buildBaptiste,
  brigitte: buildBrigitte,
  illari: buildIllari,
  kiriko: buildKiriko,
  lifeweaver: buildLifeweaver,
  lucio: buildLucio,
  moira: buildMoira,
  zenyatta: buildZenyatta,
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

export function buildHeroFigure(slug: HeroFigureSlug): VoxelScene {
  const b = new SceneBuilder();
  BUILDERS[slug](b);

  const palette = PALETTES[slug];
  const recipe: MapRecipe = {
    slug: `tcg-hero-${slug}`,
    name: slug,
    layout: 'standard',
    palette: [PEDESTAL, palette.body, palette.main, palette.glow],
    landmarks: [],
    mood: 'day',
  };

  const bricks = b.toBricks();
  return { recipe, bricks, bounds: boundsOf(bricks) };
}

export function renderHeroFigureSvg(slug: HeroFigureSlug): string {
  return renderIsoSvg(buildHeroFigure(slug), {
    tile: 14,
    cubeHeight: 9,
    padding: 12,
    aspect: 3 / 4,
    studs: false,
    background: false,
    decorative: true,
    idPrefix: `hero-${slug}-`,
  });
}

/** L'URL de la figurine d'un héros. */
export function heroFigureUrl(slug: HeroFigureSlug): string {
  return `/api/tcg/hero/v${HERO_FIGURE_VERSION}/${slug}.svg`;
}
