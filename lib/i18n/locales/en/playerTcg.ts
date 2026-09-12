// lib/i18n/locales/en/playerTcg.ts
//
// Traductions ANGLAISES du namespace `playerTcg`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerTcg.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'My collectible card',

  intro:
    'Players have a card in the Women’s Cup TCG. You can add your photo to yours — or leave it out; your card exists either way.',

  consentTitle: 'What this means',
  consentPublic:
    'Your photo will be publicly visible on your card, and other players can obtain it by opening their packs.',
  consentModerated:
    'The team reviews it before it goes live. Until then, your card stays without a photo.',
  consentRevocable:
    'You can remove it whenever you like: it then disappears from cards already handed out, not just from future ones.',

  statusNone: 'No photo',
  statusPending: 'Awaiting review',
  statusApproved: 'Photo published',
  statusRejected: 'Photo declined',
  rejectedReason: 'Reason: {reason}',
  rejectedNoReason: 'No reason given.',

  choose: 'Choose a photo',
  replace: 'Replace photo',
  remove: 'Remove my photo',
  removing: 'Removing…',
  uploading: 'Uploading…',
  confirmRemove:
    'Remove your photo? It will also disappear from cards already handed out.',

  formatsHint: 'JPEG, PNG or WebP, {mo} MB maximum.',
  replaceWarning:
    'A new photo goes back through review: the current one stays visible until it is approved.',

  uploadSuccess: 'Photo uploaded. It will be reviewed before publication.',
  removeSuccess: 'Photo removed.',

  errMissingData: 'No file received.',
  errUnsupportedType: 'Unsupported format. Use a JPEG, PNG or WebP.',
  errInvalidBase64: 'Unreadable file. Try another image.',
  errTooLarge: 'File too large: {mo} MB maximum.',
  errContentMismatch: 'This file is not a valid image, despite its extension.',
  errGeneric: 'Upload failed for now. Try again in a moment.',

  /* --- Collection and packs --- */

  collectionTitle: 'My collection',
  collectionEmpty: 'No cards yet. Win a match to receive your first pack.',
  collectionCount: '{distinct} different cards · {total} copies',

  packsTitle: 'My packs',
  packsNone: 'No pack to open.',
  packsUnopened_one: '{count} pack to open',
  packsUnopened_other: '{count} packs to open',
  packOpen: 'Open',
  packOpening: 'Opening…',
  packFromVictory: 'Won in a match',
  packFromPurchase: 'Purchased',

  balance: '{count} coins',
  buyBooster: 'Buy a booster ({price} coins)',
  buying: 'Buying…',
  buySuccess: 'Booster purchased. It is waiting in your packs.',
  errInsufficientFunds: 'Not enough coins: you need {price}.',
  errBalanceChanged: 'Your balance changed in the meantime. Try again.',
  errAlreadyOpened: 'This pack is already open.',
  errEmptyPool: 'No card available right now — your pack is untouched.',

  rarityCommon: 'Common',
  rarityRare: 'Rare',
  rarityEpic: 'Epic',
  rarityLegendary: 'Legendary',
  foil: 'Foil',
  copies: '×{count}',
};
