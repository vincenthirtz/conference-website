// lib/i18n/locales/fr/myScrims.ts
//
// Traductions FRANCAISES du namespace `myScrims` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('myScrims', {
  title: 'Nos scrims',
  toReportLabel: 'À rapporter',
  upcomingLabel: 'À venir',
  recentLabel: 'Récents',
  unknownOpponent: 'Adversaire inconnu',
  noDate: 'Date à définir',
  noScore: 'Sans score',
  unranked: 'hors classement',
  reportCta: 'Rapporter le score',
  correctCta: 'Corriger mon report',
  submitCta: 'Envoyer',
  usLabel: 'Nous',
  themLabel: 'Eux',
  reportHint:
    'Le scrim est clos quand les deux équipes rapportent le même score. En cas de désaccord, il passe en litige.',
  awaitingOpponent: "Ton report est enregistré — en attente de l'adversaire.",
  disputed: 'Reports divergents : à arbitrer.',
  reportCompleted: 'Score validé par les deux équipes : scrim clos.',
  reportAwaiting: "Report enregistré — en attente de l'adversaire.",
  reportDisputed: 'Les deux reports divergent : le scrim passe en litige.',
  errorScores: 'Saisis deux scores valides.',
  errorReport: "Le report n'a pas pu être enregistré.",
});
