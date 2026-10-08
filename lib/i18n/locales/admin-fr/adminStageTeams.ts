// lib/i18n/locales/admin-fr/adminStageTeams.ts
//
// Traductions FRANCAISES du namespace `adminStageTeams` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
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

  // --- Disqualification -----------------------------------------------
  disqualify: 'Disqualifier',
  reinstate: 'Réintégrer',
  dqBadge: 'Disqualifiée',
  dqModeForfeitShort: 'Matchs restants perdus par forfait',
  dqModeAnnulShort: 'Tous ses résultats annulés',
  dqBadgeTitle: 'Disqualifiée — {mode}',
  dqBadgeTitleReason: 'Disqualifiée — {mode}. Motif : {reason}',
  dqModalTitle: 'Disqualifier {team}',
  dqModalIntro:
    "L'équipe sera classée dernière de la phase, avec un badge « Disqualifiée », et ne pourra plus se qualifier. Choisis ce que deviennent ses matchs :",
  dqModeLegend: 'Que deviennent ses matchs ?',
  dqModeForfeitTitle: 'Garder les matchs joués',
  dqModeForfeitDesc:
    "Les matchs déjà joués gardent leur résultat. Ses matchs restants sont déclarés perdus par forfait : l'adversaire gagne (2-0 en BO3, etc.). Les pronostics sur ces matchs sont annulés.",
  dqModeAnnulTitle: 'Annuler tous ses résultats',
  dqModeAnnulDesc:
    "Aucun de ses matchs ne compte plus au classement, pour personne : les matchs joués restent dans l'historique mais sont ignorés, ses matchs restants sont annulés. Les coins et pronostics déjà versés sur les matchs joués ne sont pas repris.",
  dqReasonLabel: 'Motif (obligatoire)',
  dqReasonPlaceholder:
    'Ex. : triche avérée, abandon annoncé sur Discord, joueuse non éligible…',
  dqReasonHelp: 'Entre 3 et 500 caractères. Visible dans le journal staff.',
  dqSummaryPick: 'Choisis un mode pour voir ce qui va se passer.',
  dqSummaryForfeit:
    '{team} sera classée dernière ; ses matchs restants seront perdus par forfait.',
  dqSummaryAnnul:
    '{team} sera classée dernière ; ses matchs restants seront annulés et aucun de ses résultats ne comptera plus.',
  dqSummaryCaveat:
    "Les matchs en litige ne sont pas touchés : ils seront à traiter à la main. Réintégrer l'équipe plus tard ne restaurera pas ses matchs.",
  dqCancel: 'Annuler',
  dqConfirm: 'Disqualifier',
  dqSubmitting: 'Disqualification…',
  dqToastForfeit_one: '{team} disqualifiée : {count} match perdu par forfait.',
  dqToastForfeit_other:
    '{team} disqualifiée : {count} matchs perdus par forfait.',
  dqToastAnnul_one: '{team} disqualifiée : {count} match annulé.',
  dqToastAnnul_other: '{team} disqualifiée : {count} matchs annulés.',
  dqErr: 'La disqualification a échoué.',
  dqErrAlready: 'Cette équipe est déjà disqualifiée de la phase.',
  dqErrCompleted:
    'Le tournoi est terminé : rouvre-le avant de disqualifier une équipe.',
  dqErrNotInStage: "Cette équipe n'est plus inscrite à la phase.",
  dqReportTitle: '{team} est disqualifiée, mais des matchs restent à traiter',
  dqReportIntro:
    "Ces matchs n'ont pas été modifiés. Ouvre-les pour les régler à la main :",
  dqReportIncomplete:
    "Le traitement s'est arrêté sur une erreur : les matchs suivants n'ont pas été traités.",
  dqSkipDisputed: 'en litige',
  dqSkipNoOpponent: "pas d'adversaire",
  dqSkipStatusChanged: 'statut modifié entre-temps',
  dqFailed: 'échec : {error}',
  dqNotProcessed: 'non traité',
  dqOpenMatch: 'Ouvrir le match {id}',
  dqMatchVs: '{team1} vs {team2}',
  dqMatchTbd: 'à déterminer',
  dqReportDismiss: 'Masquer',
  rsConfirmTitle: 'Réintégrer {team} ?',
  rsConfirmSubtitle:
    "L'équipe retrouve sa place normale au classement et peut de nouveau se qualifier. Ses matchs perdus par forfait ou annulés ne sont PAS restaurés : corrige-les à la main si besoin.",
  rsToast: '{team} réintégrée.',
  rsToastNotRestored_one:
    '{team} réintégrée. {count} match reste en forfait ou annulé : à corriger à la main si besoin.',
  rsToastNotRestored_other:
    '{team} réintégrée. {count} matchs restent en forfait ou annulés : à corriger à la main si besoin.',
  rsErr: 'La réintégration a échoué.',
  rsErrNotDisqualified: "Cette équipe n'est pas disqualifiée de la phase.",
});
