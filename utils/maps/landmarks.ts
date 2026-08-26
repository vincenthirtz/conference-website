// utils/maps/landmarks.ts
// Bibliothèque de silhouettes posées sur les ancres d'un layout.
//
// POSTURE JURIDIQUE : ce sont des ARCHÉTYPES d'architecture (un beffroi, une
// arche, un amphithéâtre, une rangée de maisons mitoyennes, un village blanchi
// à la chaux…), pas des modèles d'un bâtiment identifiable d'un jeu. C'est la
// combinaison palette + archétype + décor qui évoque une map ; la reconnaissance
// passe par le TYPE de lieu, jamais par le relevé de sa géométrie. Ne pas
// ajouter ici de forme qui ne serait descriptible que comme « le bâtiment X de
// la map Y ».
//
// Chaque builder reçoit le centre (cx, cz) et l'altitude du sol (baseY) sur
// lequel poser la silhouette, et écrit directement dans le SceneBuilder.

import type { SceneBuilder } from './builder';
import type { LandmarkKind } from './types';
import type { Rng } from './rng';

type LandmarkFn = (b: SceneBuilder, cx: number, cz: number, baseY: number, rng: Rng) => void;

const OVER = { keepExisting: false } as const;

/** Toit à deux pentes le long de x (le faîtage court dans l'axe x). */
function gableRoof(
  b: SceneBuilder,
  x0: number,
  y: number,
  z0: number,
  w: number,
  d: number,
): void {
  const steps = Math.ceil(d / 2);
  for (let i = 0; i < steps; i += 1) {
    const depth = d - i * 2;
    if (depth <= 0) break;
    b.box(x0, y + i, z0 + i, w, 1, depth, 'accent', OVER);
  }
}

/** Rangées de fenêtres allumées sur les deux faces visibles en iso. */
function windows(
  b: SceneBuilder,
  x0: number,
  y0: number,
  z0: number,
  w: number,
  h: number,
  d: number,
  rng: Rng,
): void {
  for (let y = y0 + 1; y < y0 + h - 1; y += 2) {
    for (let x = x0 + 1; x < x0 + w - 1; x += 2) {
      if (rng.chance(0.55)) b.place(x, y, z0 + d - 1, 'highlight', OVER);
    }
    for (let z = z0 + 1; z < z0 + d - 1; z += 2) {
      if (rng.chance(0.55)) b.place(x0 + w - 1, y, z, 'highlight', OVER);
    }
  }
}

// ---------------------------------------------------------------------------
// Silhouettes
// ---------------------------------------------------------------------------

/** Tour carrée avec bandeau vitré et couronnement. */
const tower: LandmarkFn = (b, cx, cz, y, rng) => {
  const w = rng.int(4, 5);
  const h = rng.int(9, 12);
  const x0 = cx - Math.floor(w / 2);
  const z0 = cz - Math.floor(w / 2);
  b.box(x0, y, z0, w, h, w, 'structure');
  windows(b, x0, y, z0, w, h, w, rng);
  b.box(x0 - 1, y + h, z0 - 1, w + 2, 1, w + 2, 'accent', OVER);
  b.box(x0, y + h + 1, z0, w, 1, w, 'accent', OVER);
  b.box(cx, y + h + 2, cz, 1, 2, 1, 'highlight', OVER);
};

/** Beffroi : fût étroit, cadran éclairé, flèche pyramidale. */
const clocktower: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(13, 16);
  b.box(cx - 2, y, cz - 2, 5, 3, 5, 'structure');
  b.box(cx - 1, y + 3, cz - 1, 3, h, 3, 'structure');
  // Contreforts d'angle : sans eux le fût lit comme un simple poteau.
  for (const [dx, dz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    b.box(cx + dx * 2, y + 3, cz + dz * 2, 1, h - 4, 1, 'structure');
  }
  const face = y + 3 + h - 3;
  b.box(cx + 2, face, cz - 1, 1, 3, 3, 'highlight', OVER);
  b.box(cx - 1, face, cz + 2, 3, 3, 1, 'highlight', OVER);
  b.box(cx - 2, y + 3 + h, cz - 2, 5, 1, 5, 'accent', OVER);
  for (let i = 0; i < 5; i += 1) {
    const s = 3 - Math.floor(i / 2);
    if (s <= 0) break;
    const o = Math.floor(s / 2);
    b.box(cx - o, y + 4 + h + i, cz - o, s, 1, s, 'accent', OVER);
  }
  b.box(cx, y + 9 + h, cz, 1, 2, 1, 'highlight', OVER);
};

