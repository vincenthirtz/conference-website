// Types partagés par les sous-composants de l'édition d'équipe.
// Extraits de pages/admin/teams/[teamId]/edit.tsx pour permettre la
// mémoïsation des sections lourdes (Membres, modales) sans dupliquer les shapes.

/** État du formulaire d'ajout/édition d'un membre. */
export type MemberFormState = {
  email: string;
  userId: string;
  role: string;
  battleTag: string;
  setCaptain: boolean;
  isSubstitute: boolean;
};

/** Résultat de la recherche de joueurs (API /api/admin/users/search). */
export type SearchResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  team_id: string | null;
  team_name: string | null;
};

/** Ligne de prévisualisation de l'import de BattleTags. */
export type ImportLine = {
  raw: string;
  key: string;
  tag: string;
  status: 'matched' | 'invalid' | 'not-found' | 'empty';
  memberId?: string;
  memberLabel?: string;
};
