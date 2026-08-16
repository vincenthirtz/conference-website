// lib/i18n/locales/admin-fr/adminLogs.ts
//
// Traductions FRANCAISES du namespace `adminLogs` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminLogs', {
  pageTitle: 'Admin – Logs staff',
  backToDashboard: 'Retour au dashboard admin',
  heading: 'Logs staff',
  countActions_one: '{count} action enregistree',
  countActions_other: '{count} actions enregistrees',
  loading: 'Chargement...',
  sortedByDate: 'Tries par date decroissante',
  labelEntityType: "Type d'entite",
  placeholderEntityType: 'tournament, stage, match...',
  labelAction: 'Action',
  placeholderAction: 'create_match, update_stage...',
  allActions: 'Toutes les actions',
  labelStaff: 'Staff',
  placeholderStaff: 'ID ou nom',
  labelTournament: 'Tournoi',
  allTournaments: 'Tous les tournois',
  labelSearch: 'Recherche',
  placeholderSearch: 'message, payload...',
  filter: 'Filtrer',
  labelStageId: 'Stage ID',
  placeholderStage: 'stage...',
  labelMatchId: 'Match ID',
  placeholderMatch: 'match...',
  labelTeamId: 'Team ID',
  placeholderTeam: 'team...',
  labelFrom: 'Du',
  labelTo: 'Au',
  empty: 'Aucun log trouve pour ces filtres',
  by: 'par',
  tagTournament: 'Tournoi: {id}',
  tagStage: 'Stage: {id}',
  tagMatch: 'Match: {id}',
  tagTeam: 'Team: {id}',
  detailsPayload: 'Details (payload)',
  exportCsv: 'Exporter CSV',
  exporting: 'Export…',
  exportError: "Echec de l'export CSV",
  linkEntity: 'Ouvrir',
  linkTournament: 'Tournoi',
  linkStage: 'Phase',
  linkMatch: 'Match',
  linkTeam: 'Equipe',
  previous: 'Precedent',
  next: 'Suivant',
  paginationTotal: ' sur {total}',
  errorUnexpected: 'Erreur inattendue',
});