/** Arche monumentale : deux piles et un linteau. */
const arch: LandmarkFn = (b, cx, cz, y, rng) => {
  const span = rng.int(7, 9);
  const h = rng.int(6, 8);
  const half = Math.floor(span / 2);
  for (const side of [-1, 1]) {
    const x = side < 0 ? cx - half : cx + half - 2;
    b.box(x, y, cz - 2, 3, h, 4, 'structure');
    b.box(x - 1, y, cz - 2, 1, 2, 4, 'accent');
  }
  b.box(cx - half, y + h, cz - 2, span, 2, 4, 'accent');
  b.box(cx - half + 3, y + h - 1, cz - 2, span - 6, 1, 4, 'accent');
  b.box(cx - 2, y + h + 2, cz - 2, 5, 1, 4, 'highlight', OVER);
};

/** Coupole sur tambour — profil sphérique adouci. */
const dome: LandmarkFn = (b, cx, cz, y, rng) => {
  const r = rng.int(4, 5);
  b.disc(cx, cz, r, y, 4, 'structure');
  // Percements du tambour.
  for (let a = 0; a < 8; a += 1) {
    const t = (a / 8) * Math.PI * 2;
    b.place(cx + Math.round(Math.cos(t) * r), y + 2, cz + Math.round(Math.sin(t) * r), 'highlight', OVER);
  }
  b.ring(cx, cz, r + 0.6, 1.4, y + 4, 1, 'accent');
  const layers = r + 2;
  for (let i = 0; i <= layers; i += 1) {
    const lr = r * Math.sqrt(Math.max(0, 1 - ((i + 0.5) / (layers + 1)) ** 2));
    if (lr < 0.4) break;
    b.disc(cx, cz, lr, y + 5 + i, 1, 'accent');
  }
  b.box(cx, y + 5 + layers, cz, 1, 2, 1, 'highlight', OVER);
};

/** Flèche effilée sur base carrée. */
const spire: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(11, 14);
  b.box(cx - 3, y, cz - 3, 7, 3, 7, 'structure');
  b.box(cx - 2, y + 3, cz - 2, 5, 3, 5, 'structure');
  for (let i = 0; i < h; i += 1) {
    const s = i < h * 0.35 ? 3 : 1;
    const o = Math.floor(s / 2);
    b.box(cx - o, y + 6 + i, cz - o, s, 1, s, i % 3 === 2 ? 'accent' : 'structure', OVER);
  }
  b.box(cx, y + 6 + h, cz, 1, 2, 1, 'highlight', OVER);
};

/** Statue sur socle — silhouette humanoïde très abstraite. */
const statue: LandmarkFn = (b, cx, cz, y) => {
  b.box(cx - 2, y, cz - 2, 5, 3, 5, 'structure');
  b.box(cx - 1, y + 3, cz - 1, 3, 1, 3, 'accent');
  b.box(cx, y + 4, cz, 1, 5, 1, 'accent');
  b.box(cx - 1, y + 6, cz, 3, 1, 1, 'accent');
  b.box(cx + 1, y + 7, cz, 1, 3, 1, 'accent');
  b.box(cx, y + 9, cz, 1, 1, 1, 'highlight', OVER);
};

/** Arbre : tronc + houppier. */
const tree: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(3, 5);
  b.box(cx, y, cz, 1, h, 1, 'structure');
  const r = rng.int(2, 3);
  b.disc(cx, cz, r, y + h, 1, 'accent');
  b.disc(cx, cz, r - 0.8, y + h + 1, 1, 'accent');
  b.box(cx, y + h + 2, cz, 1, 1, 1, 'accent');
};

/** Palmier : stipe et palmes rayonnantes. */
const palm: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(5, 8);
  for (let i = 0; i < h; i += 1) {
    b.place(cx + (i > h - 3 ? 1 : 0), y + i, cz, 'structure');
  }
  const top = y + h;
  const tx = cx + 1;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let i = 1; i <= 3; i += 1) {
      b.place(tx + dx * i, top - (i === 3 ? 1 : 0), cz + dz * i, 'accent', OVER);
    }
  }
  b.place(tx, top, cz, 'accent', OVER);
};

