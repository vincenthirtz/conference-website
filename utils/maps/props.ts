// utils/maps/props.ts
// Mobilier et menu détail : ce qui sépare un volume juste de la maquette d'un
// LIEU. Trois familles, appelées à des moments différents du montage :
//
//   - props au sol (lampadaire, caisses, banc, jardinière…), semés par
//     `generate.ts` sur les colonnes de terrain libres ;
//   - habillage de toiture (souche, château d'eau, édicule, antenne…), appelé
//     par `building()` pour que chaque volume ait un couronnement habité ;
//   - éléments d'alignement (garde-corps, file de lampadaires le long de
//     l'objectif), appelés par les layouts.
//
// RÈGLE DE LISIBILITÉ : rien ne se pose sur une surface `highlight`. Ce rôle est
// réservé à l'objectif, qui doit rester net y compris sur une vignette de
// 200 px — un semis de props par-dessus le rendrait illisible.
//
// Les props sont volontairement des OBJETS À PART, jamais du bruit cellule par
// cellule : une file de lampadaires régulière se lit à toutes les tailles, un
// piqueté aléatoire devient du grain dès qu'on réduit.

import type { SceneBuilder } from './builder';
import type { Architecture } from './types';
import type { Rng } from './rng';

const OVER = { keepExisting: false } as const;

/** Une colonne accepte-t-elle un prop ? (terrain nu, pas l'objectif, pas un toit) */
export function canDress(b: SceneBuilder, x: number, z: number, groundTop: number): boolean {
  const top = b.columnTop(x, z);
  if (top !== groundTop) return false;
  const below = b.get(x, top - 1, z);
  return below?.role === 'ground';
}

// ---------------------------------------------------------------------------
// Props au sol
// ---------------------------------------------------------------------------

/** Lampadaire : fût, potence et source. */
export function lamppost(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const h = rng.int(3, 4);
  b.box(x, y, z, 1, h, 1, 'structure', { shade: -0.16 });
  b.place(x, y + h, z, 'accent', OVER);
  b.place(x, y + h + 1, z, 'highlight', OVER);
}

/** Pile de caisses. */
export function crates(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  b.box(x, y, z, 2, 1, 2, 'structure', { shade: -0.1 });
  if (rng.chance(0.7)) b.box(x, y + 1, z, 1, 1, 1, 'accent', OVER);
  if (rng.chance(0.35)) b.place(x + 1, y + 1, z + 1, 'structure', OVER);
}

/** Fût métallique. */
export function barrel(b: SceneBuilder, x: number, y: number, z: number): void {
  b.box(x, y, z, 1, 2, 1, 'accent');
  b.place(x, y + 2, z, 'structure', OVER);
}

/** Banc adossé. */
export function bench(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const along = rng.chance(0.5);
  if (along) b.box(x, y, z, 3, 1, 1, 'accent');
  else b.box(x, y, z, 1, 1, 3, 'accent');
}

/** Jardinière : bac maçonné et végétation. */
export function planter(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  b.shell(x, y, z, 3, 1, 3, 'structure', { shade: -0.12 });
  b.box(x + 1, y, z + 1, 1, 1, 1, 'accent');
  if (rng.chance(0.5)) {
    b.box(x + 1, y + 1, z + 1, 1, 2, 1, 'structure', { shade: -0.2 });
    b.box(x, y + 3, z, 3, 1, 3, 'accent', OVER);
    b.box(x + 1, y + 4, z + 1, 1, 1, 1, 'accent', OVER);
  }
}

/** Mât à fanion. */
export function banner(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const h = rng.int(5, 7);
  b.box(x, y, z, 1, h, 1, 'structure', { shade: -0.18 });
  b.box(x, y + h - 3, z + 1, 1, 3, 1, 'accent', OVER);
  b.place(x, y + h, z, 'highlight', OVER);
}

/** Bloc rocheux — pour les terrains nus. */
export function rock(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  b.box(x, y, z, 2, 1, 2, 'ground', { shade: -0.2 });
  b.place(x + rng.int(0, 1), y + 1, z + rng.int(0, 1), 'ground', { shade: -0.26 });
}

/** Arbuste taillé. */
export function shrub(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  b.box(x, y, z, 1, rng.int(1, 2), 1, 'structure', { shade: -0.22 });
  const top = b.columnTop(x, z);
  b.box(x - 1, top, z, 3, 1, 1, 'accent');
  b.box(x, top, z - 1, 1, 1, 3, 'accent');
  b.place(x, top + 1, z, 'accent');
}

