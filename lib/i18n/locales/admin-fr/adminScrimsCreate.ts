// lib/i18n/locales/admin-fr/adminScrimsCreate.ts
//
// Traductions FRANCAISES du namespace `adminScrimsCreate` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminScrimsCreate', {
  pageTitle: 'Admin – Nouveau scrim',
  heading: 'Nouveau scrim',
  nameLabel: 'Nom',
  team1Label: 'Équipe 1',
  team2Label: 'Équipe 2',
  teamPlaceholder: '— Choisir —',
  scheduledLabel: 'Date prévue',
  statusLabel: 'Statut',
  statusDraft: 'Brouillon',
  statusScheduled: 'Planifié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusCancelled: 'Annulé',
  gameLabel: 'Jeu',
  descriptionLabel: 'Description',
  streamUrlLabel: 'URL du stream',
  isPublicLabel: 'Visible publiquement',
  submit: 'Créer le scrim',
  submitting: 'Création…',
  cancel: 'Annuler',
  errorNameRequired: 'Le nom est obligatoire.',
  errorTeamsDistinct: 'Les deux équipes doivent être distinctes.',
  errorCreate: 'Erreur de création.',
});
