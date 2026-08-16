// lib/i18n/locales/admin-fr/adminTwitchChannelsNew.ts
//
// Traductions FRANCAISES du namespace `adminTwitchChannelsNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTwitchChannelsNew', {
  pageTitle: 'Admin – Nouvelle chaîne Twitch',
  back: 'Retour à la liste',
  heading: 'Ajouter une chaîne Twitch',
  subtitle: "Configurez une nouvelle chaîne partenaire pour la page d'accueil",
  channelLabel: 'Nom de la chaîne Twitch',
  channelHint: "L'identifiant dans l'URL twitch.tv/",
  labelLabel: "Label d'affichage",
  badgeLabel: 'Badge',
  badgePlaceholder: 'ex: Cast, Player, Coach...',
  sortOrderLabel: "Ordre d'affichage",
  sortOrderPlaceholder: 'Auto (dernier)',
  avatarLabel: "URL de l'avatar",
  avatarHint: "URL de l'image de profil Twitch (150x150 recommandé)",
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Décrivez la chaîne en quelques mots...',
  activeLabel: "Chaîne active (visible sur la page d'accueil)",
  cancel: 'Annuler',
  creating: 'Création...',
  submit: 'Créer la chaîne',
  errorRequired: 'Le nom de la chaîne et le label sont obligatoires.',
  errorGeneric: 'Erreur inattendue.',
});
