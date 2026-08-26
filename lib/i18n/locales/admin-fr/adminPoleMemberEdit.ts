// lib/i18n/locales/admin-fr/adminPoleMemberEdit.ts
//
// Traductions FRANCAISES du namespace `adminPoleMemberEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPoleMemberEdit', {
  pageTitle: 'Admin – Modifier membre',
  back: 'Retour à la liste',
  heading: 'Modifier le membre',
  loading: 'Chargement...',
  poleLabel: 'Pôle',
  nameLabel: 'Nom',
  titleLabel: 'Titre / Rôle',
  titlePlaceholder: 'ex: Présidente',
  sortOrderLabel: "Ordre d'affichage",
  avatarLabel: "URL de l'avatar",
  linkLabel: 'Lien (Twitch, X, contact...)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Bio courte (optionnel)...',
  activeLabel: 'Active (visible sur la page association)',
  cancel: 'Annuler',
  saving: 'Enregistrement...',
  submit: 'Enregistrer',
  updateSuccess: 'Membre mis à jour avec succès.',
  errorLoad: 'Erreur de chargement.',
  errorNameRequired: 'Le nom est obligatoire.',
  errorGeneric: 'Erreur inattendue.',
});
