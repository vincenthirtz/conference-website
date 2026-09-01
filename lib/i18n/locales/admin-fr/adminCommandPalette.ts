// lib/i18n/locales/admin-fr/adminCommandPalette.ts
//
// Traductions FRANCAISES du namespace admin `adminCommandPalette`.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` ; le garde-fou
// `../admin-parity.ts` casse le typecheck si une cle manque d'un cote.

import { adminNs } from '../../ns';

export default adminNs('adminCommandPalette', {
  title: 'Recherche et actions',
  placeholder: 'Rechercher une équipe, un tournoi, un match, un ticket…',
  results: 'Résultats',
  searching: 'Recherche…',
  noResult: 'Aucun résultat.',
  recent: 'Récemment ouvert',
  hint: '↑ ↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer',
  actionCurrentTournament: 'Ouvrir le tournoi en cours',
  actionTasks: 'Ouvrir le tableau de tâches',
  actionSupport: 'Ouvrir les tickets support',
  kind_team: 'Équipe',
  kind_tournament: 'Tournoi',
  kind_match: 'Match',
  kind_ticket: 'Ticket',
  kind_task: 'Tâche',
});