/** Grue de chantier : mât, flèche, contrepoids, câble. */
const crane: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(10, 13);
  b.box(cx, y, cz, 2, h, 2, 'structure');
  const jib = rng.int(7, 9);
  b.box(cx, y + h, cz, jib, 1, 2, 'accent');
  b.box(cx - 4, y + h, cz, 4, 1, 2, 'accent');
  b.box(cx - 4, y + h - 1, cz, 2, 1, 2, 'structure');
  b.box(cx + jib - 2, y + h - 4, cz, 1, 4, 1, 'highlight');
  b.box(cx + jib - 3, y + h - 5, cz - 1, 3, 1, 3, 'highlight', OVER);
  b.box(cx, y + h + 1, cz, 2, 1, 2, 'highlight', OVER);
};

/** Ruine antique : colonnade brisée et stylobate. */
const ruin: LandmarkFn = (b, cx, cz, y, rng) => {
  const cols = rng.int(4, 6);
  b.box(cx - cols - 1, y, cz - 2, cols * 2 + 3, 1, 6, 'accent');
  for (let i = 0; i < cols; i += 1) {
    const h = rng.int(4, 9);
    const x = cx - cols + i * 2;
    b.box(x, y + 1, cz - 1, 2, h, 2, 'structure');
    b.box(x, y + 1 + h, cz - 1, 2, 1, 2, 'accent', OVER);
    // Une travée sur trois porte encore son entablement.
    if (i > 0 && i % 3 === 0) b.box(x - 2, y + 2 + h, cz - 1, 4, 1, 2, 'accent', OVER);
  }
};

/** Panneau publicitaire : deux pieds et un cadre lumineux. */
const billboard: LandmarkFn = (b, cx, cz, y, rng) => {
  const w = rng.int(7, 9);
  const h = rng.int(4, 6);
  const x0 = cx - Math.floor(w / 2);
  b.box(x0 + 1, y, cz, 1, h, 1, 'structure');
  b.box(x0 + w - 2, y, cz, 1, h, 1, 'structure');
  b.box(x0, y + h, cz, w, 5, 1, 'highlight');
  b.shell(x0, y + h, cz, w, 5, 1, 'accent', OVER);
};

/** Pyramide à degrés. */
const pyramid: LandmarkFn = (b, cx, cz, y, rng) => {
  const base = rng.int(11, 13);
  const steps = Math.floor(base / 2);
  for (let i = 0; i < steps; i += 1) {
    const s = base - i * 2;
    const o = Math.floor(s / 2);
    b.box(cx - o, y + i, cz - o, s, 1, s, i % 2 === 0 ? 'structure' : 'accent');
  }
  b.box(cx, y + steps, cz, 1, 2, 1, 'highlight', OVER);
};

/** Moulin : tour trapue, calotte et quatre ailes. */
const windmill: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(8, 10);
  b.disc(cx, cz, 2.4, y, h, 'structure');
  b.ring(cx, cz, 2.6, 1.2, y + h, 1, 'accent');
  b.disc(cx, cz, 2, y + h + 1, 1, 'accent');
  b.box(cx, y + h + 2, cz, 1, 1, 1, 'accent');
  for (let i = 1; i <= 4; i += 1) {
    b.place(cx + i, y + h + 2, cz, 'highlight', OVER);
    b.place(cx - i, y + h + 2, cz, 'highlight', OVER);
    b.place(cx, y + h + 2 + i, cz, 'highlight', OVER);
    b.place(cx, y + h + 2 - i, cz, 'highlight', OVER);
  }
};

/** Porte monumentale : deux tours massives, linteau et enseigne. */
const gate: LandmarkFn = (b, cx, cz, y, rng) => {
  const span = rng.int(9, 11);
  const h = rng.int(7, 9);
  const half = Math.floor(span / 2);
  for (const side of [-1, 1]) {
    const x = side < 0 ? cx - half : cx + half - 3;
    b.box(x, y, cz - 2, 4, h, 5, 'structure');
    // Créneaux.
    for (let i = 0; i < 4; i += 2) b.box(x + i, y + h, cz - 2, 1, 2, 5, 'accent', OVER);
    b.box(x, y + h, cz - 2, 4, 1, 5, 'accent', OVER);
  }
  b.box(cx - half, y + h - 3, cz - 2, span, 3, 5, 'structure');
  b.box(cx - half + 1, y + h, cz - 2, span - 2, 1, 5, 'accent', OVER);
  // Enseigne suspendue au-dessus du passage.
  b.box(cx - 3, y + h + 1, cz + 2, 7, 3, 1, 'highlight', OVER);
  b.shell(cx - 3, y + h + 1, cz + 2, 7, 3, 1, 'accent', OVER);
};

