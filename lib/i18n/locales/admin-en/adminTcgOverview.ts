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
  packsFromWelcome: 'Welcome gift',
  packsFromDrop: 'Live drops',
  packsFromPlacement: 'Tournament placement',
  packsFromStreak: 'Check-in streaks',

  coinsTitle: 'Coins',
  coinsInCirculation: 'In circulation',
  coinsInCirculationHint: 'Earned by playing, never bought.',
  coinsWallets: 'Active wallets',
  coinsEarned: 'Total earned',
  coinsSpent: 'Total spent',
  coinsBoosterPrice: 'Booster price:',

  coinsBySourceTitle: 'Where gains come from',
  coinsBySourceEmpty: 'No gain recorded.',
  coinsSourceMatchWin: 'Match wins',
  coinsSourceScrimWin: 'Scrim wins',
  coinsSourceTwitchDrop: 'Live drops',
  coinsSourceWelcomeGift: 'Welcome gifts',
  coinsSourceCardRecycled: 'Recycled duplicates',
  coinsSourceAdminGrant: 'Team adjustments',
  coinsSourceSupporterWelcome: 'Supporter welcome',
  coinsSourceCheckinStreak: 'Check-in streaks',
  coinsSourceTournamentPlacement: 'Tournament placement',
  coinsSourceBattlenetVerified: 'Verified Battle.net accounts',
  coinsSourceCollectionSet: 'Completed sets',
  coinsSourceUnknown: 'Other ({kind})',

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

  themeHeading: 'Overlay appearance',
  themeSubtitle:
    'The preview below is the real OBS render, not a mock-up: what you see there is what the stream will show.',
  themePreviewTitle: 'Preview',
  themeAccent: 'Accent colour',
  themePosition: 'Anchor corner in the scene',
  themePosTopLeft: 'Top left',
  themePosTopRight: 'Top right',
  themePosBottomLeft: 'Bottom left',
  themePosBottomRight: 'Bottom right',
  themeDropLine: 'Wording for a drop',
  themeWinLine: 'Wording for a win',
  themeLinePlaceholder: '{name} claims a card',
  themeLineHint:
    '{name} is replaced by the Twitch username. Leave empty for the default, translated wording.',
  themeMedia: 'Image or video',
  themeMediaHint:
    'PNG, JPEG or WebP (2 MB), MP4 or WebM (8 MB). Replaces the star before the wording. A video plays muted and looped.',
  themeMediaChoose: 'Choose a file',
  themeMediaRemove: 'Remove',
  themeSaving: 'Saving…',
  themeSaved: 'Appearance saved.',
  themeLoadError: 'Could not read the appearance.',
  themeSaveError: 'Saving failed, please try again.',
  themeErrUnsupportedType:
    'Unsupported format. Use a PNG, JPEG, WebP, MP4 or WebM.',
  themeErrTooLarge: 'File too large.',
  themeErrContentMismatch:
    'This file is not the type it claims: its contents do not match.',
  themeErrInvalidColor: 'Invalid colour.',

  themePreviewDropEyebrow: 'Drop',
  themePreviewWinEyebrow: 'Win',
  themePreviewDropLine: '{name} claims a card',
  themePreviewWinLine: '{name} wins a pack',
  themePreviewName: 'A player',

  giftHeading: 'Welcome gift',
  giftSubtitle:
    'Credits every player entered in the current edition. An opened pack cannot be taken back: the count is announced before the hand-out.',
  giftEligible: '{count} player(s) with an account',
  giftAlreadyGifted: '{count} already received the gift',
  giftTeams: 'Across the rosters of {teams} entered team(s)',
  giftReward: 'Each receives {packs} pack and {coins} coins',
  giftNoTournament: 'No current edition: nothing to hand out.',
  giftNothingToDo: 'Everyone has already received the gift.',
  giftReplayHint:
    'Running it again is safe: only players who joined since the last hand-out will be credited.',
  giftGrant: 'Hand out',
  giftGranting: 'Handing out…',
  giftConfirmTitle: 'Hand out the welcome gift?',
  giftConfirmBody:
    '{count} account(s) will be credited. This is immediate and final: an opened pack cannot be taken back.',
  giftGranted: '{granted} account(s) credited.',
  // The 2026-09-14 case: coins written, packs refused by a constraint. The gap
  // has to be readable on screen, not only in the logs.
  giftPartial:
    '{granted} account(s) credited but only {packsGranted} pack(s) handed out. The coins will not be replayed: read the server logs before running it again.',
  giftLoadError: 'Could not read the welcome gift status.',
  giftGrantError: 'The hand-out failed, please try again.',
};
