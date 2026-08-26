// lib/i18n/locales/admin-fr/adminCastMemberEdit.ts
//
// Traductions FRANCAISES du namespace `adminCastMemberEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCastMemberEdit', {
  pageTitle: 'Admin – Modifier casteuse',
  back: 'Retour à la liste',
  heading: 'Modifier la casteuse',
  loading: 'Chargement...',
  previewNameFallback: 'Nom',
  previewTitleFallback: 'Titre',
  nameLabel: 'Nom',
  titleLabel: 'Titre / Rôle',
  cityLabel: 'Ville / Pays',
  sortOrderLabel: "Ordre d'affichage",
  imageLabel: "URL de l'image",
  twitchLabel: 'Lien Twitch ou autre',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Bio courte (optionnel)...',
  activeLabel: 'Active (visible sur la page association)',
  promoLabel: 'Carte promotionnelle (ex: "Envie de rejoindre le cast ?")',
  cancel: 'Annuler',
  saving: 'Enregistrement...',
  submit: 'Enregistrer',
  updateSuccess: 'Casteuse mise à jour avec succès.',
  errorLoad: 'Erreur de chargement.',
  errorNameRequired: 'Le nom est obligatoire.',
  errorGeneric: 'Erreur inattendue.',
});