/** Amphithéâtre : anneau à arcades sur plusieurs niveaux, avec sa brèche. */
const amphitheatre: LandmarkFn = (b, cx, cz, y, rng) => {
  const outer = 8;
  const thickness = 2.4;
  const tiers = 3;

  /** Perce l'anneau de part en part sur un rayon donné. */
  const pierce = (ang: number, y0: number, h: number, r: number): void => {
    for (let d = 0; d <= thickness + 1; d += 0.5) {
      const rr = r - d;
      b.carveBox(
        cx + Math.round(Math.cos(ang) * rr),
        y0,
        cz + Math.round(Math.sin(ang) * rr),
        1,
        h,
        1,
      );
    }
  };

  for (let t = 0; t < tiers; t += 1) {
    const y0 = y + t * 3;
    const r = outer - t * 0.5;
    b.ring(cx, cz, r, thickness, y0, 3, 'structure');
    b.ring(cx, cz, r + 0.4, 1.1, y0 + 3, 1, 'accent');
    // Arcades — évidées, pas peintes : c'est le jour qui passe au travers qui
    // fait lire l'édifice comme un amphithéâtre et non comme un mur rond.
    const openings = 14 - t * 2;
    for (let a = 0; a < openings; a += 1) pierce((a / openings) * Math.PI * 2, y0 + 1, 2, r);
  }

  // Arène intérieure, en creux.
  b.disc(cx, cz, outer - thickness - 0.6, y, 1, 'accent');
  // Pan de mur effondré : la brèche est la signature de la ruine.
  for (let a = 0; a < 7; a += 1) {
    const ang = 0.85 + a * 0.1;
    for (let h = 0; h < tiers * 3 + 1; h += 1) pierce(ang, y + 2 + h, 1, outer + 0.5);
  }
};

/** Temple à gradins : socle, tours étagées, flèche. */
const temple: LandmarkFn = (b, cx, cz, y, rng) => {
  b.box(cx - 6, y, cz - 6, 13, 2, 13, 'structure');
  b.box(cx - 6, y + 2, cz - 6, 13, 1, 13, 'accent', OVER);
  // Escalier d'accès.
  for (let i = 0; i < 3; i += 1) b.box(cx - 2, y + i, cz + 7 - i, 5, 1, 1, 'accent');
  const tiers = rng.int(5, 6);
  for (let t = 0; t < tiers; t += 1) {
    const s = 9 - t * 1.4;
    const o = Math.floor(s / 2);
    const y0 = y + 3 + t * 2;
    b.box(cx - o, y0, cz - o, Math.round(s), 2, Math.round(s), 'structure');
    b.box(cx - o - 1, y0 + 2, cz - o - 1, Math.round(s) + 2, 1, Math.round(s) + 2, 'accent', OVER);
  }
  const topY = y + 3 + tiers * 2 + 1;
  for (let i = 0; i < 4; i += 1) {
    const s = 3 - i;
    if (s <= 0) break;
    const o = Math.floor(s / 2);
    b.box(cx - o, topY + i, cz - o, s, 1, s, 'accent', OVER);
  }
  b.box(cx, topY + 4, cz, 1, 2, 1, 'highlight', OVER);
};

/** Phare : fût tronconique à bandes, lanterne au sommet. */
const lighthouse: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(12, 15);
  b.disc(cx, cz, 3.4, y, 2, 'structure');
  for (let i = 0; i < h; i += 1) {
    const r = 2.6 - (i / h) * 1.3;
    b.disc(cx, cz, r, y + 2 + i, 1, i % 4 < 2 ? 'structure' : 'accent');
  }
  b.ring(cx, cz, 2.2, 1.2, y + 2 + h, 1, 'accent');
  b.disc(cx, cz, 1.6, y + 3 + h, 2, 'highlight');
  b.disc(cx, cz, 2, y + 5 + h, 1, 'accent');
};

