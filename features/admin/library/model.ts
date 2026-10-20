// features/admin/library/model.ts — réponses de `/api/admin/library/bans`
// (lot 5 de docs/PLAN-womens-library.md, conference-website), lues par le
// panneau « Library » du hub de modération (copie synchronisée). Types PURS.

export type LibraryBanItem = {
  id: string;
  /**
   * Compte banni ; `null` quand le compte a été SUPPRIMÉ (lot 14b) : le
   * bannissement continue de s'appliquer par les empreintes d'identité de la
   * personne (jamais exposées), et se lève par son `id`.
   */
  userId: string | null;
  /** Pseudo de la Library ; `null` si son avatar n'existe plus. */
  nickname: string | null;
  reason: string | null;
  /** `null` = définitif. */
  until: string | null;
  createdAt: string;
  /** Membre du staff qui a décidé ; `null` s'il a quitté le staff. */
  byStaffId: string | null;
  /** En cours à l'heure de la lecture. */
  active: boolean;
};

/** GET. */
export type LibraryBanListResponse = { items: LibraryBanItem[]; total: number };

/** POST (201). */
export type LibraryBanCreateResponse = { ban: LibraryBanItem };

/**
 * DELETE : nombre de bannissements en cours levés (0 = aucun). Par compte
 * (`?userId=`) : `userId` est ce compte. Par bannissement (`?id=`) : `userId`
 * est celui du bannissement levé, `null` si son compte a été supprimé (ou si
 * rien n'a été levé).
 */
export type LibraryBanLiftResponse = { userId: string | null; lifted: number };

/** Codes des refus que le panneau traduit. */
export const LIBRARY_BAN_CODES = {
  playerNotFound: 'player_not_found',
  untilInPast: 'until_in_past',
} as const;
