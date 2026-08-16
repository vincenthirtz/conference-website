// lib/i18n/locales/admin-fr/adminPartnersNew.ts
//
// Traductions FRANCAISES du namespace `adminPartnersNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPartnersNew', {
  pageTitle: 'Admin - Nouveau partenaire',
  back: 'Retour aux partenaires',
  heading: 'Nouveau partenaire',
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
  websiteLabel: 'Site web',
  noteLabel: 'Badge / Note',
  notePlaceholder: 'Ex: Nouveau, 2026',
  displayOrderLabel: "Ordre d'affichage",
  displayOrderHint:
    'Plus le nombre est bas, plus le partenaire apparaît en premier.',
  activeLabel: 'Partenaire actif (visible sur le site)',
  creating: 'Création...',
  submit: 'Créer le partenaire',
  cancel: 'Annuler',
  errorNameRequired: 'Le nom est requis.',
  errorDescriptionRequired: 'La description est requise.',
  errorCategoryRequired: 'La catégorie est requise.',
  errorGeneric: 'Une erreur est survenue.',
});
