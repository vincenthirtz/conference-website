// features/player/library/teamHqResponses.ts — réponses des routes « QG
// d'équipe » de la Women's Library (lot 9 de docs/PLAN-womens-library.md,
// conference-website), lues par le site (copie synchronisée).
//
// Types et constantes PURS, comme `./responses.ts` : le site ne tire jamais un
// `service/` ni un `repository/` (apiOwnershipGuard).

import type { LibraryApartmentItem } from './responses';

/** `GET /api/player/library/team-hq` — une équipe dont je suis membre acceptée. */
export type LibraryTeamHqEntry = {
  teamId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  /** `null` = le QG n'existe pas encore : il naît à la première visite. */
  roomId: string | null;
};

/** `GET /api/player/library/team-hq`. */
export type LibraryTeamHqListResponse = {
  teams: LibraryTeamHqEntry[];
  /**
   * MES meubles prêtés à un QG, quel qu'il soit : ils ne peuvent pas être
   * posés ailleurs en même temps (l'appartement les refuse,
   * `item_placed_elsewhere`).
   */
  lentInventoryIds: string[];
};

/** `POST /api/player/library/team-hq`. */
export type LibraryTeamHqOpenResponse = {
  roomId: string;
  teamId: string;
  /** Vrai si cette requête a créé le QG. */
  created: boolean;
};

/**
 * Le prochain match de l'équipe, tel que le panneau du QG l'affiche : la
 * section du tableau de bord joueuse (`loadNextMatch`), SANS le jeton de
 * check-in (on pointe depuis le tableau de bord, pas depuis la Library).
 */
export type LibraryTeamHqNextMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  roundName: string | null;
  bestOf: number | null;
  streamUrl: string | null;
  opponent: { id: string; name: string } | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    opensAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
    alreadyCheckedIn: boolean;
  } | null;
};

/** Un meuble prêté au QG : sa case, sa clé, sa propriétaire. */
export type LibraryLentItem = LibraryApartmentItem & {
  ownerUserId: string;
  /** `null` si son avatar n'existe plus, ou si l'une a bloqué l'autre. */
  ownerNickname: string | null;
  /** C'est l'un de MES meubles. */
  mine: boolean;
};

/** `GET /api/player/library/team-hq/{roomId}` — le panneau du QG. */
export type LibraryTeamHqSummaryResponse = {
  roomId: string;
  /** Version des meubles posés (avancée à chaque prêt, déplacement, retour). */
  version: number;
  /** Dimensions en cases de 0,5 m. */
  width: number;
  depth: number;
  team: {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    slug: string | null;
  };
  /** `null` : aucun match à venir (ou lecture en échec, jamais bloquante). */
  nextMatch: LibraryTeamHqNextMatch | null;
  /**
   * La porte vers le salon Discord de l'équipe (`teams.discord_channel_id`,
   * serveur principal de l'espace). `null` : pas de salon, ou pas de serveur.
   */
  discordUrl: string | null;
  items: LibraryLentItem[];
  /**
   * MES meubles posés nulle part : ceux que je peux prêter. Vide pour le staff
   * qui n'est pas membre (on ne prête qu'au QG de son équipe).
   */
  lendable: Array<{ inventoryId: string; key: string }>;
  me: {
    /** Membre acceptée de l'équipe : elle prête, déplace, reprend SES meubles. */
    member: boolean;
    /** Staff de l'espace : il entre, il ne prête pas. */
    staff: boolean;
    /** Capitaine ou manager : rend à sa propriétaire n'importe quel meuble prêté. */
    canReturnAny: boolean;
  };
};

/** `PUT /api/player/library/team-hq/{roomId}/items`. */
export type LibraryTeamHqLendResponse = {
  version: number;
  item: LibraryLentItem;
  /** Vrai si le meuble était déjà prêté ici : il a été déplacé. */
  moved: boolean;
};

/** `DELETE /api/player/library/team-hq/{roomId}/items`. */
export type LibraryTeamHqReturnResponse = {
  returned: true;
  inventoryId: string;
  version: number;
};

/** Codes des refus propres au QG que l'interface traduit. */
export const LIBRARY_TEAM_HQ_CODES = {
  /** Équipe inconnue dans l'espace, ou dissoute. */
  teamNotFound: 'team_not_found',
  /** Prêter suppose d'être membre acceptée de l'équipe (le staff entre seulement). */
  membersOnly: 'team_hq_members_only',
  /** Aucune place libre pour ce meuble (placement automatique). */
  noSpace: 'team_hq_no_space',
  /** Le QG a atteint son plafond de meubles posés. */
  full: 'team_hq_full',
  /** Ce meuble n'est pas prêté à ce QG. */
  itemNotLent: 'item_not_lent',
  /** Seules sa propriétaire, la capitaine et les managers rendent un meuble. */
  returnForbidden: 'return_forbidden',
} as const;