/** Cheminée industrielle. */
const smokestack: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(12, 16);
  b.box(cx - 2, y, cz - 2, 5, 2, 5, 'structure');
  for (let i = 0; i < h; i += 1) {
    b.disc(cx, cz, 1.7 - (i / h) * 0.4, y + 2 + i, 1, i % 5 === 4 ? 'accent' : 'structure');
  }
  b.ring(cx, cz, 1.8, 1.2, y + 2 + h, 2, 'accent');
  b.place(cx, y + 4 + h, cz, 'highlight', OVER);
};

/** Rangée de maisons mitoyennes à toits pentus et cheminées. */
const townhouses: LandmarkFn = (b, cx, cz, y, rng) => {
  const count = rng.int(4, 5);
  const w = 4;
  const d = 6;
  const x0 = cx - Math.floor((count * w) / 2);
  for (let i = 0; i < count; i += 1) {
    const h = rng.int(6, 9);
    const bx = x0 + i * w;
    b.box(bx, y, cz - 3, w, h, d, 'structure', { shade: (rng.int(0, 2) - 1) * 0.07 });
    windows(b, bx, y, cz - 3, w, h, d, rng);
    gableRoof(b, bx, y + h, cz - 3, w, d);
    // Cheminée — le détail qui fait lire « rue », pas « immeuble ».
    if (rng.chance(0.7)) b.box(bx + rng.int(0, w - 1), y + h + 2, cz - 1, 1, 3, 1, 'structure', OVER);
    // Devanture éclairée au rez-de-chaussée.
    b.box(bx + 1, y + 1, cz + d - 4, w - 2, 1, 1, 'highlight', OVER);
  }
};

/** Village blanchi à la chaux : cubes accolés, quelques coupoles. */
const village: LandmarkFn = (b, cx, cz, y, rng) => {
  const houses = rng.int(6, 8);
  for (let i = 0; i < houses; i += 1) {
    const ang = (i / houses) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const dist = rng.range(1.5, 6.5);
    const hx = cx + Math.round(Math.cos(ang) * dist);
    const hz = cz + Math.round(Math.sin(ang) * dist);
    const w = rng.int(3, 5);
    const d = rng.int(3, 5);
    const h = rng.int(3, 6);
    const y0 = b.columnTop(hx, hz);
    if (y0 === 0) continue;
    b.box(hx, y0, hz, w, h, d, 'structure');
    windows(b, hx, y0, hz, w, h, d, rng);
    if (rng.chance(0.45)) {
      // Coupole : c'est elle qui donne l'accent coloré du village.
      b.disc(hx + w / 2 - 0.5, hz + d / 2 - 0.5, Math.min(w, d) / 2, y0 + h, 1, 'accent');
      b.disc(hx + w / 2 - 0.5, hz + d / 2 - 0.5, Math.min(w, d) / 2 - 1, y0 + h + 1, 1, 'accent');
    } else {
      b.box(hx - 1, y0 + h, hz - 1, w + 2, 1, d + 2, 'accent', OVER);
    }
  }
};

/** Viaduc et sa rame : rails sur piles, wagon éclairé. */
const tram: LandmarkFn = (b, cx, cz, y, rng) => {
  const len = rng.int(14, 18);
  const x0 = cx - Math.floor(len / 2);
  const deck = y + 5;
  for (let i = 0; i <= len; i += 4) {
    b.box(x0 + i, y, cz - 1, 2, 5, 3, 'structure');
  }
  b.box(x0, deck, cz - 1, len, 1, 3, 'accent');
  b.box(x0, deck + 1, cz - 1, len, 1, 1, 'structure');
  b.box(x0, deck + 1, cz + 1, len, 1, 1, 'structure');
  const car = x0 + rng.int(2, Math.max(2, len - 8));
  b.box(car, deck + 1, cz - 1, 6, 3, 3, 'accent', OVER);
  b.box(car + 1, deck + 2, cz + 2, 4, 1, 1, 'highlight', OVER);
  b.box(car, deck + 4, cz - 1, 6, 1, 3, 'structure', OVER);
};


