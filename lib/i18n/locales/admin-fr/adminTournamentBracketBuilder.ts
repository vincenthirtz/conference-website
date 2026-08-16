// lib/i18n/locales/admin-fr/adminTournamentBracketBuilder.ts
//
// Traductions FRANCAISES du namespace `adminTournamentBracketBuilder` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentBracketBuilder', {
  pageTitleWith: '{name} — Planning',
  pageTitle: 'Planning tournoi',
  back: 'Retour au tournoi',
  heading: 'Planning des matchs',
  statMatches: 'matchs',
  statDays: 'journées',
  statFinished: 'terminés',
  viewPlanning: 'Planning',
  viewList: 'Liste',
  viewBracket: 'Arbre',
  loading: 'Chargement...',
  reload: 'Recharger',
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  saved: 'Sauvegardé',
  unsavedChanges: 'Modifications non sauvegardées',
  exportPdf: 'Exporter PDF',
  emptyMatches: 'Aucun match trouvé pour ce tournoi.',
  createBracket: 'Créer un bracket',
  dayMatchCount_one: '{count} match',
  dayMatchCount_other: '{count} matchs',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  roundFinal: 'Finale',
  roundLabel: 'Round {n}',
  lbRoundLabel: 'LB Round {n}',
  noDate: 'Sans date',
  seedLabel: 'Seed {n}',
  tbd: 'TBD',
  defaultTournamentName: 'Tournoi',
  pdfTitle: '{name} — Planning des matchs',
  pdfSubtitle: 'Export du {date} · {matches} matchs · {days} journées',
  pdfBracketView: 'Vue Bracket',
  pdfMatchList: 'Liste des matchs',
  pdfColTime: 'Heure',
  pdfColTeam1: 'Équipe 1',
  pdfColTeam2: 'Équipe 2',
  pdfColFormat: 'Format',
  pdfColStatus: 'Statut',
  pdfFooter: '{matches} matchs · {finished} terminés',
  errorLoad: 'Impossible de charger les matchs',
  errorSave: 'Erreur lors de l’enregistrement',
  errorUnexpected: 'Erreur inattendue',
  errorUnknown: 'Erreur inconnue',
  toastSaved: 'Planning enregistré.',
});
