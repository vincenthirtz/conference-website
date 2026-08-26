// lib/i18n/locales/fr/scrimsPage.ts
//
// Traductions FRANCAISES du namespace `scrimsPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('scrimsPage', {
  title: 'Scrims',
  subtitle:
    'Les sessions de matchs amicaux organisées entre nos équipes. Chaque scrim regroupe plusieurs matchs joués sur une journée.',
  emptyBefore:
    'Pas encore de scrim public. Les capitaines peuvent en proposer depuis',
  emptyLink: 'la page scrim',
  emptyAfter: '.',
  sectionRunning: 'En cours',
  sectionUpcoming: 'À venir',
  sectionPast: 'Terminés',
  vs: 'vs',
  dateTbd: 'Date à définir',
  teamTbd: 'à définir',
  statusScheduled: 'Planifié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusCancelled: 'Annulé',
  ladderTitle: 'Classement des scrims',
  ladderSubtitle:
    "Établi sur les scrims rapportés par les deux équipes. Distinct du classement de tournoi : ici on mesure l'entraînement.",
  ladderTeam: 'Équipe',
  ladderPlayed: 'J',
  ladderRecord: 'V-N-D',
  ladderDiff: 'Diff.',
  ladderPoints: 'Pts',
});
