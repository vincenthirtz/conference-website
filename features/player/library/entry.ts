// features/player/library/entry.ts — les POINTS D'ENTRÉE de la Women's Library
// (lien du menu compte `PLAYER_LINKS`, tuile de l'écran TCG) ne se montrent
// que si `NEXT_PUBLIC_LIBRARY_ENTRY` vaut `1`.
//
// Bêta fermée : l'API ne laisse entrer que la propriétaire de l'association
// (`LIBRARY_ACCESS`, conference-api). Un lien que presque toutes les joueuses
// verraient déboucher sur « pas encore ouverte » serait une fausse promesse ;
// la propriétaire, elle, passe par l'adresse directe `/player/library`.
//
// Figée au BUILD (`NEXT_PUBLIC_*`) : la changer demande un redéploiement.
// Ce drapeau ne protège rien — l'API refuse de toute façon (403
// `LIBRARY_CLOSED`) ; il ne fait que taire les entrées.

/** Vrai si les entrées de la Library sont affichées (`'1'` seulement). */
export function isLibraryEntryEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_LIBRARY_ENTRY
): boolean {
  return value === '1';
}