const GROUND_PROPS = [lamppost, crates, barrel, bench, planter, banner, rock, shrub] as const;

/** Pose un prop au sol choisi au hasard. */
export function groundProp(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const fn = rng.pick(GROUND_PROPS);
  if (fn) fn(b, x, y, z, rng);
}

// ---------------------------------------------------------------------------
// Alignements
// ---------------------------------------------------------------------------

/**
 * File de lampadaires le long d'un segment, décalés de `offset` sur la normale.
 * L'espacement régulier est le point : c'est ce qui fait lire une voie.
 */
export function lampLine(
  b: SceneBuilder,
  rng: Rng,
  from: { x: number; z: number },
  to: { x: number; z: number },
  groundTop: number,
  spacing = 5,
  offset = 3,
): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1) return;
  const nx = -dz / length;
  const nz = dx / length;
  for (let d = spacing / 2; d < length; d += spacing) {
    const t = d / length;
    for (const side of [-1, 1]) {
      const x = Math.round(from.x + dx * t + nx * offset * side);
      const z = Math.round(from.z + dz * t + nz * offset * side);
      if (!canDress(b, x, z, groundTop)) continue;
      lamppost(b, x, groundTop, z, rng);
    }
  }
}

/** Garde-corps sur le pourtour d'une plateforme. */
export function railing(
  b: SceneBuilder,
  x0: number,
  y: number,
  z0: number,
  w: number,
  d: number,
): void {
  for (let x = 0; x < w; x += 1) {
    for (let z = 0; z < d; z += 1) {
      const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
      if (!edge) continue;
      const post = (x + z) % 2 === 0;
      b.place(x0 + x, y, z0 + z, post ? 'structure' : 'accent', OVER);
      if (post) b.place(x0 + x, y + 1, z0 + z, 'structure', OVER);
    }
  }
}

// ---------------------------------------------------------------------------
// Props d'objectif — un par mode
// ---------------------------------------------------------------------------
//
// Ils ne décorent pas : ils NOMMENT le mode. Un convoi arrêté sur sa voie dit
// « escorte » plus vite que n'importe quelle légende, et c'est la seule chose
// qui reste lisible quand la vignette descend à 200 px.

/** Convoi : châssis, caisse et fanal. */
export function payload(b: SceneBuilder, x: number, y: number, z: number): void {
  b.box(x - 1, y, z - 2, 3, 1, 5, 'structure', { shade: -0.2 });
  b.box(x - 1, y + 1, z - 1, 3, 3, 3, 'accent', OVER);
  b.box(x - 1, y + 4, z - 1, 3, 1, 3, 'structure', OVER);
  b.place(x, y + 5, z, 'highlight', OVER);
  b.box(x - 1, y + 2, z + 2, 3, 1, 1, 'highlight', OVER);
}

/** Automate de poussée : buste, tête et bras. */
export function pushBot(b: SceneBuilder, x: number, y: number, z: number): void {
  b.box(x - 2, y, z - 2, 5, 1, 5, 'structure', { shade: -0.2 });
  b.box(x - 1, y + 1, z - 1, 3, 4, 3, 'accent');
  b.box(x - 2, y + 3, z - 1, 1, 3, 1, 'structure', OVER);
  b.box(x + 2, y + 3, z - 1, 1, 3, 1, 'structure', OVER);
  b.box(x - 1, y + 5, z - 1, 3, 2, 3, 'structure', OVER);
  b.box(x - 1, y + 6, z + 2, 3, 1, 1, 'highlight', OVER);
  b.place(x, y + 7, z, 'highlight', OVER);
}

/** Balise d'objectif : mât et couronne lumineuse. */
export function beacon(b: SceneBuilder, x: number, y: number, z: number, height = 6): void {
  b.box(x, y, z, 1, height, 1, 'structure', { shade: -0.16 });
  b.box(x - 1, y + height, z - 1, 3, 1, 3, 'highlight', OVER);
  b.place(x, y + height + 1, z, 'accent', OVER);
  b.place(x, y + height + 2, z, 'highlight', OVER);
}

