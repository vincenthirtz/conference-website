// lib/i18n/locales/admin-fr/adminScrimDetail.ts
//
// Traductions FRANCAISES du namespace `adminScrimDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminScrimDetail', {
  errorLoad: 'Erreur de chargement.',
  errorSave: "Erreur d'enregistrement.",
  errorCreateMatch: 'Erreur de création du match.',
  errorDelete: 'Erreur de suppression.',
  confirmDelete: 'Supprimer ce scrim et ses matchs ?',
  loading: 'Chargement…',
  headTitle: '{name} – Scrim admin',
  backAll: '← Tous les scrims',
  slug: 'Slug : {slug}',
  delete: 'Supprimer',
  infoHeading: 'Informations',
  nameLabel: 'Nom',
  team1Label: 'Équipe 1',
  team2Label: 'Équipe 2',
  teamNone: '— Aucune —',
  teamExternalOption: '+ Équipe extérieure…',
  teamExternalPlaceholder: "Nom de l'équipe extérieure",
  teamExternalHint:
    "Créée à l'enregistrement, sans effectif, avec le logo Women's Cup.",
  errorExternalNameRequired: "Indique le nom de l'équipe extérieure.",
  scheduledLabel: 'Date prévue',
  noDateHint: 'Pas encore de date ?',
  openPlanning: 'Ouvrir une grille de disponibilités',
  statusLabel: 'Statut',
  statusDraft: 'Brouillon',
  statusScheduled: 'Planifié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusCancelled: 'Annulé',
  streamUrlLabel: 'URL du stream',
  descriptionLabel: 'Description',
  isPublicLabel: 'Visible publiquement',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  matchesHeading: 'Matchs ({count})',
  addMatch: '+ Ajouter un match',
  matchesEmpty:
    'Aucun match. Ajoute un premier match pour cette journée de scrim.',
  matchTeamsVs: '{team1} vs {team2}',
  defaultTeam1: 'Équipe 1',
  defaultTeam2: 'Équipe 2',
  edit: 'Éditer →',
  statusDisputed: 'En litige',
  resultHeading: 'Résultat',
  resultCurrent: '{team1} {score1} – {score2} {team2}',
  resultNone: 'Aucun résultat enregistré.',
  resultWinner: 'Vainqueur : {team}',
  resultDraw: 'Match nul',
  resultDisputeNotice: 'Litige en cours : {reason}',
  resultDisputeNoReason: 'raison non précisée',
  resultCompletedNotice:
    'Ce scrim est déjà terminé : enregistrer un nouveau score corrige le résultat existant.',
  resultCancelledNotice:
    'Scrim annulé : réinstaure-le (statut) avant de saisir un résultat.',
  resultTeamsMissing: 'Assigne les deux équipes avant de saisir un résultat.',
  resultScoreFor: 'Score — {team}',
  resultSubmit: 'Enregistrer le résultat',
  resultSubmitting: 'Enregistrement…',
  resultConfirmTitle: 'Enregistrer le résultat {score} ?',
  resultConfirmSubtitle:
    'Le scrim passera « Terminé ». Les reports des capitaines en attente seront supprimés.',
  resultConfirmOverrideTitle: 'Corriger le résultat de ce scrim ?',
  resultConfirmOverrideSubtitle:
    'Score actuel {previous} → nouveau score {next}. Les récompenses déjà versées ne sont ni reprises ni versées une seconde fois.',
  resultConfirmDisputeSubtitle:
    'Ce score tranche le litige ({reason}). Les reports des deux capitaines seront supprimés.',
  resultConfirmLabel: 'Enregistrer',
  resultSaved: 'Résultat enregistré.',
  resultLiveSubmit: 'Mettre à jour le score en cours',
  resultLiveSaved: 'Score en cours mis à jour.',
  resultLiveHint:
    'Pendant le match : « Mettre à jour le score en cours » affiche le score sur l’overlay sans terminer le scrim (un scrim planifié passe « en cours »). « Enregistrer le résultat » le termine.',
  resultRebuildHint:
    "Le vainqueur a changé : le classement des joueuses n'est pas recalculé automatiquement.",
  resultRebuildLink: 'Recalculer le classement',
  resultErrorChanged:
    'Le scrim a changé entre-temps : il a été rechargé, vérifie avant de réenregistrer.',
  resultError: "Erreur d'enregistrement du résultat.",
});
