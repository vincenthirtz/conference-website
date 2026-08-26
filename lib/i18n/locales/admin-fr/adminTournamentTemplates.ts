// lib/i18n/locales/admin-fr/adminTournamentTemplates.ts
//
// Traductions FRANCAISES du namespace `adminTournamentTemplates` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentTemplates', {
  stageTypeGroup: 'Poule',
  stageTypeBracket: 'Bracket',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round Robin',
  stageTypeShowmatch: 'Showmatch',
  stageTypeOther: 'Autre',
  errorUnexpected: 'Erreur inattendue',
  errorNameRequired: 'Le nom est obligatoire.',
  errorStageRequired: 'Au moins un stage avec un nom est requis.',
  createSuccess: 'Template cree avec succes.',
  deleteConfirmTitle: 'Supprimer ce template personnalise ?',
  deleteConfirmLabel: 'Supprimer',
  deleteSuccess: 'Template supprime.',
  badgeBuiltIn: 'Integre',
  badgeCustom: 'Personnalise',
  deleteTitle: 'Supprimer',
  cardId: 'ID: {id}',
  pageTitle: 'Admin – Templates de tournoi',
  back: 'Retour aux tournois',
  heading: 'Templates de tournoi',
  subtitle:
    'Gere les templates integres et personnalises pour creer rapidement des structures de tournoi.',
  newTemplate: 'Nouveau template',
  createHeading: 'Creer un template personnalise',
  nameLabel: 'Nom',
  namePlaceholder: 'Mon template personnalise',
  descLabel: 'Description',
  descPlaceholder: 'Description du template...',
  stagesLabel: 'Stages',
  addStage: '+ Ajouter un stage',
  stageNamePlaceholder: 'Nom du stage',
  creating: 'Creation...',
  createSubmit: 'Creer le template',
  cancel: 'Annuler',
  builtInHeading: 'Templates integres ({count})',
  customHeading: 'Templates personnalises ({count})',
  emptyCustom: 'Aucun template personnalise.',
  emptyCustomHint: 'Cliquez sur "Nouveau template" pour en creer un.',
});
