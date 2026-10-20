// config/library/avatarLook.ts — l'avatar personnalisable de la Women's
// Library (lot 13 de docs/PLAN-womens-library.md, conference-website).
//
// Un avatar se compose de CALQUES : le corps (une carnation), la coiffure et
// sa couleur, la tenue (un haut et un bas) et ses deux couleurs. Ce module
// porte :
//   - les listes FERMÉES de chaque calque et de chaque palette ;
//   - le LOOK, objet borné enregistré dans `library_avatars.look`
//     (`{ v: 1, skin, hair, hairColor, outfit, outfitColor, bottomColor }`) ;
//   - sa forme COMPACTE pour la présence temps réel (7 caractères) ;
//   - les looks PRÉDÉFINIS des douze avatars d'origine (a01…a12) : une joueuse
//     qui n'a rien composé garde son apparence, et `avatarId` reste le repli
//     partout où un look manque.
//
// ORDRE FIGÉ. La forme compacte code la POSITION dans chaque liste (un
// caractère base 36 par champ). On AJOUTE en fin de liste ; on ne retire ni
// ne réordonne jamais un élément (36 au plus par liste). Changer cette règle,
// c'est changer `LIBRARY_LOOK_VERSION`.
//
// Les calques sont rendus par `tools/library-assets/render_avatar.py` (site),
// en niveaux de gris pour la coiffure et la tenue : la couleur est posée dans
// le navigateur. Un identifiant ajouté ici sans son calque rendu retombe sur
// l'avatar `avatarId` (le site vérifie la parité dans ses tests).
//
// Module PUR (aucun import de valeur) : il est recopié tel quel dans le site.

import type { LibraryAvatarId } from './avatars';

/** Version de la forme du look ET de son codage compact. */
export const LIBRARY_LOOK_VERSION = 1;

/** Une couleur d'une palette : identifiant stable, sRGB 0-255. */
export type LibraryLookColor = {
  readonly id: string;
  readonly rgb: readonly [number, number, number];
};

/** Carnations, de la plus claire à la plus foncée (rendues en couleur). */
export const LIBRARY_LOOK_SKINS = [
  { id: 's1', rgb: [236, 200, 178] },
  { id: 's2', rgb: [222, 180, 150] },
  { id: 's3', rgb: [198, 150, 118] },
  { id: 's4', rgb: [168, 118, 84] },
  { id: 's5', rgb: [128, 84, 58] },
  { id: 's6', rgb: [88, 56, 40] },
] as const satisfies readonly LibraryLookColor[];

/**
 * Coiffures. `headscarf` (foulard couvrant cheveux et cou) prend la couleur
 * des cheveux comme couleur de tissu.
 */
export const LIBRARY_LOOK_HAIRS = [
  'short',
  'bob',
  'long',
  'bun',
  'ponytail',
  'curly',
  'braid',
  'afro',
  'twin_buns',
  'headscarf',
] as const;

export const LIBRARY_LOOK_HAIR_COLORS = [
  { id: 'black', rgb: [20, 16, 14] },
  { id: 'espresso', rgb: [52, 34, 24] },
  { id: 'chestnut', rgb: [96, 58, 34] },
  { id: 'auburn', rgb: [130, 52, 28] },
  { id: 'copper', rgb: [176, 90, 44] },
  { id: 'honey', rgb: [196, 160, 104] },
  { id: 'platinum', rgb: [226, 212, 178] },
  { id: 'silver', rgb: [170, 170, 172] },
  { id: 'violet', rgb: [104, 60, 140] },
  { id: 'rose', rgb: [214, 120, 160] },
  { id: 'blue', rgb: [60, 96, 170] },
  { id: 'teal', rgb: [40, 130, 130] },
] as const satisfies readonly LibraryLookColor[];

/**
 * Tenues : TOUTES couvrent du cou aux chevilles (décision du plan) — un haut
 * (manches courtes au moins) et un pantalon long. Le haut prend
 * `outfitColor`, le bas `bottomColor`.
 */
export const LIBRARY_LOOK_OUTFITS = [
  'tee',
  'longsleeve',
  'turtleneck',
  'tunic',
  'sweater',
  'blouse',
  'coat',
  'kurta',
  'joggers',
  'track',
] as const;

export const LIBRARY_LOOK_OUTFIT_COLORS = [
  { id: 'white', rgb: [236, 236, 232] },
  { id: 'black', rgb: [30, 30, 34] },
  { id: 'grey', rgb: [140, 140, 145] },
  { id: 'charcoal', rgb: [100, 100, 105] },
  { id: 'navy', rgb: [38, 52, 88] },
  { id: 'sky', rgb: [110, 160, 210] },
  { id: 'teal', rgb: [40, 130, 130] },
  { id: 'forest', rgb: [44, 92, 62] },
  { id: 'olive', rgb: [80, 90, 60] },
  { id: 'beige', rgb: [190, 170, 140] },
  { id: 'camel', rgb: [150, 104, 62] },
  { id: 'mustard', rgb: [210, 170, 60] },
  { id: 'coral', rgb: [230, 110, 90] },
  { id: 'red', rgb: [170, 40, 50] },
  { id: 'raspberry', rgb: [180, 60, 110] },
  { id: 'purple', rgb: [120, 70, 170] },
] as const satisfies readonly LibraryLookColor[];

