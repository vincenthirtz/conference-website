// lib/i18n/locales/admin-fr/adminPartnerEdit.ts
//
// Traductions FRANCAISES du namespace `adminPartnerEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPartnerEdit', {
  pageTitle: 'Admin - Modifier {name}',
  back: 'Retour aux partenaires',
  heading: 'Modifier le partenaire',
  nameLabel: 'Nom du partenaire *',
  namePlaceholder: "Nom de l'entreprise",
  categoryLabel: 'Catégorie *',
  categoryPlaceholder: 'Sélectionnez une catégorie',
  categorySuper: 'Super partenaire',
  categoryMajor: 'Partenaire majeur',
  categoryCultural: 'Partenaire culturel',
  descriptionLabel: 'Description *',
  descriptionPlaceholder: 'Description du partenaire...',
  logoUrlLabel: 'URL du logo',
  logoPreviewAlt: 'Aperçu logo',
  websiteLabel: 'Site web',
  noteLabel: 'Badge / Note',
  notePlaceholder: 'Ex: Nouveau, 2026',
  displayOrderLabel: "Ordre d'affichage",
  displayOrderHint:
    'Plus le nombre est bas, plus le partenaire apparaît en premier.',
  activeLabel: 'Partenaire actif (visible sur le site)',
  saving: 'Enregistrement...',
  submit: 'Enregistrer les modifications',
  backButton: 'Retour',
  updateSuccess: 'Partenaire mis à jour avec succès.',
  errorLoad: 'Erreur de chargement.',
  errorNameRequired: 'Le nom est requis.',
  errorDescriptionRequired: 'La description est requise.',
  errorCategoryRequired: 'La catégorie est requise.',
  errorGeneric: 'Une erreur est survenue.',
});
