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
};

export type AdminPoolView = {
  teamSize: number;
  squads: Array<{
    teamId: string;
    teamName: string;
    /** Équipe mixte créée pour l'événement (inactive, hors annuaire). */
    mixed: boolean;
    members: AdminPoolEntry[];
  }>;
  waitlist: AdminPoolEntry[];
  proposal: {
    squads: Array<
      | { kind: 'core'; teamId: string; teamName: string; entryIds: string[] }
      | { kind: 'mixed'; entryIds: string[] }
    >;
    leftoverIds: string[];
  };
};
