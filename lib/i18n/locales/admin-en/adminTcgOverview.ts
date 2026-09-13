// lib/i18n/locales/admin-en/adminTcgOverview.ts
//
// Traductions ANGLAISES du namespace `adminTcgOverview`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTcgOverview.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le
// typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  tabLabel: 'TCG economy',
  heading: 'TCG economy',
  subtitle: 'What is in circulation: packs, coins, cards and consents.',
  generatedAt: 'Measured at {time}',
  loadError: 'Could not load the economy overview.',
  retry: 'Retry',
  emptyTitle: 'The economy has not started yet',
  emptyDescription:
    'No pack handed out, no coin in circulation. Counters appear with the first win.',
  truncatedNotice: 'Total computed from a capped read: it is understated.',

  packsTitle: 'Packs',
  packsGranted: 'Handed out',
  packsOpened: 'Opened',
  packsOpenedHint: '{percent}% of packs',
  packsPending: 'Never opened',
  packsFromVictory: 'Earned (win)',
  packsFromPurchase: 'Purchased',

  coinsTitle: 'Coins',
  coinsInCirculation: 'In circulation',
  coinsInCirculationHint: 'Earned by playing, never bought.',
  coinsWallets: 'Active wallets',
  coinsEarned: 'Total earned',
  coinsSpent: 'Total spent',
  coinsBoosterPrice: 'Booster price:',

  cardsTitle: 'Cards',
  cardsTotal: 'Owned',
  cardsFoil: 'Foil',
  cardsFoilHint: '{percent}% of owned cards',
  cardsRecycled: 'Recycled',
  cardsRecycledHint: '{percent}% of everything drawn',
  cardsDrawn: 'Drawn overall',
  rarity: {
    common: 'Common',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
  },

  photosTitle: 'Photos and consent',
  photosPending: 'To review',
  photosApproved: 'Approved',
  photosRejected: 'Declined',
  photosOptedIn: 'Active consents',
  photosRevoked: 'Withdrawn consents',
  photosReviewCta: 'Open the queue',

  topSubjectsTitle: 'Most distributed subjects',
  topSubjectsEmpty: 'No card distributed yet.',
  topSubjectsCopies: '{count} copies',
  topSubjectsFoil: 'incl. {count} foil',
  kindPlayer: 'Player',
  kindTeam: 'Team',
  kindMap: 'Map',
  unknownSubject: 'Unknown subject',

  overlayHeading: 'OBS overlay',
  overlaySubtitle:
    'Announces cards won, live. Paste into a “Browser” source in OBS or Streamlabs.',
  overlayNone: 'No overlay link for this space.',
  overlayCreatedAt: 'Created {date}',
  overlayLastUsedAt: 'Last called: {date}',
  overlayNeverUsed: 'Never used',
  overlayReveal: 'Show',
  overlayHide: 'Hide',
  overlayCopy: 'Copy',
  overlayCopied: 'Link copied',
  overlayCreate: 'Create link',
  overlayRotate: 'Regenerate',
  overlayRotateWarning:
    'The current link stops working immediately: an overlay already set up in OBS goes silent until you paste the new link. Do this if the link has been shared.',
  overlayRevoke: 'Revoke',
  overlayRevokeWarning:
    'The overlay stops working and no new link is created. You can issue one later.',
  overlayWorking: 'Working…',
  overlayLoadError: 'Could not read the overlay link.',
  overlaySaveError: 'The operation failed, please try again.',
  overlayObsHint:
    'Anyone with this link sees the announcements. It shows only the Twitch username and the event — never the site account name.',
};
