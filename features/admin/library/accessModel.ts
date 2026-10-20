// features/admin/library/accessModel.ts — réponses de l'ACCÈS à la Women's
// Library (`/api/admin/library/access`, lot 14c de docs/PLAN-womens-library.md,
// conference-website), lues par le panneau « Accès à la Library » de l'onglet
// Library du hub de modération (copie synchronisée). Types PURS.

import type { LibraryAccessMode } from './accessSchemas';

/** Une équipe de la liste. */
export type LibraryAccessTeam = {
  id: string;
  /** `null` : l'équipe n'existe plus dans l'espace. */
  name: string | null;
  /** Supprimée (ou introuvable) : ses membres n'entrent plus. */
  deleted: boolean;
  /** Membres ACCEPTÉES aujourd'hui (celles qui entrent). */
  acceptedMembers: number;
};

/** Une joueuse de la liste. */
export type LibraryAccessPlayer = {
  userId: string;
  /** Son pseudo de la Library ; `null` tant qu'elle n'y est pas entrée. */
  nickname: string | null;
};

/** Les modes que `LIBRARY_ACCESS` (variable de l'API) peut imposer. */
export type LibraryAccessEnvMode = Exclude<LibraryAccessMode, 'beta'>;

/** GET / PUT /api/admin/library/access. */
export type LibraryAccessResponse = {
  /** Le mode RÉGLÉ pour l'espace (ce que le panneau édite). */
  mode: LibraryAccessMode;
  /** Version du réglage, à renvoyer telle quelle au PUT. */
  rev: number;
  /**
   * La valeur stockée était illisible : la porte applique `owner` jusqu'au
   * prochain enregistrement, qui la remplace.
   */
  invalid: boolean;
  /**
   * `LIBRARY_ACCESS` est posée sur l'API : elle décide À LA PLACE du réglage
   * (dérogation d'urgence). `null` : le réglage décide.
   */
  envOverride: LibraryAccessEnvMode | null;
  /** Le mode que la porte applique en ce moment. */
  effectiveMode: LibraryAccessMode;
  teams: LibraryAccessTeam[];
  players: LibraryAccessPlayer[];
};

/** Codes des refus que le panneau traduit. */
export const LIBRARY_ACCESS_ADMIN_CODES = {
  /** Quelqu'un a enregistré entre-temps : relire avant de réécrire. */
  conflict: 'library_access_conflict',
  /** Une équipe ajoutée n'existe pas dans l'espace, ou est supprimée. */
  teamNotFound: 'team_not_found',
  /** Un pseudo ne correspond à aucun avatar de l'espace. */
  playerNotFound: 'player_not_found',
  /** Trop de joueuses une fois les pseudos résolus. */
  tooMany: 'library_access_too_many',
} as const;
