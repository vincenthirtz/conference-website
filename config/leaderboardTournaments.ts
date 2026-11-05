// config/leaderboardTournaments.ts
//
// Les tournois qui ont leur onglet sur la page Classement (pages/leaderboard.tsx),
// en tête de la barre et dans cet ordre ; la page s'ouvre sur le premier qui a
// des résultats. Choix de la propriétaire du 2026-11-05 : les deux éditions de
// la Women's Cup, la plus récente d'abord.
//
// POURQUOI UN FICHIER ET PAS UN RÉGLAGE ADMIN. Deux ou trois tournois phares,
// qui changent une fois par an. Et l'identifiant écrit ici épargne au site une
// lecture directe de plus dans la base (tests/unit/dbDirectReadsGuard.test.ts).

export type LeaderboardTournament = {
  /** UUID du tournoi : filtre l'historique des ratings (`tournament_id`). */
  id: string;
  /** Slug : lien vers sa fiche. */
  slug: string;
  /** Libellé de l'onglet. */
  label: string;
  /** Nom du tournoi dans la légende du tableau. */
  name: string;
};

export const LEADERBOARD_TOURNAMENTS: readonly LeaderboardTournament[] = [
  {
    id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
    slug: 'ow-womens-cup-2026',
    label: 'OWWC 2026',
    name: "OW Women's Cup 2026",
  },
  {
    id: '734b6fdb-dfe8-4565-a6b3-38c6423d0929',
    slug: 'ow-womens-cup-2025',
    label: 'OWWC 2025',
    name: "OW Women's Cup 2025",
  },
];
