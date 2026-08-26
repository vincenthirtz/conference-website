// lib/i18n/locales/admin-fr/adminCastMembersNew.ts
//
// Traductions FRANCAISES du namespace `adminCastMembersNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCastMembersNew', {
  pageTitle: 'Admin – Nouvelle casteuse',
  back: 'Retour à la liste',
  heading: 'Ajouter une casteuse',
  subtitle: 'Configurez une nouvelle casteuse pour la page association',
  nameLabel: 'Nom',
  titleLabel: 'Titre / Rôle',
  cityLabel: 'Ville / Pays',
  sortOrderLabel: "Ordre d'affichage",
  sortOrderPlaceholder: 'Auto (dernier)',
  imageLabel: "URL de l'image",
  imageHint: 'Photo de profil (image carrée recommandée)',
  twitchLabel: 'Lien Twitch ou autre',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Bio courte (optionnel)...',
  activeLabel: 'Active (visible sur la page association)',
  promoLabel: 'Carte promotionnelle (ex: "Envie de rejoindre le cast ?")',
  cancel: 'Annuler',
  creating: 'Création...',
  submit: 'Créer',
  errorNameRequired: 'Le nom est obligatoire.',
  errorGeneric: 'Erreur inattendue.',
});
