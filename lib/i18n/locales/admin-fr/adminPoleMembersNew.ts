// lib/i18n/locales/admin-fr/adminPoleMembersNew.ts
//
// Traductions FRANCAISES du namespace `adminPoleMembersNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPoleMembersNew', {
  pageTitle: 'Admin – Nouveau membre de pôle',
  back: 'Retour à la liste',
  heading: 'Ajouter un membre de pôle',
  subtitle: 'Configurez un nouveau membre pour la page association',
  poleLabel: 'Pôle',
  nameLabel: 'Nom',
  titleLabel: 'Titre / Rôle',
  titlePlaceholder: 'ex: Présidente, Trésorier...',
  sortOrderLabel: "Ordre d'affichage",
  sortOrderPlaceholder: 'Auto (dernier)',
  avatarLabel: "URL de l'avatar",
  linkLabel: 'Lien (Twitch, X, contact...)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Bio courte (optionnel)...',
  activeLabel: 'Active (visible sur la page association)',
  cancel: 'Annuler',
  creating: 'Création...',
  submit: 'Créer',
  errorNameRequired: 'Le nom est obligatoire.',
  errorGeneric: 'Erreur inattendue.',
});
