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
});
