// lib/i18n/locales/admin-fr/adminTournamentCheckin.ts
//
// Traductions FRANCAISES du namespace `adminTournamentCheckin` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentCheckin', {
  headTitle: 'Admin – Check-in',
  backToTournament: 'Retour au tournoi',
  pageTitle: 'Check-in matchs',
  pageSubtitle:
    'Suivi des présences et auto-forfaits. Le processeur tourne tout seul (cron Netlify), mais vous pouvez forcer un passage ici.',
  liveConsole: 'Live console ↗',
  currentGraceTitle: 'Fenêtre de grâce actuelle : {minutes} min',
  configureCheckin: 'Configurer le check-in',
  refresh: 'Rafraîchir',
  processing: 'Traitement...',
  processNow: 'Lancer maintenant',
  statMatches: 'Matchs',
  statUpcoming: 'À venir',
  statAllCheckedIn: 'Tous check-in',
  statNoCheckin: 'Aucun check-in',
  statAutoForfeits: 'Forfaits auto',
  filterUpcoming: 'À venir',
  filterAll: 'Tous',
  matchCount: '{count} matchs',
  emptyMatches: 'Aucun match à afficher.',
  thDate: 'Date',
  thMatch: 'Match',
  thStatus: 'Statut',
  thEmail: 'Email',
  thT30: 'T-30',
  thT15: 'T-15',
  thTeam1: 'Team1',
  thTeam2: 'Team2',
  thReason: 'Raison',
  thAction: 'Action',
  view: 'Voir',
  footerBefore:
    'Le processeur cron tourne automatiquement toutes les 5 minutes via Netlify Scheduled Functions. Les matchs sans',
  footerAfter: 'sont ignorés.',
  settingsTitle: 'Configurer le check-in',
  settingsSubtitle: 'Fenêtre de grâce avant l’auto-forfait pour non check-in.',
  cancel: 'Annuler',
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  graceLabel: 'Fenêtre de grâce (minutes)',
  graceHelp:
    'Délai (0 à 120 min) après l’heure prévue avant de déclarer un forfait automatique si une équipe ne s’est pas présentée. Défaut : {default} min.',
  checkinAtTitle: 'Check-in à {time}',
  reasonAutoForfeit: 'Forfait auto (no check-in)',
  statusPending: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusWalkover: 'Forfait',
  statusCancelled: 'Annulé',
  graceValidation: 'La fenêtre de grâce doit être un entier entre 0 et 120.',
  errorMigrationMissing:
    'Réglage indisponible : migration check-in non appliquée.',
  errorSave: 'Échec de la sauvegarde',
  graceUpdated: 'Fenêtre de grâce mise à jour.',
  errorGeneric: 'Échec',
  processResult:
    'Traité : {scanned} matchs scannés, {acted} action(s), {errors} erreur(s)',
});