export type LibraryLookSkinId = (typeof LIBRARY_LOOK_SKINS)[number]['id'];
export type LibraryLookHairId = (typeof LIBRARY_LOOK_HAIRS)[number];
export type LibraryLookHairColorId =
  (typeof LIBRARY_LOOK_HAIR_COLORS)[number]['id'];
export type LibraryLookOutfitId = (typeof LIBRARY_LOOK_OUTFITS)[number];
export type LibraryLookOutfitColorId =
  (typeof LIBRARY_LOOK_OUTFIT_COLORS)[number]['id'];

export type LibraryAvatarLook = {
  v: typeof LIBRARY_LOOK_VERSION;
  skin: LibraryLookSkinId;
  hair: LibraryLookHairId;
  hairColor: LibraryLookHairColorId;
  outfit: LibraryLookOutfitId;
  outfitColor: LibraryLookOutfitColorId;
  bottomColor: LibraryLookOutfitColorId;
};

/** Les champs du look, dans l'ordre de la forme compacte. */
export const LIBRARY_LOOK_FIELDS = [
  'skin',
  'hair',
  'hairColor',
  'outfit',
  'outfitColor',
  'bottomColor',
] as const;
export type LibraryLookField = (typeof LIBRARY_LOOK_FIELDS)[number];

const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);

/** Les valeurs permises de chaque champ, dans l'ordre FIGÉ. */
export const LIBRARY_LOOK_CHOICES: Readonly<
  Record<LibraryLookField, readonly string[]>
> = {
  skin: ids(LIBRARY_LOOK_SKINS),
  hair: LIBRARY_LOOK_HAIRS,
  hairColor: ids(LIBRARY_LOOK_HAIR_COLORS),
  outfit: LIBRARY_LOOK_OUTFITS,
  outfitColor: ids(LIBRARY_LOOK_OUTFIT_COLORS),
  bottomColor: ids(LIBRARY_LOOK_OUTFIT_COLORS),
};

/** Longueur maximale d'un look compact accepté à la lecture (présence). */
export const LIBRARY_LOOK_CODE_MAX = 16;
const CODE_RE = /^[0-9a-z]+$/;
const KEYS = new Set<string>(['v', ...LIBRARY_LOOK_FIELDS]);

/**
 * Un look valide, ou null. Exige EXACTEMENT les clés du look (aucune autre),
 * la version courante et des valeurs des listes fermées.
 */
export function parseLibraryLook(value: unknown): LibraryAvatarLook | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length !== KEYS.size || keys.some((k) => !KEYS.has(k))) return null;
  if (rec.v !== LIBRARY_LOOK_VERSION) return null;
  for (const field of LIBRARY_LOOK_FIELDS) {
    const v = rec[field];
    if (typeof v !== 'string' || !LIBRARY_LOOK_CHOICES[field].includes(v))
      return null;
  }
  return {
    v: LIBRARY_LOOK_VERSION,
    skin: rec.skin as LibraryLookSkinId,
    hair: rec.hair as LibraryLookHairId,
    hairColor: rec.hairColor as LibraryLookHairColorId,
    outfit: rec.outfit as LibraryLookOutfitId,
    outfitColor: rec.outfitColor as LibraryLookOutfitColorId,
    bottomColor: rec.bottomColor as LibraryLookOutfitColorId,
  };
}

/** Forme compacte : `1` puis un caractère base 36 par champ (7 caractères). */
export function encodeLibraryLook(look: LibraryAvatarLook): string {
  let out = String(LIBRARY_LOOK_VERSION);
  for (const field of LIBRARY_LOOK_FIELDS) {
    const i = LIBRARY_LOOK_CHOICES[field].indexOf(look[field]);
    if (i < 0) throw new Error(`look: ${field} inconnu`);
    out += i.toString(36);
  }
  return out;
}

/** Look d'une forme compacte, ou null (autre version, index hors liste…). */
export function decodeLibraryLook(code: unknown): LibraryAvatarLook | null {
  if (typeof code !== 'string' || code.length > LIBRARY_LOOK_CODE_MAX)
    return null;
  if (!CODE_RE.test(code)) return null;
  const version = String(LIBRARY_LOOK_VERSION);
  if (code.length !== version.length + LIBRARY_LOOK_FIELDS.length) return null;
  if (!code.startsWith(version)) return null;
  const out: Record<string, unknown> = { v: LIBRARY_LOOK_VERSION };
  for (let k = 0; k < LIBRARY_LOOK_FIELDS.length; k++) {
    const field = LIBRARY_LOOK_FIELDS[k];
    const index = Number.parseInt(code[version.length + k], 36);
    const choice = LIBRARY_LOOK_CHOICES[field][index];
    if (choice === undefined) return null;
    out[field] = choice;
  }
  return parseLibraryLook(out);
}

