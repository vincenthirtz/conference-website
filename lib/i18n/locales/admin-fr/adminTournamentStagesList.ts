// lib/i18n/locales/admin-fr/adminTournamentStagesList.ts
//
// Traductions FRANCAISES du namespace `adminTournamentStagesList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentStagesList', {
  pageTitle: 'Admin · Phases du tournoi',
  typeGroup: 'Poule',
  typeBracket: 'Bracket',
  typeSwiss: 'Swiss',
  typeRoundRobin: 'Round robin',
  typeShowmatch: 'Showmatch',
  typeOther: 'Autre',
  defaultTournamentName: 'Tournoi',
  breadcrumbTournaments: 'Tournois',
  breadcrumbStages: 'Phases',
  eyebrow: 'Admin · Phases',
  titleSuffix: '{name} · Phases',
  viewMatches: 'Voir les matchs',
  cancel: 'Annuler',
  reorder: 'Réorganiser',
  saving: 'Enregistrement…',
  saveOrder: "Enregistrer l'ordre",
  addTemplateBlock: '+ Bloc template',
  refresh: 'Rafraîchir',
  loading: 'Chargement…',
  empty: 'Aucune phase pour ce tournoi.',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  orderPrefix: 'Ordre ',
  open: 'Ouvrir',
  active: 'Active',
  inactive: 'Inactive',
  public: 'Publique',
  private: 'Privée',
  startsAt: 'Débute : ',
  endsAt: 'Fin : ',
  modalTitle: 'Ajouter un bloc template',
  modalSubtitle:
    'Les phases du template seront ajoutées après les phases existantes.',
  applying: 'Application...',
  addStages: 'Ajouter les phases',
  errorLoad: 'Erreur de chargement',
  errorSaveOrder: "Erreur lors de l'enregistrement",
  errorApplyTemplate: "Impossible d'appliquer le template",
  errorApplyTemplateGeneric: "Erreur lors de l'application du template",
  toastTemplateAdded: 'Template « {name} » ajouté',
});
