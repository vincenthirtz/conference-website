// lib/i18n/locales/fr/playerTcg.ts
//
// Traductions FRANCAISES du namespace `playerTcg` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/playerTcg.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou de compilation `../parity.ts` casse
// le typecheck sinon.
//
// TON DE CETTE SECTION. Il s'agit de la photo d'une personne reelle, posee sur
// un objet que d'autres collectionnent. Les textes disent donc ce qui va se
// passer AVANT de demander le fichier — ou la photo apparait, qui peut
// l'obtenir, et comment revenir en arriere — plutot que de presenter un simple
// bouton d'envoi.

import { ns } from '../../ns';

export default ns('playerTcg', {
  title: 'Ma carte à collectionner',

  // Explication d'abord, bouton ensuite.
  intro:
    'Les joueuses ont une carte dans le TCG de la Women’s Cup. Tu peux y mettre ta photo — ou la laisser sans, ta carte existe quand même.',

  consentTitle: 'Ce que ça implique',
  consentPublic:
    'Ta photo sera visible publiquement sur ta carte, et d’autres joueuses pourront l’obtenir en ouvrant leurs paquets.',
  consentModerated:
    'Elle est relue par l’équipe avant d’être publiée. Tant qu’elle ne l’est pas, ta carte reste sans photo.',
  consentRevocable:
    'Tu peux la retirer quand tu veux : elle disparaît alors aussi des cartes déjà distribuées, pas seulement des prochaines.',

  // États
  statusNone: 'Aucune photo',
  statusPending: 'En attente de relecture',
  statusApproved: 'Photo publiée',
  statusRejected: 'Photo refusée',
  rejectedReason: 'Motif : {reason}',
  rejectedNoReason: 'Aucun motif précisé.',

  // Actions
  choose: 'Choisir une photo',
  replace: 'Remplacer la photo',
  remove: 'Retirer ma photo',
  removing: 'Retrait…',
  uploading: 'Envoi…',
  confirmRemove:
    'Retirer ta photo ? Elle disparaîtra aussi des cartes déjà distribuées.',

  formatsHint: 'JPEG, PNG ou WebP, {mo} Mo maximum.',
  replaceWarning:
    'Une nouvelle photo repasse par la relecture : la précédente reste affichée jusqu’à validation.',

  // Retours
  uploadSuccess: 'Photo envoyée. Elle sera relue avant publication.',
  removeSuccess: 'Photo retirée.',

  // Erreurs — les codes viennent de l'API (utils/uploads/imageBytes.ts).
  errMissingData: 'Aucun fichier reçu.',
  errUnsupportedType: 'Format non accepté. Utilise un JPEG, un PNG ou un WebP.',
  errInvalidBase64: 'Fichier illisible. Réessaie avec une autre image.',
  errTooLarge: 'Fichier trop lourd : {mo} Mo maximum.',
  errContentMismatch:
    'Ce fichier n’est pas une image valide, malgré son extension.',
  errGeneric: 'Envoi impossible pour le moment. Réessaie dans un instant.',

  /* --- Collection et paquets --- */

  collectionTitle: 'Ma collection',
  collectionEmpty:
    'Aucune carte pour l’instant. Gagne un match pour recevoir ton premier paquet.',
  collectionCount: '{distinct} cartes différentes · {total} exemplaires',

  packsTitle: 'Mes paquets',
  packsNone: 'Aucun paquet à ouvrir.',
  packsUnopened_one: '{count} paquet à ouvrir',
  packsUnopened_other: '{count} paquets à ouvrir',
  packOpen: 'Ouvrir',
  packOpening: 'Ouverture…',
  packFromVictory: 'Gagné en match',
  packFromPurchase: 'Acheté',

  balance: '{count} pièces',
  buyBooster: 'Acheter un booster ({price} pièces)',
  buying: 'Achat…',
  buySuccess: 'Booster acheté. Il t’attend dans tes paquets.',
  errInsufficientFunds: 'Pièces insuffisantes : il t’en faut {price}.',
  errBalanceChanged: 'Ton solde a changé entre-temps. Réessaie.',
  errAlreadyOpened: 'Ce paquet est déjà ouvert.',
  errEmptyPool:
    'Aucune carte disponible pour l’instant — ton paquet reste intact.',

  // Raretés : mêmes paliers que les badges de la fiche joueuse.
  rarityCommon: 'Commune',
  rarityRare: 'Rare',
  rarityEpic: 'Épique',
  rarityLegendary: 'Légendaire',
  foil: 'Brillante',
  copies: '×{count}',
});
