// features/player/library/ui/avatar/lookModel.ts — l'avatar personnalisable
// (lot 13 de docs/PLAN-womens-library.md), côté interface : le look
// enregistré d'une joueuse, sa forme compacte (moteur, présence), et l'état
// du formulaire de l'éditeur. Pur, testé seul ; aucune valeur du moteur ici
// (il reste dans son chunk chargé à la demande).

import {
  encodeLibraryLook,
  LIBRARY_LOOK_CHOICES,
  type LibraryAvatarLook,
  type LibraryLookField,
  parseLibraryLook,
  presetLibraryLook,
  sameLibraryLook,
} from '@/config/library/avatarLook';
import type { LibraryAvatarView } from '../../responses';

type AvatarLike = Pick<LibraryAvatarView, 'avatarId' | 'look'>;

/** Le look COMPOSÉ enregistré, ou null (la joueuse garde un avatar d'origine). */
export function savedLookOf(
  avatar: Pick<LibraryAvatarView, 'look'> | null | undefined
): LibraryAvatarLook | null {
  return avatar ? parseLibraryLook(avatar.look) : null;
}

/**
 * La forme compacte du look enregistré (moteur, présence), ou null : sans
 * look composé, l'avatar s'affiche par sa feuille `avatarId`.
 */
export function lookCodeOf(
  avatar: Pick<LibraryAvatarView, 'look'> | null | undefined
): string | null {
  const look = savedLookOf(avatar);
  return look ? encodeLibraryLook(look) : null;
}

/**
 * Le look de départ de l'éditeur : l'enregistré, sinon celui de l'avatar
 * d'origine (a01…a12), sinon le premier de chaque liste.
 */
export function editorStartLook(avatar: AvatarLike): LibraryAvatarLook {
  return (
    savedLookOf(avatar) ??
    presetLibraryLook(avatar.avatarId) ??
    (parseLibraryLook({
      v: 1,
      skin: LIBRARY_LOOK_CHOICES.skin[0],
      hair: LIBRARY_LOOK_CHOICES.hair[0],
      hairColor: LIBRARY_LOOK_CHOICES.hairColor[0],
      outfit: LIBRARY_LOOK_CHOICES.outfit[0],
      outfitColor: LIBRARY_LOOK_CHOICES.outfitColor[0],
      bottomColor: LIBRARY_LOOK_CHOICES.bottomColor[0],
    }) as LibraryAvatarLook)
  );
}

/** Le look avec un champ changé (valeur hors liste : inchangé). */
export function withChoice(
  look: LibraryAvatarLook,
  field: LibraryLookField,
  value: string
): LibraryAvatarLook {
  if (!LIBRARY_LOOK_CHOICES[field].includes(value)) return look;
  return (parseLibraryLook({ ...look, [field]: value }) ??
    look) as LibraryAvatarLook;
}

/** Le look a-t-il changé par rapport à l'enregistré (ou à l'avatar d'origine) ? */
export function lookChanged(
  draft: LibraryAvatarLook,
  avatar: AvatarLike
): boolean {
  const saved = savedLookOf(avatar);
  if (saved) return !sameLibraryLook(saved, draft);
  // Sans look composé : le brouillon égal au look d'origine ne change rien.
  const preset = presetLibraryLook(avatar.avatarId);
  return !preset || !sameLibraryLook(preset, draft);
}

/** La valeur suivante (ou précédente) d'une liste, en boucle : flèches du clavier. */
export function cycleChoice(
  field: LibraryLookField,
  current: string,
  step: 1 | -1
): string {
  const list = LIBRARY_LOOK_CHOICES[field];
  const i = list.indexOf(current);
  return list[
    ((((i < 0 ? 0 : i) + step) % list.length) + list.length) % list.length
  ];
}