/** Deux looks identiques ? */
export function sameLibraryLook(
  a: LibraryAvatarLook,
  b: LibraryAvatarLook
): boolean {
  return LIBRARY_LOOK_FIELDS.every((f) => a[f] === b[f]);
}

const preset = (
  skin: LibraryLookSkinId,
  hair: LibraryLookHairId,
  hairColor: LibraryLookHairColorId,
  outfit: LibraryLookOutfitId,
  outfitColor: LibraryLookOutfitColorId,
  bottomColor: LibraryLookOutfitColorId
): LibraryAvatarLook => ({
  v: LIBRARY_LOOK_VERSION,
  skin,
  hair,
  hairColor,
  outfit,
  outfitColor,
  bottomColor,
});

/**
 * Les douze avatars d'origine en looks (tools/library-assets/sources.json du
 * site). Les bas courts d'origine (corsaire) deviennent un pantalon long.
 */
export const LIBRARY_AVATAR_PRESETS: Readonly<
  Record<LibraryAvatarId, LibraryAvatarLook>
> = {
  a01: preset('s3', 'bob', 'espresso', 'tee', 'raspberry', 'navy'),
  a02: preset('s6', 'curly', 'black', 'tee', 'mustard', 'black'),
  a03: preset('s1', 'long', 'honey', 'longsleeve', 'sky', 'beige'),
  a04: preset('s5', 'ponytail', 'black', 'tee', 'purple', 'charcoal'),
  a05: preset('s2', 'short', 'auburn', 'tee', 'white', 'olive'),
  a06: preset('s4', 'bun', 'espresso', 'longsleeve', 'teal', 'navy'),
  a07: preset('s6', 'short', 'black', 'tee', 'coral', 'beige'),
  a08: preset('s1', 'ponytail', 'chestnut', 'longsleeve', 'black', 'charcoal'),
  a09: preset('s3', 'long', 'black', 'tee', 'red', 'navy'),
  a10: preset('s5', 'curly', 'chestnut', 'longsleeve', 'white', 'black'),
  a11: preset('s2', 'bob', 'violet', 'tee', 'navy', 'beige'),
  a12: preset('s4', 'long', 'chestnut', 'tee', 'grey', 'olive'),
};

/** Le look prédéfini d'un avatar d'origine, ou null (identifiant inconnu). */
export function presetLibraryLook(avatarId: string): LibraryAvatarLook | null {
  return Object.hasOwn(LIBRARY_AVATAR_PRESETS, avatarId)
    ? LIBRARY_AVATAR_PRESETS[avatarId as LibraryAvatarId]
    : null;
}

/** Poids de ressemblance, du plus marquant (la carnation) au moins marquant. */
const RESEMBLANCE: Readonly<Record<LibraryLookField, number>> = {
  skin: 16,
  hair: 8,
  hairColor: 4,
  outfitColor: 2,
  outfit: 1,
  bottomColor: 1,
};

/**
 * L'avatar d'origine le plus proche d'un look : le repli `avatarId` (sprite
 * entier) partout où le look ne peut pas être dessiné. À égalité, la
 * carnation la plus proche, puis l'ordre des identifiants.
 */
export function nearestLibraryAvatarId(
  look: LibraryAvatarLook
): LibraryAvatarId {
  const skinIndex = (s: string) => LIBRARY_LOOK_CHOICES.skin.indexOf(s);
  let best: { id: LibraryAvatarId; score: number; skinGap: number } | null =
    null;
  for (const [id, p] of Object.entries(LIBRARY_AVATAR_PRESETS) as [
    LibraryAvatarId,
    LibraryAvatarLook,
  ][]) {
    let score = 0;
    for (const field of LIBRARY_LOOK_FIELDS)
      if (p[field] === look[field]) score += RESEMBLANCE[field];
    const skinGap = Math.abs(skinIndex(p.skin) - skinIndex(look.skin));
    if (
      !best ||
      score > best.score ||
      (score === best.score && skinGap < best.skinGap)
    )
      best = { id, score, skinGap };
  }
  return (best as { id: LibraryAvatarId }).id;
}

/** Un look au hasard (`rand` : [0, 1[), pour le bouton « au hasard ». */
export function randomLibraryLook(rand: () => number): LibraryAvatarLook {
  const pick = (field: LibraryLookField) => {
    const list = LIBRARY_LOOK_CHOICES[field];
    return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  };
  const out: Record<string, unknown> = { v: LIBRARY_LOOK_VERSION };
  for (const field of LIBRARY_LOOK_FIELDS) out[field] = pick(field);
  return parseLibraryLook(out) as LibraryAvatarLook;
}
