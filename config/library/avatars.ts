// config/library/avatars.ts — les avatars qu'une joueuse peut choisir dans la
// Women's Library (lot 2 de docs/PLAN-womens-library.md, conference-website).
//
// Douze avatars en v1, faits maison : `tools/library-assets/render_avatar.py`
// (site) rend une feuille de sprites par identifiant, d'après
// `tools/library-assets/sources.json`. Un identifiant ajouté ici sans son rendu
// afficherait un avatar vide : les deux listes avancent ensemble.
//
// La personnalisation libre (lot 13 : carnation, coiffure, tenue et leurs
// couleurs, par calques) vit dans `library_avatars.look`, avec ses listes
// fermées dans `./avatarLook.ts`. Ces douze identifiants y deviennent des
// looks PRÉDÉFINIS, et restent le repli (sprite entier) partout où un look
// ne peut pas être dessiné.
//
// Module PUR (aucun import) : il est recopié tel quel dans le site.

export const LIBRARY_AVATAR_IDS = [
  'a01',
  'a02',
  'a03',
  'a04',
  'a05',
  'a06',
  'a07',
  'a08',
  'a09',
  'a10',
  'a11',
  'a12',
] as const;
export type LibraryAvatarId = (typeof LIBRARY_AVATAR_IDS)[number];

/** L'avatar donné à la création de la ligne, avant tout choix. */
export const DEFAULT_LIBRARY_AVATAR_ID: LibraryAvatarId = 'a01';

const IDS: ReadonlySet<string> = new Set(LIBRARY_AVATAR_IDS);

export function isLibraryAvatarId(value: unknown): value is LibraryAvatarId {
  return typeof value === 'string' && IDS.has(value);
}
