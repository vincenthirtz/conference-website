// types/adminTeamEdit.ts
//
// Types locaux de `pages/admin/teams/[teamId]/edit.tsx`, sortis de l'écran
// gelé par `tests/unit/adminFileSizeGuard.test.ts` (un god-component ne peut
// que maigrir). Aucun changement de forme.

export type TournamentRow = {
  id: string;
  name: string;
  slug: string;
  game: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  max_teams?: number | null;
  min_players?: number | null;
};

export type TournamentRegistration = TournamentRow & {
  stages: Array<{
    stageId: string;
    stageName: string;
    stageType: string;
  }>;
};
