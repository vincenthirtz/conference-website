// features/admin/tournaments/model.ts — formes de réponse lues par l'UI du
// site (page pool, client, hooks). Types seuls, sans import de service : le
// site les reçoit par la synchro inversée sans tirer le métier ni les
// repositories derrière (`service/pool.ts` les réexporte pour ses appelants).

export type AdminPoolEntry = {
  id: string;
  displayName: string;
  battleTag: string;
  originTeamId: string | null;
  originTeamName: string | null;
  createdAt: string;
  /** Ajoutée à la main par le staff, sans compte sur le site. */
  manual: boolean;
};

/** Une joueuse de l'effectif réel d'une équipe (`team_members`). */
export type AdminPoolRosterMember = {
  id: string;
  displayName: string;
  battleTag: string | null;
  isSubstitute: boolean;
};

export type AdminPoolView = {
  /** Titulaires d'une équipe (5v5) : une équipe en dessous est incomplète. */
  teamSize: number;
  /** Plafond de placement, remplaçantes comprises (rotations). */
  teamCapacity: number;
  squads: Array<{
    teamId: string;
    teamName: string;
    /** Équipe mixte créée pour l'événement (inactive, hors annuaire). */
    mixed: boolean;
    members: AdminPoolEntry[];
    /**
     * Effectif réel de l'équipe, hors coachs et managers : la seule trace de
     * ses joueuses quand elle a été inscrite sans passer par la liste
     * d'attente (`members` vide). Vide pour une équipe mixte.
     */
    roster: AdminPoolRosterMember[];
    /** A déjà un match dans ce tournoi : ne peut plus être dissoute. */
    hasMatches: boolean;
  }>;
  waitlist: AdminPoolEntry[];
  /** Joueuses retirées (désistement, doublon), les plus récentes d'abord. */
  withdrawn: AdminPoolEntry[];
  proposal: {
    squads: Array<
      | { kind: 'core'; teamId: string; teamName: string; entryIds: string[] }
      | { kind: 'mixed'; entryIds: string[] }
    >;
    leftoverIds: string[];
  };
};
