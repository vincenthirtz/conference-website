// lib/i18n/locales/fr/playerMyTeams.ts
//
// Traductions FRANCAISES du namespace `playerMyTeams` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` ; le garde-fou `../parity.ts`
// casse le typecheck si une cle manque d'un cote.

import { ns } from '../../ns';

export default ns('playerMyTeams', {
  pageTitle: 'Mes équipes',
  heading: 'Mes équipes',
  subtitle:
    'Une ligne par équipe encadrée : ce qui décide de la prochaine journée.',
  back: "Retour à l'espace joueur",
  loading: 'Chargement…',
  loadError: 'Les équipes n’ont pas pu être chargées.',
  empty: 'Tu n’encadres aucune équipe pour le moment.',
  colTeam: 'Équipe',
  colNextMatch: 'Prochain match',
  colCheckin: 'Check-in',
  colLineup: 'Feuille',
  colRoster: 'Effectif',
  colRequests: 'Demandes',
  captainBadge: 'Capitaine',
  noMatch: 'Aucun match à venir',
  checkinDone: 'Fait',
  checkinOpen: 'À faire',
  checkinLater: 'Plus tard',
  lineupDone: 'Validée',
  lineupTodo: 'À valider',
  lineupLocked: 'Après le check-in',
  rosterShort: '{n} manquante(s)',
  rosterOk: 'Complet',
  requestsPending: '{n} en attente',
  requestsNone: '—',
  openTeam: 'Gérer ↗',
});
