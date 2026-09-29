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
    'A new photo goes back through review: while it is pending, your card no longer shows the previous one.',

  uploadSuccess: 'Photo uploaded. It will be reviewed before publication.',
  removeSuccess: 'Photo removed.',

  errMissingData: 'No file received.',
  errUnsupportedType: 'Unsupported format. Use a JPEG, PNG or WebP.',
  errInvalidBase64: 'Unreadable file. Try another image.',
  errTooLarge: 'File too large: {mo} MB maximum.',
  errContentMismatch: 'This file is not a valid image, despite its extension.',
  errGeneric: 'Upload failed for now. Try again in a moment.',
  errNoPlayerProfile:
    'This account has no player profile: your photo would not appear on any card. Log in with your team account.',
  noProfileTitle: 'No card for this account',
  noProfileBody:
    'This account has no player profile in the tournament, so there is no card to illustrate. If you play on a team, log in with the account you use for your team (often Discord) to upload your photo.',

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
  packFromWelcome: 'Welcome gift',

  balance: '{count} coins',
  balanceLabel: 'Balance',
  buyBoosterShort: 'Buy a booster',
  earnHint: '{match} coins per match win, {scrim} per ranked scrim win.',
  earnHintWithDrop:
    '{match} coins per match win, {scrim} per ranked scrim win, {drop} per card claimed on stream.',
  buyBooster: 'Buy a booster ({price} coins)',
  buying: 'Buying…',
  buySuccess: 'Booster purchased. It is waiting in your packs.',
  errInsufficientFunds: 'Not enough coins: you need {price}.',
  errBalanceChanged: 'Your balance changed in the meantime. Try again.',
  errAlreadyOpened: 'This pack is already open.',
  errEmptyPool: 'No card available right now — your pack is untouched.',

  revealTitle: 'Your pack',
  revealSubtitle: 'The cards you just pulled.',
  revealDismiss: 'Close',
  revealAll: 'Reveal all',
  revealNewCard: 'New',

  walletTitle: 'My coins',
  walletShow: 'View history',
  walletHide: 'Hide history',
  walletEmpty: 'No movement yet.',
  walletTruncated: 'Only the last {count} movements are shown.',
  progressTitle: 'Your progress',
  progressCount_one: '{owned} card of {pool}',
  progressCount_other: '{owned} cards of {pool}',
  progressPercent: '{percent}% of the collection',
  progressCopies_one: '{count} copy, duplicates included',
  progressCopies_other: '{count} copies, duplicates included',
  progressAria: 'Your collection progress',
  progressByRarity: 'By rarity',
  progressRarityCount: '{owned} / {pool}',
  progressComplete: 'Collection complete. You have them all.',

  recycleAction: 'Recycle a duplicate (+{refund})',
  recycleConfirmTitle: 'Recycle a duplicate?',
  recycleConfirmBody:
    'One copy of this card will be removed from your collection for {refund} coins. The least valuable copy goes, and you keep the rest. This is final.',
  recycleConfirmYes: 'Recycle',
  recycleConfirmNo: 'Cancel',
  recycling: 'Recycling…',
  recycleSuccess: 'Duplicate recycled: +{refund} coins.',
  errNotADuplicate: 'This is your only copy of that card.',
  errAlreadyRecycled: 'That card has already been recycled.',

  walletMatchWin: 'Match win',
  walletScrimWin: 'Scrim win',
  walletBoosterPurchase: 'Booster purchase',
  walletAdminGrant: 'Adjusted by the team',
  walletCardRecycled: 'Duplicate recycled',
  walletTwitchDrop: 'Card claimed on stream',
  walletUnknownSource: 'Movement',

  rarityCommon: 'Common',
  rarityRare: 'Rare',
  rarityEpic: 'Epic',
  rarityLegendary: 'Legendary',
  forgeTitle: 'The forge',
  forgeIntro:
    'Trade {count} duplicates of the same rarity for a player card one tier up that you do not own yet. Cost: {price} coins on top of the cards.',
  forgeTier: '{from} → {to}',
  forgeCta: 'Forge a {rarity} card',
  forgeBusy: 'Forging…',
  forgePickMore: '{count} more card(s) to pick.',
  forgeNoFunds: 'Not enough coins.',
  forgeDone: '{rarity} card forged!',
  forgeFailed: 'The forge failed. Try again in a moment.',
  cosmeticTitle: 'Dress up my showcase',
  cosmeticIntro:
    'A frame and a background for the three cards you show on your profile. You buy once; changing or removing a look costs nothing.',
  cosmeticFrames: 'Frames',
  cosmeticBackgrounds: 'Backgrounds',
  cosmeticEquip: 'Equip',
  cosmeticUnequip: 'Remove',
  cosmeticBought: 'Look unlocked.',
  cosmeticFailed: 'That did not work. Try again in a moment.',
  previewTitle: 'Here is how it will look',
  previewHint:
    'Nothing is sent until you confirm. You can replace or remove it at any time, even after approval.',
  previewSend: 'Send this photo',
  previewDiscard: 'Cancel',
  previewPickAnother: 'Pick another photo',
  inviteTitle: 'Your card has no photo yet',
  inviteBody:
    'Your card exists without one — but the photo is what makes it a card. Reviewed by the team before publication, replaceable and removable at any time.',
  inviteCta: 'Add my photo',
  inviteLater: 'Later',
  exclusionTitle: 'Stay out of the TCG',
  exclusionWhatGoes:
    'You leave the draw: no pack can contain your card any more, and your photo is deleted.',
  exclusionWhatStays:
    'Cards already drawn stay in other people’s collections, but become anonymous — no name, no photo, no figurine.',
  exclusionReversible:
    'Reversible at any time. Your photo does not come back: it will have been deleted.',
  exclusionCta: 'Remove me from the TCG',
  exclusionConfirmTitle: 'Leave the TCG?',
  exclusionConfirmBody:
    'You leave the draw and your photo is deleted. Cards already drawn stay with whoever has them, but with nothing identifying you. You can come back whenever you want.',
  exclusionConfirmCta: 'Remove me',
  exclusionDone: 'Done: you no longer appear in the TCG.',
  exclusionUndone: 'You are back in the TCG.',
  exclusionActive:
    'You do not appear in the TCG. No pack can draw you, and cards already drawn are anonymous.',
  exclusionRejoin: 'Come back to the TCG',
  foil: 'Foil',
  copies: '×{count}',
  logoCredit: 'Logo by {artist}',
  cardAssociation: 'The association',
  roleTank: 'Tank',
  roleDamage: 'Damage',
  roleSupport: 'Support',

  /* --- UX / accessibility pass (2026-09-15) --- */

  loadErrorTitle: 'Your collection could not be loaded right now.',
  loadErrorBody: 'Your cards and coins are not lost: only the loading failed.',
  retry: 'Try again',
  loadingCollection: 'Loading your collection…',
  loadMoreError: 'The next part could not be loaded. Try again.',

  collectionLoadMore: 'Show more cards',
  collectionLoadingMore: 'Loading…',
  collectionShown: '{shown} of {distinct} cards shown',
  packsLoadMore: 'Show other packs',

  collectionEmptyWithPacks_one:
    'Your collection is still empty, but a pack is waiting for you just above.',
  collectionEmptyWithPacks_other:
    'Your collection is still empty, but {count} packs are waiting for you just above.',
  collectionEmptyGoToPacks: 'Go to my packs',
  collectionEmptyGuide: 'How to earn cards',

  revealDuplicate: 'Duplicate',
  revealSummary_none: 'No new card this time — only duplicates to recycle.',
  revealSummary_one: '1 new card out of {count}.',
  revealSummary_other: '{fresh} new cards out of {count}.',
  revealDuplicateHint:
    'Duplicates can be recycled from your collection: +{refund} coins per copy, and you always keep the best one.',
  revealAnnounce: 'Pack opened. {cards}',
  revealAnnounceCard: '{name}, {rarity}',
  revealAnnounceNew: 'new',
  revealAnnounceDuplicate: 'duplicate',
  revealAnnounceFoil: 'foil',
  revealUnnamed: 'Unnamed card',

  recycleAria: 'Recycle a duplicate of {name}, +{refund} coins',
  recycleConfirmTitleNamed: 'Recycle a duplicate of {name}?',
  recycleConfirmGain: 'You receive',
  recycleConfirmBalance: 'Your balance',
  recycleConfirmKeep_one: 'You will have 1 copy left.',
  recycleConfirmKeep_other: 'You will have {count} copies left.',
  recycleConfirmWhich:
    'The least valuable copy goes: your card keeps its best rarity. This is final.',
  recycleConfirmEngaged:
    'This copy is promised in a pending trade: recycling it will cancel that trade when your partner tries to accept it.',
  recycleConfirmEngagedOther_one:
    'Another copy is promised in a pending trade: it is not affected by this recycling.',
  recycleConfirmEngagedOther_other:
    '{count} other copies are promised in pending trades: they are not affected by this recycling.',
  tradesPendingBadge_one: '1 pending trade offer',
  tradesPendingBadge_other: '{count} pending trade offers',

  walletLoading: 'Loading history…',
  walletError: 'History unavailable right now.',
  walletWelcomeGift: 'Welcome gift',
  walletSupporterWelcome: 'Supporter welcome gift',
  packFromDrop: 'Claimed on stream',
  packFromPlacement: 'Tournament placement',
  packFromStreak: 'Check-in streak',
  walletCheckinStreak: 'Check-in streak',
  walletTournamentPlacement: 'Tournament placement',
  walletBattlenetVerified: 'Battle.net account verified',
  walletCollectionSet: 'Set completed',
  walletMatchPrediction: 'Correct prediction',

  twitchPitchTitle: 'Earn coins by watching our streams',
  twitchPitchBody:
    'During a Twitch stream, every card you claim with your channel points earns you {drop} coins. Link your account once, and they land here on their own.',
  twitchEarnLink: 'Link Twitch',

  guideLink: 'How does it work?',

  collectionTileAria: 'View the {name} card ({rarity})',
  collectionDetailClose: 'Close card',
};