/** Tour à toits étagés et auvents relevés. */
const pagoda: LandmarkFn = (b, cx, cz, y, rng) => {
  const tiers = rng.int(3, 4);
  b.box(cx - 3, y, cz - 3, 7, 2, 7, 'structure');
  b.box(cx - 4, y + 2, cz - 4, 9, 1, 9, 'accent', OVER);
  let width = 5;
  let level = y + 3;
  for (let t = 0; t < tiers; t += 1) {
    const o = Math.floor(width / 2);
    b.box(cx - o, level, cz - o, width, 3, width, 'structure');
    // Fenêtres du niveau.
    for (let i = -o + 1; i <= o - 1; i += 2) {
      b.place(cx + i, level + 1, cz + o, 'highlight', OVER);
      b.place(cx + o, level + 1, cz + i, 'highlight', OVER);
    }
    // Auvent : plus large que l'étage, avec les angles relevés — c'est le
    // débord et le relèvement qui donnent la silhouette, pas la couleur.
    b.box(cx - o - 2, level + 3, cz - o - 2, width + 4, 1, width + 4, 'accent', OVER);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.place(cx + sx * (o + 2), level + 4, cz + sz * (o + 2), 'accent', OVER);
      }
    }
    level += 4;
    width = Math.max(3, width - 2);
  }
  b.box(cx, level, cz, 1, 3, 1, 'highlight', OVER);
};

/** Château fort : donjon, courtines crénelées et tours d'angle. */
const castle: LandmarkFn = (b, cx, cz, y, rng) => {
  const half = rng.int(6, 7);
  // Courtines.
  b.shell(cx - half, y, cz - half, half * 2 + 1, 5, half * 2 + 1, 'structure');
  for (let i = -half; i <= half; i += 2) {
    b.place(cx + i, y + 5, cz - half, 'accent', OVER);
    b.place(cx + i, y + 5, cz + half, 'accent', OVER);
    b.place(cx - half, y + 5, cz + i, 'accent', OVER);
    b.place(cx + half, y + 5, cz + i, 'accent', OVER);
  }
  // Porte.
  b.carveBox(cx - 1, y, cz + half, 3, 3, 1);
  b.box(cx - 2, y + 3, cz + half, 5, 1, 1, 'accent', OVER);
  // Tours d'angle.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tx = cx + sx * half;
      const tz = cz + sz * half;
      b.disc(tx, tz, 2.2, y, 8, 'structure');
      b.ring(tx, tz, 2.6, 1.2, y + 8, 1, 'accent');
      for (let i = 0; i < 4; i += 1) {
        const s = 4 - i;
        b.disc(tx, tz, s / 2, y + 9 + i, 1, 'accent');
      }
    }
  }
  // Donjon.
  const keep = rng.int(9, 12);
  b.box(cx - 2, y, cz - 2, 5, keep, 5, 'structure');
  for (let i = -2; i <= 2; i += 2) b.place(cx + i, y + 2, cz + 2, 'highlight', OVER);
  b.box(cx - 3, y + keep, cz - 3, 7, 1, 7, 'accent', OVER);
  for (let i = 0; i < 4; i += 1) {
    const s = 5 - i;
    const o = Math.floor(s / 2);
    b.box(cx - o, y + keep + 1 + i, cz - o, s, 1, s, 'accent', OVER);
  }
};

/** Stupa : dôme sur base carrée, flèche annelée, mâts à fanions. */
const stupa: LandmarkFn = (b, cx, cz, y, rng) => {
  const base = rng.int(9, 11);
  const o = Math.floor(base / 2);
  b.box(cx - o, y, cz - o, base, 2, base, 'structure');
  b.box(cx - o + 1, y + 2, cz - o + 1, base - 2, 2, base - 2, 'structure');
  b.box(cx - o, y + 4, cz - o, base, 1, base, 'accent', OVER);
  const r = base / 2 - 1;
  const layers = Math.round(r) + 1;
  for (let i = 0; i <= layers; i += 1) {
    const lr = r * Math.sqrt(Math.max(0, 1 - ((i + 0.4) / (layers + 1)) ** 2));
    if (lr < 0.4) break;
    b.disc(cx, cz, lr, y + 5 + i, 1, 'structure');
  }
  const topY = y + 5 + layers;
  b.box(cx - 1, topY, cz - 1, 3, 1, 3, 'accent', OVER);
  for (let i = 0; i < 5; i += 1) {
    b.box(cx, topY + 1 + i, cz, 1, 1, 1, i % 2 === 0 ? 'accent' : 'highlight', OVER);
  }
  // Cordes à fanions tendues vers le sol.
  for (const [dx, dz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
  ]) {
    for (let i = 1; i <= 5; i += 1) {
      b.place(cx + dx * i, topY + 4 - i, cz + dz * i, 'highlight', OVER);
    }
  }
};

