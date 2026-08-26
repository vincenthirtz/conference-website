// lib/i18n/locales/fr/tournoiPage.ts
//
// Traductions FRANCAISES du namespace `tournoiPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournoiPage', {
  eyebrow: 'Tournoi',
  heroTitle: 'Round Robin & Finale',
  heroSubtitle:
    '4 équipes, 6 matchs de poules en BO3, puis une grande finale en BO5 pour couronner la championne.',
  teamPlaceholder: 'Équipe {number}',
  teamsTab: 'Equipes',
  teamsHeading: 'Des équipes au rendez-vous',
  teamsSubtitle: 'Tout niveau et de plusieurs nationalités.',
  standingsHeading: 'Classement (Round Robin)',
  colTeam: 'Équipe',
  colMJ: 'MJ',
  colMJTitle: 'Matchs joués',
  colV: 'V',
  colVTitle: 'Victoires',
  colD: 'D',
  colDTitle: 'Défaites',
  colMaps: 'Maps',
  colMapsTitle: 'Maps gagnées-perdues',
  colDiff: 'Diff',
  colDiffTitle: 'Différence de maps',
  tiebreakers: 'Tiebreakers: Victoires > Différence de maps > Maps gagnées.',
  scheduleHeading: 'Calendrier – Phase de poules (BO3)',
  finalHeading: 'Finale (BO5)',
  finalWaiting: 'En attente des 6 résultats de poules…',
  finalBo5Label: 'BO5 – Premier à 3',
  championLabel: '🏆 Champion 2025: {champion} 🏆',
  replaysEyebrow: 'Rediffusions',
  replaysHeading: "Revivez l'édition 2025",
  replaysSubtitle:
    'Finales, meilleurs moments et VOD officielles de la saison.',
  replaysEmpty: "Aucune rediffusion n'est disponible pour le moment.",
  replayPlaceholder: "Remplace l'ID YouTube pour afficher la vidéo.",
});
