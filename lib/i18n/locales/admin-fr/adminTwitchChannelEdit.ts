// lib/i18n/locales/admin-fr/adminTwitchChannelEdit.ts
//
// Traductions FRANCAISES du namespace `adminTwitchChannelEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTwitchChannelEdit', {
  pageTitle: 'Admin – Modifier chaîne Twitch',
  back: 'Retour à la liste',
  heading: 'Modifier la chaîne',
  loading: 'Chargement...',
  previewLabelFallback: 'Label',
  channelLabel: 'Nom de la chaîne Twitch',
  labelLabel: "Label d'affichage",
  badgeLabel: 'Badge',
  badgePlaceholder: 'ex: Cast, Player, Coach...',
  sortOrderLabel: "Ordre d'affichage",
  avatarLabel: "URL de l'avatar",
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Décrivez la chaîne en quelques mots...',
  activeLabel: "Chaîne active (visible sur la page d'accueil)",
  cancel: 'Annuler',
  saving: 'Enregistrement...',
  submit: 'Enregistrer',
  updateSuccess: 'Chaîne mise à jour avec succès.',
  errorLoad: 'Erreur de chargement.',
  errorRequired: 'Le nom de la chaîne et le label sont obligatoires.',
  errorGeneric: 'Erreur inattendue.',
});
