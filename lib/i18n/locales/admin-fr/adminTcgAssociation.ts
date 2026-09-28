// lib/i18n/locales/admin-fr/adminTcgAssociation.ts
//
// Traductions FRANCAISES du namespace `adminTcgAssociation` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminTcgAssociation.ts`
// (garde-fou : `../admin-parity.ts`).
//
// Le panneau de la catégorie « L'association » du TCG
// (`components/admin/tcg/TcgAssociationPanel.tsx`).

import { adminNs } from '../../ns';

export default adminNs('adminTcgAssociation', {
  tabLabel: 'L’association',
  title: 'Cartes de l’association',
  intro:
    'Les visuels de l’association dans le TCG : logos d’événement et images déposées par le staff. Une carte créée ici est publiée tout de suite et entre dans les paquets, à la place des fan arts et des maps.',
  eventLogosTitle: 'Logos d’événement',
  eventLogosIntro:
    'Les logos du calendrier (Réglages du site → logos d’événement). Importer en fait une carte : l’image est copiée, retirer le logo du calendrier ne touche pas la carte.',
  eventLogosEmpty: 'Aucun logo d’événement dans le calendrier.',
  eventLogoImported: 'Déjà une carte',
  eventLogoNotImportable:
    'Hébergé hors du stockage : redéposez-le depuis le calendrier des logos pour pouvoir l’importer.',
  importLogo: 'Importer en carte',
  uploadTitle: 'Déposer une image',
  labelFile: 'Image (PNG, JPEG ou WebP, {max} Mo max)',
  labelTitle: 'Titre de la carte',
  labelCredit: 'Crédit affiché',
  labelRarity: 'Rareté',
  upload: 'Créer la carte',
  cardsTitle: 'Cartes publiées et retirées',
  cardsEmpty: 'Aucune carte de l’association pour l’instant.',
  statusApproved: 'Publiée',
  statusRevoked: 'Retirée',
  fromEventLogo: 'Logo d’événement',
  save: 'Enregistrer',
  revoke: 'Retirer des paquets',
  restore: 'Remettre dans les paquets',
  working: 'En cours…',
  loadError: 'Impossible de charger la catégorie.',
  errorMissingFile: 'Choisissez une image.',
  errorTitle: 'Le titre fait entre 2 et 80 caractères.',
  errorTooBig: 'Image trop lourde.',
  toastCreated: 'Carte créée : elle entre dans les paquets.',
  toastImported: 'Logo importé en carte.',
  toastSaved: 'Carte mise à jour.',
  toastRevoked: 'Carte retirée des paquets à venir.',
  toastRestored: 'Carte remise dans les paquets.',
  toastError: 'Action impossible.',
});
