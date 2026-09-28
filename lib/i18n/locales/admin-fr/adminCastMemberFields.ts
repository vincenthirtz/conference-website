// lib/i18n/locales/admin-fr/adminCastMemberFields.ts
//
// Traductions FRANCAISES du namespace `adminCastMemberFields` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminCastMemberFields.ts`
// (garde-fou : `../admin-parity.ts`).
//
// Les champs d'une fiche casteuse (`components/admin/cast-members/CastMemberFields`),
// communs à la modale de création et à l'écran d'édition. Les exemples étaient
// écrits en dur, en français, dans les deux copies.

import { adminNs } from '../../ns';

export default adminNs('adminCastMemberFields', {
  nameLabel: 'Nom',
  namePlaceholder: 'ex : Gwadael',
  titleLabel: 'Titre / Rôle',
  titlePlaceholder: 'ex : Streameuse Overwatch',
  cityLabel: 'Ville / Pays',
  cityPlaceholder: 'ex : France, Suisse…',
  sortOrderLabel: "Ordre d'affichage",
  imageLabel: "URL de l'image",
  imagePlaceholder: '/img/speaker-images/nom.jpg ou https://…',
  imageHint: 'Photo de profil (image carrée recommandée)',
  twitchLabel: 'Lien Twitch ou autre',
  twitchPlaceholder: 'https://www.twitch.tv/…',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Bio courte (optionnel)…',
});
