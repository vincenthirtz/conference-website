// utils/stages/stageOption.ts
//
// La forme d'une phase telle que `/api/admin/tournament/[id]/stages` la rend,
// réduite aux champs que les écrans d'administration consomment.
//
// POURQUOI CE N'EST PAS DANS L'ÉCRAN QUI S'EN SERT. `pages/admin/stages/
// [stageId].tsx` relisait ce même trio QUATRE fois, derrière un `(s: any)` à
// chaque endroit : phases sœurs pour l'avancement, phases cibles, phases
// sources d'auto-seed, et la liste des tournois. Quatre lectures de la même
// réponse, dont aucune ne se savait liée aux autres.
//
// Le déclarer ici plutôt que dans l'écran a une seconde raison, propre à ce
// dépôt : cet écran fait partie des fichiers gelés par
// `tests/unit/adminFileSizeGuard`, qui ne doivent plus grossir. Y ajouter un
// type — même utile — le fait grossir. Le sortir le fait rétrécir, et rend le
// type disponible aux autres écrans qui appellent la même route.

/**
 * Une phase de tournoi, vue depuis un menu de sélection.
 *
 * `stage_type` est nullable : une phase créée avant que le champ existe n'en
 * porte pas. Les écrans filtrent dessus (`['swiss', 'group', 'round_robin']`),
 * et un `null` doit simplement ne correspondre à rien — pas faire tomber le
 * filtre.
 */
export type StageOption = {
  id: string;
  name: string;
  stage_type: string | null;
};

/** Un tournoi, vu depuis un menu de sélection admin. */
export type TournamentOption = {
  id: string;
  name: string;
};
