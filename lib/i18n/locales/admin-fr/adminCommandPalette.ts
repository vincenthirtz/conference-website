// lib/i18n/locales/admin-fr/adminCommandPalette.ts
//
// Traductions FRANCAISES du namespace admin `adminCommandPalette`.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` ; le garde-fou
// `../admin-parity.ts` casse le typecheck si une cle manque d'un cote.

import { adminNs } from '../../ns';

export default adminNs('adminCommandPalette', {
  title: 'Recherche et actions',
  placeholder:
    'Rechercher une page, une équipe, un tournoi, un match… (> commandes)',
  results: 'Résultats',
  searching: 'Recherche…',
  noResult: 'Aucun résultat.',
  recent: 'Récemment ouvert',
  hint: '↑ ↓ naviguer · Entrée ouvrir · Ctrl+Entrée nouvel onglet · > commandes · Échap fermer',
  section_recent: 'Récemment ouvert',
  section_actions: 'Actions rapides',
  section_pages: 'Pages',
  section_results: 'Résultats',
  actionCurrentTournament: 'Ouvrir le tournoi en cours',
  actionTasks: 'Ouvrir le tableau de tâches',
  actionSupport: 'Ouvrir les tickets support',
  createTournament: 'Créer un tournoi',
  createTeam: 'Créer une équipe',
  createNews: 'Rédiger une actualité',
  createStaff: 'Ajouter un membre du staff',
  kind_team: 'Équipe',
  kind_tournament: 'Tournoi',
  kind_match: 'Match',
  kind_ticket: 'Ticket',
  kind_task: 'Tâche',
  kind_page: 'Page',
  kind_create: 'Créer',
  kind_recent: 'Récent',
});
