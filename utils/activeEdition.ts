// utils/activeEdition.ts
// Source unique de vérité pour l'édition « active » du tournoi féminin côté
// pages publiques (inscription, espace capitaine, etc.).
//
// ⚙️  Pour basculer sur l'édition 2027 :
//   - Remplace la valeur ci-dessous par l'UUID du nouveau tournoi, OU
//   - (piste recommandée à terme) expose un `site_setting` en base lu par
//     getServerSideProps (cf. la lecture de `homepage_event_date` dans
//     pages/index.tsx) pour ne plus avoir à redéployer pour changer d'édition.
//     On garde ici une constante simple pour rester sans appel DB côté pages
//     statiques tant que l'édition ne change qu'une fois par an.
//
// NB : cet UUID est aussi le DEFAULT_CURRENT_TOURNAMENT_ID utilisé par le
// résolveur admin (utils/currentTournament.ts). Les deux doivent rester
// alignés lors d'un changement d'édition.

/** UUID du tournoi féminin de l'édition en cours (2026). */
export const ACTIVE_WOMEN_TOURNAMENT_ID =
  'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