/** Portique de point de capture : quatre mâts et un linteau lumineux. */
export function captureFrame(b: SceneBuilder, cx: number, y: number, cz: number, r: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(cx + sx * r, y, cz + sz * r, 1, 5, 1, 'structure', { shade: -0.16 });
      b.place(cx + sx * r, y + 5, cz + sz * r, 'highlight', OVER);
    }
  }
  for (const sz of [-1, 1]) b.box(cx - r, y + 5, cz + sz * r, r * 2 + 1, 1, 1, 'accent', OVER);
  for (const sx of [-1, 1]) b.box(cx + sx * r, y + 5, cz - r, 1, 1, r * 2 + 1, 'accent', OVER);
}

// ---------------------------------------------------------------------------
// Toitures
// ---------------------------------------------------------------------------

/** Souche de cheminée. */
function chimney(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const h = rng.int(2, 4);
  b.box(x, y, z, 1, h, 1, 'structure', { shade: -0.14 });
  b.place(x, y + h, z, 'accent', OVER);
}

/** Château d'eau sur pieds. */
function watertank(b: SceneBuilder, x: number, y: number, z: number): void {
  b.box(x, y, z, 3, 1, 3, 'structure', { shade: -0.18 });
  b.disc(x + 1, z + 1, 1.6, y + 1, 3, 'accent');
  b.disc(x + 1, z + 1, 1.2, y + 4, 1, 'structure');
}

/** Édicule technique. */
function plantroom(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const w = rng.int(2, 3);
  b.box(x, y, z, w, 2, w, 'structure', { shade: -0.08 });
  b.box(x, y + 2, z, w, 1, w, 'accent', OVER);
}

/** Antenne. */
function antenna(b: SceneBuilder, x: number, y: number, z: number, rng: Rng): void {
  const h = rng.int(3, 5);
  b.box(x, y, z, 1, h, 1, 'structure', { shade: -0.2 });
  b.place(x, y + h, z, 'highlight', OVER);
  if (h > 3) b.box(x - 1, y + h - 2, z, 3, 1, 1, 'structure', OVER);
}

/** Verrière. */
function skylight(b: SceneBuilder, x: number, y: number, z: number): void {
  b.box(x, y, z, 2, 1, 2, 'highlight', OVER);
}

/** Terrasse : garde-corps et un peu de mobilier. */
function terrace(b: SceneBuilder, x: number, y: number, z: number, w: number, d: number): void {
  railing(b, x, y, z, w, d);
  if (w > 3 && d > 3) b.place(x + 1, y, z + 1, 'accent', OVER);
}

/**
 * Habille la toiture d'un bâtiment. Le style oriente le tirage : une souche de
 * cheminée sur une mitoyenne, un édicule technique et une antenne sur une tour
 * contemporaine — c'est ce qui empêche les toits de se ressembler tous.
 */
export function roofProps(
  b: SceneBuilder,
  rng: Rng,
  arch: Architecture,
  x0: number,
  y: number,
  z0: number,
  w: number,
  d: number,
): void {
  if (w < 3 || d < 3) return;
  const pick = (): number => rng.next();
  const count = rng.int(1, w > 5 ? 3 : 2);
  for (let i = 0; i < count; i += 1) {
    const px = x0 + rng.int(0, Math.max(0, w - 3));
    const pz = z0 + rng.int(0, Math.max(0, d - 3));
    const roll = pick();
    switch (arch) {
      case 'terrace':
      case 'alpine':
        chimney(b, px, y, pz, rng);
        break;
      case 'industrial':
        if (roll < 0.45) plantroom(b, px, y, pz, rng);
        else if (roll < 0.75) watertank(b, px, y, pz);
        else chimney(b, px, y, pz, rng);
        break;
      case 'futurist':
        if (roll < 0.45) plantroom(b, px, y, pz, rng);
        else if (roll < 0.8) antenna(b, px, y, pz, rng);
        else skylight(b, px, y, pz);
        break;
      case 'whitewash':
      case 'colonial':
        if (roll < 0.4) terrace(b, x0, y, z0, w, d);
        else if (roll < 0.7) watertank(b, px, y, pz);
        else chimney(b, px, y, pz, rng);
        break;
      case 'ancient':
        if (roll < 0.5) terrace(b, x0, y, z0, w, d);
        else skylight(b, px, y, pz);
        break;
      default:
        if (roll < 0.4) plantroom(b, px, y, pz, rng);
        else if (roll < 0.7) antenna(b, px, y, pz, rng);
        else watertank(b, px, y, pz);
    }
  }
}
