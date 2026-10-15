// lib/i18n/locales/admin-en/adminTcgAssociation.ts
//
// Traductions ANGLAISES du namespace admin `adminTcgAssociation`.
// Admin en mode FR-first : valeurs recopiees du francais.

export default {
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
  partnersTitle: 'Association partners',
  partnersIntro:
    'Active partners (admin → Partners). Importing one makes it a card: its logo is copied, and the card credit names the partner with a link to its website. Editing or removing the partner does not change the card.',
  partnersEmpty: 'No active partners.',
  importPartner: 'Import as a card',
  partnerLogoNotImportable:
    'Logo hosted outside storage: upload the image below, with the partner name as credit and its website link.',
  partnerWebsiteNotHttps:
    'No website, or not https://: fix it in Partners to import it.',
  toastPartnerImported: 'Partner imported as a card.',
  fromPartner: 'Partner',
  labelCreditUrl: 'Credit link (https://, optional)',
  errorCreditUrl: 'The credit link must start with https://.',
  voxelTitle: 'Logo par défaut en voxel',
  voxelIntro:
    'Le nœud de l’association, en briques — la même figurine que celle du moteur voxel. La carte en fige le rendu actuel.',
  voxelCreate: 'Créer la carte voxel',
  toastVoxelCreated: 'Carte voxel du logo créée.',
  uploadTitle: 'Déposer une image',
  labelFile: 'Image (PNG, JPEG ou WebP, {max} Mo max)',
  labelTitle: 'Titre de la carte',
  labelCredit: 'Crédit affiché',
  labelRarity: 'Rareté',
  labelDescription: 'Description (about)',
  descriptionHelp:
    'Shown on the card, in players’ collections. Plain text, no links or tags ({max} characters max).',
  descriptionPlaceholder: 'Who or what does this card represent?',
  descriptionCount: '{count}/{max}',
  errorDescriptionLinks:
    'The description cannot contain links (no web address, no Discord invite).',
  errorDescriptionMarkup: 'The description is plain text: no HTML tags.',
  errorDescriptionTooLong: 'The description is at most {max} characters.',
  errorDescriptionPending:
    'Descriptions are not available yet: the database migration is pending.',
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
};
