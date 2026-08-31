// Types partagés par les sous-composants mémoïsés de `pages/admin/teams/my.tsx`.
// Extraits tels quels de la page (aucun changement de shape) pour permettre
// la mémoïsation du roster et des résultats de recherche sans dupliquer les
// définitions.

export type Member = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  role: string | null;
  battle_tag?: string | null;
  /** SR Overwatch déclaré (cf. utils/overwatchRank.ts), null si non renseigné. */
  skill_rating?: number | null;
  is_substitute?: boolean | null;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

export type SearchResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  has_team: boolean;
};
