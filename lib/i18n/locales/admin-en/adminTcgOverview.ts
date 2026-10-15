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
  packsOpenRateHint: '{percent}% opened',
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
  coinsSourceMatchLoss: 'Match losses',
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
  coinsSourceMatchPrediction: 'Correct predictions',
  coinsSourcePublicMvp: "Viewers' MVP",
  coinsSourceTournamentParticipation: 'Participation (DNF)',
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
  kindFanart: 'Fan art',
  kindAssociation: 'L’association',
  kindMascot: 'Mascot',
  kindHero: 'Hero',
  unknownSubject: 'Unknown subject',

  overlayMovedNotice:
    'The Twitch drop is managed in the Rewards tab, and its on-stream announcements in the alert box settings.',
  overlayMovedLink: 'Broadcast › Overlays',

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
