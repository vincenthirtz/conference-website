// lib/i18n/locales/admin-fr/adminStageTeams.ts
//
// Traductions FRANCAISES du namespace `adminStageTeams` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageTeams', {
  errUnexpected: 'Erreur inattendue',
  errSelectTeam: 'Merci de sélectionner une équipe à ajouter.',
  toastAdded: 'Équipe ajoutée à la phase.',
  errAdd: "Erreur inattendue lors de l'ajout",
  toastRemoved: 'Équipe retirée de la phase.',
  errRemove: 'Erreur inattendue lors du retrait',
  toastSeedUpdated: 'Seed mis à jour.',
  errSeedUpdate: 'Erreur inattendue lors de la mise à jour du seed',
  toastBulkSeed_one: 'Seeds mis à jour pour {count} équipe.',
  toastBulkSeed_other: 'Seeds mis à jour pour {count} équipes.',
  errBulkSeed: 'Erreur inattendue lors du bulk seed',
  confirmBulkRemove_one: 'Retirer {count} équipe de cette phase ?',
  confirmBulkRemove_other: 'Retirer {count} équipes de cette phase ?',
  toastBulkRemoved_one: '{count} équipe retirée de la phase.',
  toastBulkRemoved_other: '{count} équipes retirées de la phase.',
  errBulkRemove: 'Erreur inattendue lors du retrait en masse',
  pageTitle: 'Admin – Équipes de la phase',
  back: '← Retour à la phase',
  heading: 'Équipes de la phase',
  subtitle:
    'Gère les équipes rattachées à cette phase (stage) : ajout, retrait, seeds…',
  loadingTeams: 'Chargement des équipes de la phase…',
  phaseLabel: 'Phase',
  tournamentPrefix: 'Tournoi :',
  teamsInPhaseLabel: 'Équipes dans la phase :',
  addTeamTitle: 'Ajouter une équipe à cette phase',
  teamSelectLabel: 'Équipe (tournoi)',
  loadingShort: 'Chargement…',
  selectTeam: 'Sélectionner une équipe',
  seedOptionalLabel: 'Seed (optionnel)',
  adding: 'Ajout…',
  addTeamSubmit: "Ajouter l'équipe",
  allTeamsAttached:
    'Toutes les équipes du tournoi sont déjà rattachées à cette phase.',
  attachedTeamsTitle: 'Équipes rattachées à la phase',
  teamCount_one: '{count} équipe',
  teamCount_other: '{count} équipes',
  autoSeedTitle: "Numéroter automatiquement 1, 2, 3… dans l'ordre actuel",
  autoSeed: 'Auto-seed 1..N',
  bulkSeedSaving: 'Sauvegarde…',
  bulkSeedSave: 'Sauvegarder tous les seeds',
  bulkRemoving: 'Retrait…',
  bulkRemove_one: 'Retirer {count} équipe',
  bulkRemove_other: 'Retirer {count} équipes',
  emptyTeams: "Aucune équipe n'est encore rattachée à cette phase.",
  thSeed: 'Seed',
  thTeam: 'Équipe',
  thNotes: 'Notes',
  thActions: 'Actions',
  seedOkSaving: 'OK…',
  seedOk: 'OK',
  viewTeam: 'Voir équipe',
  removing: 'Retrait…',
  remove: 'Retirer',
  stageNotFound: 'Phase introuvable.',
});