/** Marché : rangées d'étals sous auvents colorés. */
const market: LandmarkFn = (b, cx, cz, y, rng) => {
  const rows = rng.int(2, 3);
  const stalls = rng.int(3, 4);
  for (let r = 0; r < rows; r += 1) {
    const z = cz - 3 + r * 5;
    for (let s = 0; s < stalls; s += 1) {
      const x = cx - stalls * 2 + s * 4;
      b.box(x, y, z, 3, 1, 3, 'structure');
      b.box(x, y + 1, z, 1, 2, 1, 'structure');
      b.box(x + 2, y + 1, z + 2, 1, 2, 1, 'structure');
      // Auvent : c'est la nappe colorée qui fait lire l'étal.
      b.box(x - 1, y + 3, z - 1, 5, 1, 5, 'accent', OVER);
      if (rng.chance(0.6)) b.place(x + 1, y + 4, z + 1, 'highlight', OVER);
    }
  }
  // Guirlande tendue au-dessus de l'allée.
  if (rows > 1) {
    for (let x = cx - stalls * 2; x < cx + stalls * 2; x += 2) {
      b.place(x, y + 5, cz + 1, 'highlight', OVER);
    }
  }
};

/** Pont en dos d'âne : culées, tablier arqué, piles espacées. */
const bridge: LandmarkFn = (b, cx, cz, y, rng) => {
  const span = rng.int(11, 15);
  const half = Math.floor(span / 2);
  const rise = rng.int(3, 4);

  // Culées : les SEULS appuis posés au niveau du sol. Le reste du pont doit
  // rester en l'air, sinon le sous-bassement automatique (SceneBuilder.underpin)
  // lui coule un mur plein sur toute la longueur et on obtient un remblai.
  for (const s of [-1, 1]) {
    b.box(cx + s * half - 1, y, cz - 2, 3, 2, 5, 'structure');
    b.box(cx + s * half - 1, y + 2, cz - 2, 3, 1, 5, 'accent', OVER);
  }

  const deck = (i: number): number => y + 1 + Math.round(rise * (1 - (i / half) ** 2));

  for (let i = -half; i <= half; i += 1) {
    const h = deck(i);
    b.box(cx + i, h, cz - 2, 1, 1, 5, 'accent', OVER);
    // Parapets.
    b.place(cx + i, h + 1, cz - 2, 'structure', OVER);
    b.place(cx + i, h + 1, cz + 2, 'structure', OVER);
    if (Math.abs(i) % 4 === 2) {
      b.place(cx + i, h + 2, cz - 2, 'highlight', OVER);
      b.place(cx + i, h + 2, cz + 2, 'highlight', OVER);
    }
    // Piles, une tous les cinq mètres seulement — c'est le vide entre elles qui
    // fait lire un pont plutôt qu'un talus.
    if (Math.abs(i) % 5 === 0 && Math.abs(i) < half - 1) {
      for (let yy = y; yy < h; yy += 1) {
        b.place(cx + i, yy, cz - 1, 'structure');
        b.place(cx + i, yy, cz + 1, 'structure');
      }
    }
  }
};

/** Antenne parabolique sur son berceau. */
const dish: LandmarkFn = (b, cx, cz, y, rng) => {
  const r = rng.int(5, 6);
  b.box(cx - 2, y, cz - 2, 5, 4, 5, 'structure');
  b.box(cx - 1, y + 4, cz - 1, 3, 3, 3, 'structure');
  // Coupe parabolique inclinée : chaque anneau monte d'un cran en s'écartant.
  for (let i = 0; i <= r; i += 1) {
    b.ring(cx, cz, i + 0.6, 1.2, y + 7 + Math.round((i * i) / (r * 1.6)), 1, 'accent');
  }
  b.disc(cx, cz, 1.4, y + 7, 1, 'accent');
  // Contre-réflecteur au foyer.
  b.box(cx, y + 8, cz, 1, 3, 1, 'structure', OVER);
  b.place(cx, y + 11, cz, 'highlight', OVER);
};

