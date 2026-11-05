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

import { mediaPublicUrl } from '@/utils/storage/mediaUrl';

/** Une ligne du classement final des équipes (onglet « Équipes »). */
export type LeaderboardTeam = {
  rank: number;
  name: string;
  /** Slug de l'équipe : lien vers sa fiche (`/team/<slug>`). */
  slug: string | null;
  logoUrl: string | null;
};

export type LeaderboardTournament = {
  /** UUID du tournoi : filtre l'historique des ratings (`tournament_id`). */
  id: string;
  /** Slug : lien vers sa fiche. */
  slug: string;
  /** Libellé de l'onglet. */
  label: string;
  /** Nom du tournoi dans la légende du tableau. */
  name: string;
  /** Page du résultat complet, sous le classement des équipes. */
  resultsHref: string;
  /**
   * Classement final des équipes quand il n'est PAS figé en base. Sinon, il se
   * lit dans `final_rankings` (écrit par la finalisation admin).
   */
  teamRanking?: readonly LeaderboardTeam[];
};

export const LEADERBOARD_TOURNAMENTS: readonly LeaderboardTournament[] = [
  {
    id: 'e8fa740c-d92b-49d8-a654-05a37d0eea3b',
    slug: 'ow-womens-cup-2026',
    label: 'OWWC 2026',
    name: "OW Women's Cup 2026",
    resultsHref: '/tournament/ow-womens-cup-2026/podium',
  },
  {
    id: '734b6fdb-dfe8-4565-a6b3-38c6423d0929',
    slug: 'ow-womens-cup-2025',
    label: 'OWWC 2025',
    name: "OW Women's Cup 2025",
    resultsHref: '/tournoi',
    // L'édition 2025 n'a jamais été finalisée, et la finaliser aujourd'hui
    // rejouerait ses effets un an après (récompenses TCG, rôles Discord du
    // podium, annonce du bot). Son classement, qui ne bougera plus, est donc
    // écrit ici : poule à 4 puis finale, Hinode Sparkles 3–0 Onna Bugeisha,
    // identique à la page /tournoi. Noms et logos ACTUELS des équipes, choix
    // de la propriétaire du 2026-11-05 (en 2025, Hinode Sparkles et Venom
    // Valkyries s'appelaient Sparkles et Phénix).
    teamRanking: [
      {
        rank: 1,
        name: 'Hinode Sparkles',
        slug: 'hinode-sparkles',
        logoUrl: '/img/teams-images/hinode-sparkles.png',
      },
      {
        rank: 2,
        name: 'Onna Bugeisha',
        slug: 'onna-bugeisha',
        logoUrl: '/img/teams-images/onna.png',
      },
      {
        rank: 3,
        name: 'Avoidgers',
        slug: 'avoidgers',
        logoUrl: '/img/teams-images/avoidgers.png',
      },
      {
        rank: 4,
        name: 'Venom Valkyries',
        slug: 'phenix',
        logoUrl: mediaPublicUrl('VV_blanc-512-25980b24c3d5bea4.webp'),
      },
    ],
  },
];
