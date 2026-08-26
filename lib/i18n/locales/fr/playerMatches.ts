// lib/i18n/locales/fr/playerMatches.ts
//
// Traductions FRANCAISES du namespace `playerMatches` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerMatches', {
  loadError: 'Erreur lors du chargement de tes matchs.',
  dateToCome: 'Date à venir',
  win: 'Victoire',
  loss: 'Défaite',
  draw: 'Nul',
  live: 'En direct',
  opponentTbd: 'Adversaire à définir',
  viewMatch: 'Voir le match',
  liveCast: 'Live cast',
  checkedIn: 'Check-in validé',
  checkin: 'Check-in',
  title: 'Mes matchs',
  backToDashboard: 'Tableau de bord',
  signinPrompt: 'Connecte-toi pour voir les matchs de ton équipe.',
  signin: 'Se connecter',
  teamSchedule: 'Calendrier et résultats de {team}.',
  yourSchedule: 'Ton calendrier de matchs.',
  noTeamTitle: "Tu n'es pas encore dans une équipe",
  noTeamBody: 'Rejoins ou crée une équipe pour voir tes matchs ici.',
  goToDashboard: 'Aller au tableau de bord',
  noMatchTitle: 'Aucun match programmé',
  noMatchBody:
    "Tes prochains matchs apparaîtront ici dès qu'ils seront planifiés.",
  upcoming: 'À venir',
  results: 'Résultats',
  reportScore: 'Rapporter le score',
  reportScoreTitle: 'Rapporter le score',
  reportScoreIntro: 'Indique le nombre de maps gagnées par chaque équipe.',
  myTeamScore: 'Maps gagnées par mon équipe',
  opponentScore: "Maps gagnées par l'adversaire",
  myTeamLabel: 'Mon équipe',
  opponentLabel: 'Adversaire',
  bestOfHint: 'Format : BO{bestOf}',
  submitReport: 'Envoyer le score',
  updateReport: 'Corriger le score',
  cancel: 'Annuler',
  submitting: 'Envoi…',
  currentReportLabel: 'Ton report actuel',
  editReport: 'Modifier mon report',
  statusAwaiting:
    "Score envoyé. En attente de la confirmation de l'adversaire.",
  statusAwaitingShort: "En attente de l'adversaire",
  statusFinalized: 'Match validé !',
  statusDisputed: 'Désaccord sur le score : un membre du staff va trancher.',
  statusDisputedShort: 'En litige',
  badgeAwaiting: 'Score en attente',
  badgeDisputed: 'Score en litige',
  errInvalidScore: 'Score invalide. Vérifie les valeurs saisies.',
  errNotCaptain: "Seul le capitaine d'une des équipes peut rapporter le score.",
  errFinalized:
    'Ce match est déjà clôturé. Contacte le staff pour le modifier.',
  errRateLimited: 'Trop de tentatives. Réessaie dans un instant.',
  errGeneric: "Échec de l'envoi du score. Réessaie.",
  retry: 'Réessayer',
});