/** Pas de tir : lanceur, portique de service et bras ombilical. */
const rocket: LandmarkFn = (b, cx, cz, y, rng) => {
  const h = rng.int(14, 18);
  // Table de lancement.
  b.box(cx - 4, y, cz - 4, 9, 2, 9, 'structure');
  b.box(cx - 4, y + 2, cz - 4, 9, 1, 9, 'accent', OVER);
  // Corps du lanceur.
  for (let i = 0; i < h; i += 1) {
    b.disc(cx, cz, 1.8, y + 3 + i, 1, i % 6 === 5 ? 'accent' : 'structure');
  }
  // Coiffe.
  for (let i = 0; i < 4; i += 1) b.disc(cx, cz, 1.8 - i * 0.45, y + 3 + h + i, 1, 'accent');
  b.place(cx, y + 7 + h, cz, 'highlight', OVER);
  // Ailerons.
  for (const [dx, dz] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ]) {
    for (let i = 0; i < 4; i += 1) b.place(cx + dx, y + 3 + i, cz + dz, 'accent', OVER);
  }
  // Portique de service et bras ombilical.
  b.box(cx + 5, y, cz - 1, 2, h, 2, 'structure');
  for (let i = 4; i < h; i += 5) b.box(cx + 2, y + i, cz, 3, 1, 1, 'highlight', OVER);
};

/** Grande roue : jante verticale épaisse, rayons clairsemés, nacelles. */
const ferriswheel: LandmarkFn = (b, cx, cz, y, rng) => {
  const r = rng.int(7, 9);
  const hub = y + r + 2;

  // Mâts porteurs en A, de part et d'autre du moyeu.
  for (const s of [-1, 1]) {
    for (let i = 0; i <= r + 1; i += 1) {
      const x = cx + Math.round((1 - i / (r + 1)) * 4) * s;
      b.box(x, y + i, cz - 1, 1, 1, 3, 'structure');
    }
  }
  b.box(cx - 1, hub - 1, cz - 2, 3, 3, 5, 'structure', OVER);

  // Jante : trois voxels d'épaisseur, sinon elle disparaît en vignette.
  const steps = 64;
  for (let k = 0; k < steps; k += 1) {
    const a = (k / steps) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * r);
    const py = hub + Math.round(Math.sin(a) * r);
    if (py < y) continue;
    for (let dz = -1; dz <= 1; dz += 1) b.place(px, py, cz + dz, 'accent', OVER);
  }

  // Rayons et nacelles : un sur huit, pour garder la roue ajourée.
  const arms = 8;
  for (let k = 0; k < arms; k += 1) {
    const a = (k / arms) * Math.PI * 2 + 0.2;
    for (let t = 0.2; t < 0.95; t += 0.1) {
      const sx = cx + Math.round(Math.cos(a) * r * t);
      const sy = hub + Math.round(Math.sin(a) * r * t);
      if (sy >= y) b.place(sx, sy, cz, 'structure');
    }
    const nx = cx + Math.round(Math.cos(a) * (r - 1));
    const ny = hub + Math.round(Math.sin(a) * (r - 1));
    if (ny > y) {
      for (let dz = -1; dz <= 1; dz += 1) b.place(nx, ny, cz + dz, 'highlight', OVER);
    }
  }
};

const LANDMARKS: Record<LandmarkKind, LandmarkFn> = {
  tower,
  clocktower,
  arch,
  dome,
  spire,
  statue,
  tree,
  palm,
  crane,
  ruin,
  billboard,
  pyramid,
  windmill,
  gate,
  amphitheatre,
  temple,
  lighthouse,
  smokestack,
  townhouses,
  village,
  tram,
  pagoda,
  castle,
  stupa,
  market,
  bridge,
  dish,
  rocket,
  ferriswheel,
};

export function buildLandmark(
  kind: LandmarkKind,
  b: SceneBuilder,
  cx: number,
  cz: number,
  baseY: number,
  rng: Rng,
): void {
  LANDMARKS[kind](b, cx, cz, baseY, rng);
}
